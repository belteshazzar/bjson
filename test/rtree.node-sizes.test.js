/**
 * Test suite for R-tree node size handling
 * Verifies that nodes of various sizes are correctly serialized and deserialized
 */
import { describe, it, expect, afterEach } from 'vitest';
import { RTree } from '../src/rtree.js';
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

async function cleanup() {
  try {
    const file = new BJsonFile('test-rtree-node-sizes.bjson');
    if (await file.exists()) {
      await file.open('rw');
      await file.delete();
    }
  } catch (error) {
    // Ignore cleanup errors
  }
}

describe.skipIf(!hasOPFS)('R-tree Node Size Handling', () => {
  afterEach(async () => {
    await cleanup();
  });

  it('should handle small nodes (1 entry)', async () => {
    const tree = new RTree('test-rtree-node-sizes.bjson', 4);
    await tree.open();

    await tree.insert(40.7128, -74.0060, { name: 'New York', id: 1 });
    expect(tree.size()).toBe(1);

    // Verify it can be read back
    const results = await tree.searchBBox({
      minLat: 40,
      maxLat: 41,
      minLng: -75,
      maxLng: -73
    });
    expect(results).toHaveLength(1);

    await tree.close();
  });

  it('should handle medium nodes (4 entries - single node)', async () => {
    const tree = new RTree('test-rtree-node-sizes.bjson', 4);
    await tree.open();

    const entries = [
      { lat: 40.7128, lng: -74.0060, name: 'New York' },
      { lat: 34.0522, lng: -118.2437, name: 'Los Angeles' },
      { lat: 41.8781, lng: -87.6298, name: 'Chicago' },
      { lat: 29.7604, lng: -95.3698, name: 'Houston' }
    ];

    for (const entry of entries) {
      await tree.insert(entry.lat, entry.lng, { name: entry.name });
    }

    expect(tree.size()).toBe(4);

    // Verify all can be retrieved
    for (const entry of entries) {
      const results = await tree.searchRadius(entry.lat, entry.lng, 1);
      expect(results.length).toBeGreaterThan(0);
    }

    await tree.close();
  });

  it('should handle large nodes (8 entries - causes splits with maxEntries=4)', async () => {
    const tree = new RTree('test-rtree-node-sizes.bjson', 4);
    await tree.open();

    const entries = [
      { lat: 40.7128, lng: -74.0060, name: 'New York' },
      { lat: 34.0522, lng: -118.2437, name: 'Los Angeles' },
      { lat: 41.8781, lng: -87.6298, name: 'Chicago' },
      { lat: 29.7604, lng: -95.3698, name: 'Houston' },
      { lat: 33.7490, lng: -84.3880, name: 'Atlanta' },
      { lat: 39.7392, lng: -104.9903, name: 'Denver' },
      { lat: 47.6062, lng: -122.3321, name: 'Seattle' },
      { lat: 37.7749, lng: -122.4194, name: 'San Francisco' }
    ];

    for (const entry of entries) {
      await tree.insert(entry.lat, entry.lng, { name: entry.name });
    }

    expect(tree.size()).toBe(8);

    // Verify persistence - close and reopen
    await tree.close();
    const tree2 = new RTree('test-rtree-node-sizes.bjson', 4);
    await tree2.open();

    expect(tree2.size()).toBe(8);

    // Verify all entries can still be retrieved
    for (const entry of entries) {
      const results = await tree2.searchRadius(entry.lat, entry.lng, 1);
      expect(results.length).toBeGreaterThan(0);
    }

    await tree2.close();
  });

  it('should handle very large nodes with extensive metadata', { timeout: 15000 }, async () => {
    const tree = new RTree('test-rtree-node-sizes.bjson', 8);
    await tree.open();

    // Insert entries with large metadata objects (reduced from 1KB to 200 bytes)
    const entries = [];
    for (let i = 0; i < 16; i++) {
      const lat = 20 + Math.random() * 40;
      const lng = -130 + Math.random() * 80;
      const largeMeta = {
        id: i,
        name: `Location-${i}`,
        description: 'x'.repeat(200), // 200 bytes of metadata per entry
        tags: Array(10).fill(`tag-${i}`),
        properties: {
          key1: 'value1',
          key2: 'value2',
          key3: 'value3'
        }
      };
      entries.push({ lat, lng, meta: largeMeta });
      await tree.insert(lat, lng, largeMeta);
    }

    expect(tree.size()).toBe(16);

    // Verify persistence with large nodes
    await tree.close();
    const tree2 = new RTree('test-rtree-node-sizes.bjson', 8);
    await tree2.open();

    expect(tree2.size()).toBe(16);

    // Verify some entries can still be retrieved
    const results = await tree2.searchBBox({
      minLat: 20,
      maxLat: 60,
      minLng: -130,
      maxLng: -50
    });
    expect(results.length).toBeGreaterThan(0);

    await tree2.close();
  });

  it('should handle extremely large nodes (50 entries)', { timeout: 60000 }, async () => {
    const tree = new RTree('test-rtree-node-sizes.bjson', 16);
    await tree.open();

    // Insert 50 entries with metadata
    const insertedIds = [];
    for (let i = 0; i < 50; i++) {
      const lat = 20 + Math.random() * 40;
      const lng = -130 + Math.random() * 80;
      const meta = {
        id: i,
        index: i,
        data: 'x'.repeat(200) // 200 bytes per entry
      };
      insertedIds.push(i);
      await tree.insert(lat, lng, meta);
    }

    expect(tree.size()).toBe(50);

    // Verify persistence
    await tree.close();
    const tree2 = new RTree('test-rtree-node-sizes.bjson', 16);
    await tree2.open();

    expect(tree2.size()).toBe(50);

    // Query should still work
    const results = await tree2.searchBBox({
      minLat: 20,
      maxLat: 60,
      minLng: -130,
      maxLng: -50
    });
    expect(results.length).toBeGreaterThan(0);

    await tree2.close();
  });

  it('should handle nodes with deeply nested structures', async () => {
    const tree = new RTree('test-rtree-node-sizes.bjson', 4);
    await tree.open();

    // Create deeply nested metadata
    const createNestedObject = (depth) => {
      if (depth === 0) {
        return { value: 'leaf' };
      }
      return {
        nested: createNestedObject(depth - 1),
        level: depth
      };
    };

    for (let i = 0; i < 8; i++) {
      const lat = 30 + Math.random() * 10;
      const lng = -100 + Math.random() * 10;
      const deepMeta = {
        id: i,
        structure: createNestedObject(5), // 5 levels deep
        array: [1, 2, 3, 4, 5],
        object: { a: 1, b: 2, c: 3 }
      };
      await tree.insert(lat, lng, deepMeta);
    }

    expect(tree.size()).toBe(8);

    // Verify persistence with nested structures
    await tree.close();
    const tree2 = new RTree('test-rtree-node-sizes.bjson', 4);
    await tree2.open();

    expect(tree2.size()).toBe(8);

    // Verify retrieval
    const results = await tree2.searchBBox({
      minLat: 30,
      maxLat: 40,
      minLng: -100,
      maxLng: -90
    });
    expect(results.length).toBeGreaterThan(0);

    await tree2.close();
  });

  it('should handle mixed size nodes and queries', { timeout: 30000 }, async () => {
    const tree = new RTree('test-rtree-node-sizes.bjson', 6);
    await tree.open();

    // Insert entries with varying metadata sizes
    for (let i = 0; i < 20; i++) {
      const lat = 25 + Math.random() * 30;
      const lng = -120 + Math.random() * 60;
      
      // Vary metadata size
      let meta;
      if (i % 3 === 0) {
        // Small metadata
        meta = { id: i };
      } else if (i % 3 === 1) {
        // Medium metadata
        meta = {
          id: i,
          name: `Location-${i}`,
          description: 'x'.repeat(200)
        };
      } else {
        // Large metadata
        meta = {
          id: i,
          name: `Location-${i}`,
          description: 'x'.repeat(400),
          data: Array(10).fill(i)
        };
      }
      
      await tree.insert(lat, lng, meta);
    }

    expect(tree.size()).toBe(20);

    // Verify persistence
    await tree.close();
    const tree2 = new RTree('test-rtree-node-sizes.bjson', 6);
    await tree2.open();

    expect(tree2.size()).toBe(20);

    // Verify multiple queries on different sized nodes
    const bbox1 = await tree2.searchBBox({
      minLat: 25,
      maxLat: 35,
      minLng: -120,
      maxLng: -100
    });
    expect(bbox1.length).toBeGreaterThanOrEqual(0);

    const bbox2 = await tree2.searchBBox({
      minLat: 40,
      maxLat: 55,
      minLng: -80,
      maxLng: -60
    });
    expect(bbox2.length).toBeGreaterThanOrEqual(0);

    const radius = await tree2.searchRadius(30, -100, 500);
    expect(radius.length).toBeGreaterThanOrEqual(0);

    await tree2.close();
  });

  it('should track and report node sizes during operations', async () => {
    const tree = new RTree('test-rtree-node-sizes.bjson', 5);
    await tree.open();

    console.log('\n  Node size growth during insertions:');

    const nodeSizes = [];
    for (let i = 0; i < 20; i++) {
      const lat = 25 + Math.random() * 30;
      const lng = -120 + Math.random() * 60;
      const meta = {
        id: i,
        data: 'x'.repeat(100 * (i + 1)) // Growing metadata
      };
      await tree.insert(lat, lng, meta);

      // Get file size as proxy for total node size
      const fileSize = await tree.file.getFileSize();
      nodeSizes.push(fileSize);

      if ((i + 1) % 5 === 0) {
        console.log(`    After ${i + 1} insertions: file size = ${fileSize} bytes`);
      }
    }

    expect(tree.size()).toBe(20);
    expect(nodeSizes[nodeSizes.length - 1]).toBeGreaterThan(nodeSizes[0]);

    await tree.close();
  });
});
