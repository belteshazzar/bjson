import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import { BPlusTree } from '../src/bplustree.js';
import { BJsonFile } from '../src/bjson.js';

// Set up node-opfs for Node.js environment
let hasOPFS = false;
try {
  const nodeOpfs = await import('node-opfs');
  if (nodeOpfs.navigator && typeof global !== 'undefined') {
    Object.defineProperty(global, 'navigator', {
      value: nodeOpfs.navigator,
      writable: true,
      configurable: true
    });
    hasOPFS = true;
  }
} catch (e) {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.getDirectory) {
    hasOPFS = true;
  }
}

describe.skipIf(!hasOPFS)('BPlusTree Compaction', function() {
  let testFileCounter = 0;

  function getTestFilename() {
    return `test-bplustree-${Date.now()}-${testFileCounter++}.bjson`;
  }

  async function cleanupFile(filename) {
      const file = new BJsonFile(filename);
      if (await file.exists()) {
        await file.delete();
      }
  }

  let tree;
  let filename;
  let compactedFilename;

  beforeEach(async function() {
    filename = getTestFilename();
    compactedFilename = getTestFilename();
    tree = new BPlusTree(filename, 3);
    await tree.open();
  });

  afterEach(async function() {
    if (tree && tree.isOpen) {
      await tree.close();
    }
    await cleanupFile(filename);
    await cleanupFile(compactedFilename);
  });

  it('should compact the tree and reduce file size while preserving data', { timeout: 120000 }, async function() {
    for (let i = 0; i < 50; i++) {
      await tree.add(i, `value${i}`);
    }

    for (let i = 0; i < 20; i++) {
      await tree.delete(i);
    }

    for (let i = 50; i < 80; i++) {
      await tree.add(i, `value${i}`);
    }

    const result = await tree.compact(compactedFilename);

    expect(result.newFilename).toBe(compactedFilename);
    expect(result.oldSize).toBeGreaterThan(result.newSize);
    expect(result.bytesSaved).toBeGreaterThan(0);

    const originalEntries = await tree.toArray();

    const compactedTree = new BPlusTree(compactedFilename, 3);
    await compactedTree.open();
    const compactedEntries = await compactedTree.toArray();
    const spotCheck = await compactedTree.search(79);
    await compactedTree.close();

    expect(compactedEntries).toEqual(originalEntries);
    expect(spotCheck).toBe('value79');
  });
});
