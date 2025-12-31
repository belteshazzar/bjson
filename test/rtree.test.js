/**
 * Test suite for on-disk R-tree implementation
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { RTree } from '../src/rtree.js';
import { BJsonFile, ObjectId } from '../src/bjson.js';

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

    const id1 = new ObjectId();
    await tree.insert(40.7128, -74.0060, id1);
    expect(tree.size()).toBe(1);

    const id2 = new ObjectId();
    const id3 = new ObjectId();
    await tree.insert(34.0522, -118.2437, id2);
    await tree.insert(41.8781, -87.6298, id3);
    expect(tree.size()).toBe(3);

    await tree.close();
  });

  it('should search by bounding box', async () => {
    const tree = new RTree('test-rtree.bjson', 4);
    await tree.open();

    const idNY = new ObjectId();
    const idLA = new ObjectId();
    const idCH = new ObjectId();
    
    await tree.insert(40.7128, -74.0060, idNY);
    await tree.insert(34.0522, -118.2437, idLA);
    await tree.insert(41.8781, -87.6298, idCH);

    const bbox = {
      minLat: 40,
      maxLat: 42,
      minLng: -75,
      maxLng: -73
    };

    const results = await tree.searchBBox(bbox);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(idNY);

    await tree.close();
  });

  it('should search by radius', async () => {
    const tree = new RTree('test-rtree.bjson', 4);
    await tree.open();

    const idNY = new ObjectId();
    const idLA = new ObjectId();
    const idCH = new ObjectId();
    
    await tree.insert(40.7128, -74.0060, idNY);
    await tree.insert(34.0522, -118.2437, idLA);
    await tree.insert(41.8781, -87.6298, idCH);

    const results = await tree.searchRadius(40.7128, -74.0060, 100);
    expect(results).toHaveLength(1);
    expect(results[0].objectId).toEqual(idNY);

    const largeResults = await tree.searchRadius(40.7128, -74.0060, 5000);
    expect(largeResults).toHaveLength(3);

    await tree.close();
  });

  it('should persist and reopen tree', async () => {
    // Create and insert
    const tree1 = new RTree('test-rtree.bjson', 4);
    await tree1.open();

    const idNY = new ObjectId();
    const idLA = new ObjectId();
    const idCH = new ObjectId();
    
    await tree1.insert(40.7128, -74.0060, idNY);
    await tree1.insert(34.0522, -118.2437, idLA);
    await tree1.insert(41.8781, -87.6298, idCH);

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
    expect(results[0]).toEqual(idNY);

    await tree2.close();
  });

  it('should handle node splitting with 8 entries', async () => {
    const tree = new RTree('test-rtree.bjson', 4);
    await tree.open();

    // Insert cities to force splits
    const cities = [
      { lat: 40.7128, lng: -74.0060 },
      { lat: 34.0522, lng: -118.2437 },
      { lat: 41.8781, lng: -87.6298 },
      { lat: 29.7604, lng: -95.3698 },
      { lat: 33.4484, lng: -112.0740 },
      { lat: 39.9526, lng: -75.1652 },
      { lat: 29.4241, lng: -98.4936 },
      { lat: 32.7157, lng: -117.1611 }
    ];

    for (const city of cities) {
      const id = new ObjectId();
      await tree.insert(city.lat, city.lng, id);
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

    const id1 = new ObjectId();
    const id2 = new ObjectId();
    
    await tree.insert(40.7128, -74.0060, id1);
    await tree.insert(34.0522, -118.2437, id2);

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

  it('should remove a single entry', async () => {
    const tree = new RTree('test-rtree.bjson', 4);
    await tree.open();

    const id1 = new ObjectId();
    const id2 = new ObjectId();
    const id3 = new ObjectId();
    
    await tree.insert(40.7128, -74.0060, id1);
    await tree.insert(34.0522, -118.2437, id2);
    await tree.insert(41.8781, -87.6298, id3);

    expect(tree.size()).toBe(3);

    // Remove one entry
    const removed = await tree.remove(id2);
    expect(removed).toBe(true);
    expect(tree.size()).toBe(2);

    // Verify id2 is gone but others remain
    const results = await tree.searchBBox({
      minLat: 25,
      maxLat: 45,
      minLng: -125,
      maxLng: -70
    });

    expect(results).toHaveLength(2);
    expect(results).toContainEqual(id1);
    expect(results).toContainEqual(id3);
    expect(results).not.toContainEqual(id2);

    await tree.close();
  });

  it('should return false when removing non-existent entry', async () => {
    const tree = new RTree('test-rtree.bjson', 4);
    await tree.open();

    const id1 = new ObjectId();
    const id2 = new ObjectId();
    
    await tree.insert(40.7128, -74.0060, id1);

    // Try to remove non-existent id
    const removed = await tree.remove(id2);
    expect(removed).toBe(false);
    expect(tree.size()).toBe(1);

    await tree.close();
  });

  it('should remove all entries one by one', async () => {
    const tree = new RTree('test-rtree.bjson', 4);
    await tree.open();

    const ids = [];
    const cities = [
      { lat: 40.7128, lng: -74.0060 },
      { lat: 34.0522, lng: -118.2437 },
      { lat: 41.8781, lng: -87.6298 }
    ];

    for (const city of cities) {
      const id = new ObjectId();
      ids.push(id);
      await tree.insert(city.lat, city.lng, id);
    }

    expect(tree.size()).toBe(3);

    // Remove all entries
    for (const id of ids) {
      const removed = await tree.remove(id);
      expect(removed).toBe(true);
    }

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

  it('should handle removal causing node underflow and merging', async () => {
    const tree = new RTree('test-rtree.bjson', 4);
    await tree.open();

    // Insert enough entries to force splits, creating internal nodes
    const cities = [
      { lat: 40.7128, lng: -74.0060 },
      { lat: 34.0522, lng: -118.2437 },
      { lat: 41.8781, lng: -87.6298 },
      { lat: 29.7604, lng: -95.3698 },
      { lat: 33.4484, lng: -112.0740 },
      { lat: 39.9526, lng: -75.1652 },
      { lat: 29.4241, lng: -98.4936 },
      { lat: 32.7157, lng: -117.1611 },
      { lat: 37.7749, lng: -122.4194 },
      { lat: 47.6062, lng: -122.3321 }
    ];

    const ids = [];
    for (const city of cities) {
      const id = new ObjectId();
      ids.push(id);
      await tree.insert(city.lat, city.lng, id);
    }

    expect(tree.size()).toBe(10);

    // Remove several entries to trigger underflow and merging
    for (let i = 0; i < 6; i++) {
      const removed = await tree.remove(ids[i]);
      expect(removed).toBe(true);
    }

    expect(tree.size()).toBe(4);

    // Verify remaining entries are still searchable
    const results = await tree.searchBBox({
      minLat: 25,
      maxLat: 50,
      minLng: -125,
      maxLng: -70
    });

    expect(results).toHaveLength(4);
    for (let i = 6; i < 10; i++) {
      expect(results).toContainEqual(ids[i]);
    }

    await tree.close();
  });

  it('should maintain tree integrity after mixed insertions and removals', async () => {
    const tree = new RTree('test-rtree.bjson', 4);
    await tree.open();

    const cities = [
      { lat: 40.7128, lng: -74.0060 },
      { lat: 34.0522, lng: -118.2437 },
      { lat: 41.8781, lng: -87.6298 },
      { lat: 29.7604, lng: -95.3698 },
      { lat: 33.4484, lng: -112.0740 }
    ];

    const ids = [];

    // Insert first 3
    for (let i = 0; i < 3; i++) {
      const id = new ObjectId();
      ids.push(id);
      await tree.insert(cities[i].lat, cities[i].lng, id);
    }

    // Remove middle one
    await tree.remove(ids[1]);

    // Insert 2 more
    for (let i = 3; i < 5; i++) {
      const id = new ObjectId();
      ids.push(id);
      await tree.insert(cities[i].lat, cities[i].lng, id);
    }

    // Remove another
    await tree.remove(ids[2]);

    expect(tree.size()).toBe(3);

    // Verify correct entries remain
    const results = await tree.searchBBox({
      minLat: 25,
      maxLat: 50,
      minLng: -125,
      maxLng: -70
    });

    expect(results).toHaveLength(3);
    expect(results).toContainEqual(ids[0]); // First entry
    expect(results).not.toContainEqual(ids[1]); // Removed
    expect(results).not.toContainEqual(ids[2]); // Removed
    expect(results).toContainEqual(ids[3]); // Fourth entry
    expect(results).toContainEqual(ids[4]); // Fifth entry

    await tree.close();
  });

  it('should handle removal in persisted tree', async () => {
    // Create and insert
    const tree1 = new RTree('test-rtree.bjson', 4);
    await tree1.open();

    const ids = [];
    const cities = [
      { lat: 40.7128, lng: -74.0060 },
      { lat: 34.0522, lng: -118.2437 },
      { lat: 41.8781, lng: -87.6298 },
      { lat: 29.7604, lng: -95.3698 }
    ];

    for (const city of cities) {
      const id = new ObjectId();
      ids.push(id);
      await tree1.insert(city.lat, city.lng, id);
    }

    await tree1.close();

    // Reopen and remove
    const tree2 = new RTree('test-rtree.bjson');
    await tree2.open();
    
    expect(tree2.size()).toBe(4);
    
    const removed = await tree2.remove(ids[1]);
    expect(removed).toBe(true);
    expect(tree2.size()).toBe(3);

    await tree2.close();

    // Reopen again and verify
    const tree3 = new RTree('test-rtree.bjson');
    await tree3.open();
    
    expect(tree3.size()).toBe(3);

    const results = await tree3.searchBBox({
      minLat: 25,
      maxLat: 50,
      minLng: -125,
      maxLng: -70
    });

    expect(results).toHaveLength(3);
    expect(results).toContainEqual(ids[0]);
    expect(results).not.toContainEqual(ids[1]);
    expect(results).toContainEqual(ids[2]);
    expect(results).toContainEqual(ids[3]);

    await tree3.close();
  });
});
