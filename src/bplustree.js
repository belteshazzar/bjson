/**
 * BPlusTree - Persistent immutable B+ tree with BJsonFile storage
 * 
 * Usage pattern:
 *   const tree = new BPlusTree('tree.bjson');
 *   await tree.open();
 *   await tree.add(key, value);
 *   await tree.close();
 */

import { BJsonFile, Pointer } from './bjson.js';

/**
 * Node for persistent storage
 * @private
 */
class NodeData {
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
        for (let v of children) {
            if (!(v instanceof Pointer)) {
                throw new Error('Children must be Pointer objects');
            }
        }
        this.next = next;
    }
}

/**
 * Persistent immutable B+ tree with append-only file storage
 */
export class BPlusTree {
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
        const rootNode = new NodeData(0, true, [], [], [], null);
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
            maxEntries: this.order,  // Renamed to match RTree size
            minEntries: this.minKeys,  // Renamed to match RTree size
            size: this._size,
            rootPointer: this.rootPointer,
            nextId: this.nextNodeId  // Renamed to match RTree size
        };

        await this.file.append(metadata);
    }

    /**
     * Load metadata from file
     */
    async _loadMetadata() {
        const fileSize = await this.file.getFileSize();
        // Metadata object has 6 INT fields (now encoded as 8-byte ints) plus keys
        const METADATA_SIZE = 135;
        
        if (fileSize < METADATA_SIZE) {
            throw new Error('Invalid tree file');
        }

        const metadataOffset = fileSize - METADATA_SIZE;
        const metadata = await this.file.read(metadataOffset);

        if (!metadata || typeof metadata.maxEntries === 'undefined') {
            throw new Error(`Failed to read metadata: missing required fields`);
        }

        this.order = metadata.maxEntries;
        this.minKeys = metadata.minEntries;
        this._size = metadata.size;
        this.nextNodeId = metadata.nextId;
        this.rootPointer = metadata.rootPointer;
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

        const data = await this.file.read(pointer);
        return new NodeData(
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
            // Split occurred - save the split nodes and create new root with pointers
            const leftPointer = await this._saveNode(result.left);
            const rightPointer = await this._saveNode(result.right);
            newRoot = new NodeData(
                this.nextNodeId++,
                false,
                [result.splitKey],
                [],
                [leftPointer, rightPointer],
                null
            );
        }

        const rootPointer = await this._saveNode(newRoot);
        this.rootPointer = rootPointer;

        this._size++;
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
                    newNode: new NodeData(node.id, true, keys, values, [], null)
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
                    newNode: new NodeData(node.id, true, keys, values, [], null)
                };
            } else {
                const mid = Math.ceil(keys.length / 2);
                const leftKeys = keys.slice(0, mid);
                const leftValues = values.slice(0, mid);
                const rightKeys = keys.slice(mid);
                const rightValues = values.slice(mid);

                const rightNode = new NodeData(this.nextNodeId++, true, rightKeys, rightValues, [], null);
                const leftNode = new NodeData(node.id, true, leftKeys, leftValues, [], null);

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
                    newNode: new NodeData(node.id, false, keys, [], children, null)
                };
            } else {
                const leftPointer = await this._saveNode(result.left);
                const rightPointer = await this._saveNode(result.right);

                keys.splice(childIdx, 0, result.splitKey);
                children.splice(childIdx, 1, leftPointer, rightPointer);

                if (keys.length < this.order) {
                    return {
                        newNode: new NodeData(node.id, false, keys, [], children, null)
                    };
                } else {
                    const mid = Math.ceil(keys.length / 2) - 1;
                    const splitKey = keys[mid];
                    const leftKeys = keys.slice(0, mid);
                    const rightKeys = keys.slice(mid + 1);
                    const leftChildren = children.slice(0, mid + 1);
                    const rightChildren = children.slice(mid + 1);

                    const leftNode = new NodeData(node.id, false, leftKeys, [], leftChildren, null);
                    const rightNode = new NodeData(this.nextNodeId++, false, rightKeys, [], rightChildren, null);

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

        this._size--;
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

            return new NodeData(node.id, true, newKeys, newValues, [], node.next);
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

            return new NodeData(node.id, false, [...node.keys], [], newChildren, null);
        }
    }

    /**
     * Get all entries as array
     */
    async toArray() {
        const result = [];
        await this._collectAllEntries(await this._loadRoot(), result);
        return result;
    }

    /**
     * Collect all entries in sorted order by traversing tree
     * @private
     */
    async _collectAllEntries(node, result) {
        if (node.isLeaf) {
            for (let i = 0; i < node.keys.length; i++) {
                result.push({
                    key: node.keys[i],
                    value: node.values[i]
                });
            }
        } else {
            for (const childPointer of node.children) {
                const child = await this._loadNode(childPointer);
                await this._collectAllEntries(child, result);
            }
        }
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
        await this._rangeSearchNode(await this._loadRoot(), minKey, maxKey, result);
        return result;
    }

    /**
     * Range search helper that traverses tree
     * @private
     */
    async _rangeSearchNode(node, minKey, maxKey, result) {
        if (node.isLeaf) {
            for (let i = 0; i < node.keys.length; i++) {
                if (node.keys[i] >= minKey && node.keys[i] <= maxKey) {
                    result.push({
                        key: node.keys[i],
                        value: node.values[i]
                    });
                }
            }
        } else {
            for (const childPointer of node.children) {
                const child = await this._loadNode(childPointer);
                await this._rangeSearchNode(child, minKey, maxKey, result);
            }
        }
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

    /**
     * Compact the tree into a new file by copying only the current live nodes.
     * Returns size metrics so callers can see how much space was reclaimed.
     * @param {string} destinationFilename - New file to write the compacted tree into
     * @returns {Promise<{oldSize:number,newSize:number,bytesSaved:number,newFilename:string}>}
     */
    async compact(destinationFilename) {
        if (!this.isOpen) {
            throw new Error('Tree file is not open');
        }
        if (!destinationFilename) {
            throw new Error('Destination filename is required for compaction');
        }

        // Make sure the current file has up-to-date metadata before measuring size
        await this._saveMetadata();
        const oldSize = await this.file.getFileSize();

        // Rebuild a fresh tree with only the live entries
        const entries = await this.toArray();
        const newTree = new BPlusTree(destinationFilename, this.order);
        await newTree.open();
        for (const entry of entries) {
            await newTree.add(entry.key, entry.value);
        }
        await newTree.close();

        // Measure new file size after metadata has been written on close
        const tempFile = new BJsonFile(destinationFilename);
        await tempFile.open('r');
        const newSize = await tempFile.getFileSize();
        await tempFile.close();

        return {
            oldSize,
            newSize,
            bytesSaved: Math.max(0, oldSize - newSize),
            newFilename: destinationFilename
        };
    }
}
