/**
 * PersistentImmutableBPlusTree - Persistent variant with BJsonFile storage
 * 
 * This extends the immutable B+ tree concept to provide durable on-disk storage
 * using append-only BJsonFile records.
 * 
 * File format (append-only BJsonFile):
 * - All nodes are stored as bjson records in the file
 * - Node references use Pointer objects for file offsets
 * - Metadata stored at end of file containing tree state
 * 
 * Usage pattern:
 *   const tree = new PersistentImmutableBPlusTree('tree.bjson');
 *   await tree.open();
 *   await tree.add(key, value);
 *   await tree.close();
 */

import { BJsonFile, Pointer } from './bjson.js';

/**
 * Node for persistent storage
 * @private
 */
class PersistentNodeData {
    /**
     * Creates a node data object for serialization
     * @param {number} id - Unique node ID
     * @param {boolean} isLeaf - Leaf flag
     * @param {Array} keys - Key array
     * @param {Array} values - Value array (leaf nodes)
     * @param {Array} children - Child pointers (internal nodes)
     * @param {Pointer} next - Pointer to next leaf
     */
    constructor(id, isLeaf, keys, values, children, next) {
        this.id = id;
        this.isLeaf = isLeaf;
        this.keys = keys;
        this.values = values;
        this.children = children;
        this.next = next;
    }
}

/**
 * Persistent immutable B+ tree with append-only file storage
 */
export class PersistentImmutableBPlusTree {
    /**
     * Creates a new persistent B+ tree
     * @param {string} filename - Path to storage file
     * @param {number} order - Tree order (default: 3)
     */
    constructor(filename, order = 3) {
        if (order < 3) {
            throw new Error('B+ tree order must be at least 3');
        }
        this.filename = filename;
        this.order = order;
        this.minKeys = Math.ceil(order / 2) - 1;
        
        this.file = new BJsonFile(filename);
        this.isOpen = false;
        
        // Metadata
        this.rootPointer = null;
        this.nextNodeId = 0;
        this._size = 0;
    }

    /**
     * Open the tree file (create if doesn't exist)
     */
    async open() {
        if (this.isOpen) {
            throw new Error('Tree file is already open');
        }

        const exists = await this.file.exists();

        if (exists) {
            await this.file.open('rw');
            await this._loadMetadata();
        } else {
            await this.file.open('rw');
            await this._initializeNewTree();
        }

        this.isOpen = true;
    }

    /**
     * Close the tree file and save metadata
     */
    async close() {
        if (this.isOpen) {
            await this._saveMetadata();
            await this.file.close();
            this.isOpen = false;
        }
    }

    /**
     * Initialize a new empty tree
     */
    async _initializeNewTree() {
        const rootNode = new PersistentNodeData(0, true, [], [], [], null);
        this.nextNodeId = 1;
        this._size = 0;

        const rootPointer = await this._saveNode(rootNode);
        this.rootPointer = rootPointer;

        await this._saveMetadata();
    }

    /**
     * Save metadata to file
     */
    async _saveMetadata() {
        const metadata = {
            version: 1,
            order: this.order,
            minKeys: this.minKeys,
            size: this._size,
            rootPointer: this.rootPointer ? this.rootPointer.valueOf() : null,
            nextNodeId: this.nextNodeId
        };

        await this.file.append(metadata);
    }

    /**
     * Load metadata from file
     */
    async _loadMetadata() {
        const fileSize = await this.file.getFileSize();
        const METADATA_SIZE = 115; // Estimated size
        
        if (fileSize < METADATA_SIZE) {
            throw new Error('Invalid tree file');
        }

        const metadataOffset = fileSize - METADATA_SIZE;
        const metadata = await this.file.read(metadataOffset);

        this.order = metadata.order;
        this.minKeys = metadata.minKeys;
        this._size = metadata.size;
        this.nextNodeId = metadata.nextNodeId;
        this.rootPointer = metadata.rootPointer !== null && metadata.rootPointer !== undefined
            ? new Pointer(metadata.rootPointer)
            : null;
    }

    /**
     * Save a node to disk
     */
    async _saveNode(node) {
        const offset = await this.file.getFileSize();
        await this.file.append(node);
        return new Pointer(offset);
    }

    /**
     * Load a node from disk
     */
    async _loadNode(pointer) {
        if (!(pointer instanceof Pointer)) {
            throw new Error('Expected Pointer object');
        }

        const data = await this.file.read(pointer.valueOf());
        return new PersistentNodeData(
            data.id,
            data.isLeaf,
            data.keys,
            data.values,
            data.children,
            data.next
        );
    }

    /**
     * Load root node
     */
    async _loadRoot() {
        return await this._loadNode(this.rootPointer);
    }

    /**
     * Search for a key
     */
    async search(key) {
        const root = await this._loadRoot();
        return this._searchNode(root, key);
    }

    /**
     * Internal search
     */
    async _searchNode(node, key) {
        if (node.isLeaf) {
            for (let i = 0; i < node.keys.length; i++) {
                if (key === node.keys[i]) {
                    return node.values[i];
                }
            }
            return undefined;
        } else {
            let i = 0;
            while (i < node.keys.length && key >= node.keys[i]) {
                i++;
            }
            const child = await this._loadNode(node.children[i]);
            return this._searchNode(child, key);
        }
    }

    /**
     * Insert a key-value pair
     */
    async add(key, value) {
        const root = await this._loadRoot();
        const result = await this._addToNode(root, key, value);

        let newRoot;
        if (result.newNode) {
            newRoot = result.newNode;
        } else {
            newRoot = new PersistentNodeData(
                this.nextNodeId++,
                false,
                [result.splitKey],
                [],
                [result.left, result.right]
            );
        }

        const rootPointer = await this._saveNode(newRoot);
        this.rootPointer = rootPointer;

        await this._rebuildNextPointers(newRoot);

        this._size++;
        await this._saveMetadata();
    }

    /**
     * Internal add
     */
    async _addToNode(node, key, value) {
        if (node.isLeaf) {
            const keys = [...node.keys];
            const values = [...node.values];

            const existingIdx = keys.indexOf(key);
            if (existingIdx !== -1) {
                values[existingIdx] = value;
                return {
                    newNode: new PersistentNodeData(node.id, true, keys, values, [], null)
                };
            }

            let insertIdx = 0;
            while (insertIdx < keys.length && key > keys[insertIdx]) {
                insertIdx++;
            }
            keys.splice(insertIdx, 0, key);
            values.splice(insertIdx, 0, value);

            if (keys.length < this.order) {
                return {
                    newNode: new PersistentNodeData(node.id, true, keys, values, [], null)
                };
            } else {
                const mid = Math.ceil(keys.length / 2);
                const leftKeys = keys.slice(0, mid);
                const leftValues = values.slice(0, mid);
                const rightKeys = keys.slice(mid);
                const rightValues = values.slice(mid);

                const rightNode = new PersistentNodeData(this.nextNodeId++, true, rightKeys, rightValues, [], null);
                const leftNode = new PersistentNodeData(node.id, true, leftKeys, leftValues, [], null);

                return {
                    left: leftNode,
                    right: rightNode,
                    splitKey: rightKeys[0]
                };
            }
        } else {
            const keys = [...node.keys];
            const children = [...node.children];

            let childIdx = 0;
            while (childIdx < keys.length && key >= keys[childIdx]) {
                childIdx++;
            }

            const childNode = await this._loadNode(children[childIdx]);
            const result = await this._addToNode(childNode, key, value);

            if (result.newNode) {
                const newChildPointer = await this._saveNode(result.newNode);
                children[childIdx] = newChildPointer;
                return {
                    newNode: new PersistentNodeData(node.id, false, keys, [], children)
                };
            } else {
                const leftPointer = await this._saveNode(result.left);
                const rightPointer = await this._saveNode(result.right);

                keys.splice(childIdx, 0, result.splitKey);
                children.splice(childIdx, 1, leftPointer, rightPointer);

                if (keys.length < this.order) {
                    return {
                        newNode: new PersistentNodeData(node.id, false, keys, [], children)
                    };
                } else {
                    const mid = Math.ceil(keys.length / 2) - 1;
                    const splitKey = keys[mid];
                    const leftKeys = keys.slice(0, mid);
                    const rightKeys = keys.slice(mid + 1);
                    const leftChildren = children.slice(0, mid + 1);
                    const rightChildren = children.slice(mid + 1);

                    const leftNode = new PersistentNodeData(node.id, false, leftKeys, [], leftChildren);
                    const rightNode = new PersistentNodeData(this.nextNodeId++, false, rightKeys, [], rightChildren);

                    return {
                        left: leftNode,
                        right: rightNode,
                        splitKey: splitKey
                    };
                }
            }
        }
    }

    /**
     * Delete a key
     */
    async delete(key) {
        const root = await this._loadRoot();
        const newRoot = await this._deleteFromNode(root, key);

        if (!newRoot) {
            return; // Key not found
        }

        let finalRoot = newRoot;
        if (finalRoot.keys.length === 0 && !finalRoot.isLeaf && finalRoot.children.length > 0) {
            finalRoot = await this._loadNode(finalRoot.children[0]);
        }

        const rootPointer = await this._saveNode(finalRoot);
        this.rootPointer = rootPointer;

        await this._rebuildNextPointers(finalRoot);

        this._size--;
        await this._saveMetadata();
    }

    /**
     * Internal delete
     */
    async _deleteFromNode(node, key) {
        if (node.isLeaf) {
            const keyIndex = node.keys.indexOf(key);

            if (keyIndex === -1) {
                return null;
            }

            const newKeys = [...node.keys];
            const newValues = [...node.values];
            newKeys.splice(keyIndex, 1);
            newValues.splice(keyIndex, 1);

            return new PersistentNodeData(node.id, true, newKeys, newValues, [], node.next);
        } else {
            let i = 0;
            while (i < node.keys.length && key >= node.keys[i]) {
                i++;
            }

            const childNode = await this._loadNode(node.children[i]);
            const newChild = await this._deleteFromNode(childNode, key);

            if (!newChild) {
                return null;
            }

            const newChildren = [...node.children];
            const newChildPointer = await this._saveNode(newChild);
            newChildren[i] = newChildPointer;

            return new PersistentNodeData(node.id, false, [...node.keys], [], newChildren);
        }
    }

    /**
     * Rebuild next pointers
     */
    async _rebuildNextPointers(root) {
        const leaves = [];
        await this._collectLeaves(root, leaves);

        for (let i = 0; i < leaves.length - 1; i++) {
            leaves[i].next = leaves[i + 1] ? new Pointer(leaves[i + 1].id) : null;
        }
        if (leaves.length > 0) {
            leaves[leaves.length - 1].next = null;
        }

        for (const leaf of leaves) {
            await this._saveNode(leaf);
        }
    }

    /**
     * Collect leaves
     */
    async _collectLeaves(node, leaves) {
        if (node.isLeaf) {
            leaves.push(node);
        } else {
            for (const childPointer of node.children) {
                const child = await this._loadNode(childPointer);
                await this._collectLeaves(child, leaves);
            }
        }
    }

    /**
     * Get all entries as array
     */
    async toArray() {
        const result = [];
        const root = await this._loadRoot();
        let current = await this._getFirstLeaf(root);

        while (current) {
            for (let i = 0; i < current.keys.length; i++) {
                result.push({
                    key: current.keys[i],
                    value: current.values[i]
                });
            }
            current = current.next ? await this._loadNode(current.next) : null;
        }

        return result;
    }

    /**
     * Get first leaf
     */
    async _getFirstLeaf(node) {
        if (node.isLeaf) {
            return node;
        }
        const firstChild = await this._loadNode(node.children[0]);
        return this._getFirstLeaf(firstChild);
    }

    /**
     * Get tree size
     */
    size() {
        return this._size;
    }

    /**
     * Check if empty
     */
    isEmpty() {
        return this._size === 0;
    }

    /**
     * Range search
     */
    async rangeSearch(minKey, maxKey) {
        const result = [];
        const root = await this._loadRoot();
        let current = await this._getFirstLeaf(root);

        while (current && current.keys[current.keys.length - 1] < minKey) {
            current = current.next ? await this._loadNode(current.next) : null;
        }

        while (current) {
            for (let i = 0; i < current.keys.length; i++) {
                if (current.keys[i] >= minKey && current.keys[i] <= maxKey) {
                    result.push({
                        key: current.keys[i],
                        value: current.values[i]
                    });
                } else if (current.keys[i] > maxKey) {
                    return result;
                }
            }
            current = current.next ? await this._loadNode(current.next) : null;
        }

        return result;
    }

    /**
     * Get tree height
     */
    async getHeight() {
        let height = 0;
        let current = await this._loadRoot();

        while (!current.isLeaf) {
            height++;
            current = await this._loadNode(current.children[0]);
        }

        return height;
    }
}
