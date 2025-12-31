import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { RTree } from '../src/rtree.js';
import { BJsonFile, ObjectId } from '../src/bjson.js';

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

describe.skipIf(!hasOPFS)('R-tree Compaction', function() {
  let testFileCounter = 0;

  function getTestFilename() {
    return `test-rtree-${Date.now()}-${testFileCounter++}.bjson`;
  }

  async function cleanupFile(filename) {
    try {
      const file = new BJsonFile(filename);
      if (await file.exists()) {
        await file.open('rw');
        await file.delete();
      }
    } catch (error) {
      // ignore cleanup errors
    }
  }

  let tree;
  let filename;
  let compactedFilename;

  beforeEach(async function() {
    filename = getTestFilename();
    compactedFilename = getTestFilename();
    tree = new RTree(filename, 4);
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
    const insertedIds = [];
    for (let i = 0; i < 120; i++) {
      const lat = -80 + Math.random() * 160;
      const lng = -170 + Math.random() * 340;
      const id = new ObjectId();
      insertedIds.push(id);
      await tree.insert(lat, lng, id);
    }

    const worldBox = { minLat: -90, maxLat: 90, minLng: -180, maxLng: 180 };
    const originalIds = (await tree.searchBBox(worldBox)).map(id => id.toString()).sort();
    expect(originalIds.length).toBe(insertedIds.length);

    const result = await tree.compact(compactedFilename);
    expect(result.newFilename).toBe(compactedFilename);
    expect(result.oldSize).toBeGreaterThan(result.newSize);
    expect(result.bytesSaved).toBeGreaterThan(0);

    const compactedTree = new RTree(compactedFilename, 4);
    await compactedTree.open();
    const compactedIds = (await compactedTree.searchBBox(worldBox)).map(id => id.toString()).sort();
    expect(compactedIds).toEqual(originalIds);
    expect(compactedTree.size()).toBe(tree.size());
    await compactedTree.close();
  });
});
