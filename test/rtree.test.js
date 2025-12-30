/**
 * Test suite for on-disk R-tree implementation
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { RTree } from '../src/rtree.js';
import { BJsonFile } from '../src/bjson.js';

// Set up node-opfs for Node.js environment
let hasOPFS = false;
try {
  // Try to use node-opfs if running in Node.js
  const nodeOpfs = await import('node-opfs');
  if (nodeOpfs.navigator && typeof global !== 'undefined') {
    // Override global navigator using defineProperty to ensure storage is accessible
    Object.defineProperty(global, 'navigator', {
      value: nodeOpfs.navigator,
      writable: true,
      configurable: true
    });
    hasOPFS = true;
  }
} catch (e) {
  // Check if running in browser with native OPFS
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.getDirectory) {
    hasOPFS = true;
  }
}

async function cleanup() {
  try {
    const file = new BJsonFile('test-rtree.bjson');
    if (await file.exists()) {
      await file.open('rw');
      await file.delete();
    }
  } catch (error) {
    // Ignore cleanup errors
  }
}

describe.skipIf(!hasOPFS)('On-Disk R-tree Implementation', () => {
  afterEach(async () => {
    await cleanup();
  });

  it('should create and open new tree', async () => {
    const tree = new RTree('test-rtree.bjson', 4);
    await tree.open();

    expect(tree.size()).toBe(0);
    expect(tree.isOpen).toBe(true);

    await tree.close();
  });

  it('should insert points', async () => {
    const tree = new RTree('test-rtree.bjson', 4);
    await tree.open();

    await tree.insert(40.7128, -74.0060, { name: 'New York' });
    expect(tree.size()).toBe(1);

    await tree.insert(34.0522, -118.2437, { name: 'Los Angeles' });
    await tree.insert(41.8781, -87.6298, { name: 'Chicago' });
    expect(tree.size()).toBe(3);

    await tree.close();
  });

  it('should search by bounding box', async () => {
    const tree = new RTree('test-rtree.bjson', 4);
    await tree.open();

    await tree.insert(40.7128, -74.0060, { name: 'New York' });
    await tree.insert(34.0522, -118.2437, { name: 'Los Angeles' });
    await tree.insert(41.8781, -87.6298, { name: 'Chicago' });

    const bbox = {
      minLat: 40,
      maxLat: 42,
      minLng: -75,
      maxLng: -73
    };

    const results = await tree.searchBBox(bbox);
    expect(results).toHaveLength(1);
    expect(results[0].data.name).toBe('New York');

    await tree.close();
  });

  it('should search by radius', async () => {
    const tree = new RTree('test-rtree.bjson', 4);
    await tree.open();

    await tree.insert(40.7128, -74.0060, { name: 'New York' });
    await tree.insert(34.0522, -118.2437, { name: 'Los Angeles' });
    await tree.insert(41.8781, -87.6298, { name: 'Chicago' });

    const results = await tree.searchRadius(40.7128, -74.0060, 100);
    expect(results).toHaveLength(1);

    const largeResults = await tree.searchRadius(40.7128, -74.0060, 5000);
    expect(largeResults).toHaveLength(3);

    await tree.close();
  });

  it('should persist and reopen tree', async () => {
    // Create and insert
    const tree1 = new RTree('test-rtree.bjson', 4);
    await tree1.open();

    await tree1.insert(40.7128, -74.0060, { name: 'New York' });
    await tree1.insert(34.0522, -118.2437, { name: 'Los Angeles' });
    await tree1.insert(41.8781, -87.6298, { name: 'Chicago' });

    await tree1.close();
    expect(tree1.isOpen).toBe(false);

    // Reopen and verify
    const tree2 = new RTree('test-rtree.bjson');
    await tree2.open();
    expect(tree2.size()).toBe(3);

    const bbox = {
      minLat: 40,
      maxLat: 42,
      minLng: -75,
      maxLng: -73
    };

    const results = await tree2.searchBBox(bbox);
    expect(results).toHaveLength(1);
    expect(results[0].data.name).toBe('New York');

    await tree2.close();
  });

  it('should handle node splitting with 8 entries', async () => {
    const tree = new RTree('test-rtree.bjson', 4);
    await tree.open();

    // Insert cities to force splits
    const cities = [
      { lat: 40.7128, lng: -74.0060, name: 'New York' },
      { lat: 34.0522, lng: -118.2437, name: 'Los Angeles' },
      { lat: 41.8781, lng: -87.6298, name: 'Chicago' },
      { lat: 29.7604, lng: -95.3698, name: 'Houston' },
      { lat: 33.4484, lng: -112.0740, name: 'Phoenix' },
      { lat: 39.9526, lng: -75.1652, name: 'Philadelphia' },
      { lat: 29.4241, lng: -98.4936, name: 'San Antonio' },
      { lat: 32.7157, lng: -117.1611, name: 'San Diego' }
    ];

    for (const city of cities) {
      await tree.insert(city.lat, city.lng, { name: city.name });
    }

    expect(tree.size()).toBe(8);

    // Verify all cities can be found
    const allResults = await tree.searchBBox({
      minLat: 25,
      maxLat: 45,
      minLng: -125,
      maxLng: -70
    });

    expect(allResults).toHaveLength(8);

    await tree.close();
  });

  it('should clear tree', async () => {
    const tree = new RTree('test-rtree.bjson', 4);
    await tree.open();

    await tree.insert(40.7128, -74.0060, { name: 'New York' });
    await tree.insert(34.0522, -118.2437, { name: 'Los Angeles' });

    await tree.clear();
    expect(tree.size()).toBe(0);

    const results = await tree.searchBBox({
      minLat: 25,
      maxLat: 45,
      minLng: -125,
      maxLng: -70
    });

    expect(results).toHaveLength(0);

    await tree.close();
  });
});
