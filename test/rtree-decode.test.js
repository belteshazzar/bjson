import { describe, it, expect, afterEach } from 'vitest';
import { execFile } from 'child_process';
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

function runCli(filePath) {
  return new Promise((resolve, reject) => {
    execFile('node', ['bin/rtree-decode.js', filePath], { cwd: process.cwd() }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function cleanupFile(filename) {
    const file = new BJsonFile(filename);
    if (await file.exists()) {
      await file.delete();
    }
}

describe.skipIf(!hasOPFS)('rtree-decode CLI', () => {
  afterEach(async () => {
    // Clean up all test files
    await cleanupFile('test-rtree-decode-cli.bjson');
    await cleanupFile('test-rtree-decode-empty.bjson');
    await cleanupFile('test-rtree-decode-many.bjson');
    await cleanupFile('test-rtree-decode-oids.bjson');
  });

  it('decodes and prints R-tree with spatial points', async () => {
    const filename = 'test-rtree-decode-cli.bjson';
    
    // Clean up before test
    await cleanupFile(filename);
    
    // Create and populate tree
    const tree = new RTree(filename, 4);
    await tree.open();
    
    const id1 = new ObjectId('5f1d7f3a0b0c0d0e0f101112');
    const id2 = new ObjectId('6a6b6c6d6e6f707172737475');
    const id3 = new ObjectId('7b7c7d7e7f80818283848586');
    
    await tree.insert(40.7128, -74.0060, id1); // NYC
    await tree.insert(34.0522, -118.2437, id2); // LA
    await tree.insert(41.8781, -87.6298, id3); // Chicago
    
    await tree.close();
    
    // Run CLI tool
    const { stdout } = await runCli(filename);
    
    // Check output contains expected formatting
    expect(stdout).toContain('0:');
    expect(stdout).toContain('1:');
    expect(stdout).toContain('2:');
    
    // Check for proper formatting of ObjectIds
    expect(stdout).toContain('ObjectId(5f1d7f3a0b0c0d0e0f101112)');
    expect(stdout).toContain('ObjectId(6a6b6c6d6e6f707172737475)');
    expect(stdout).toContain('ObjectId(7b7c7d7e7f80818283848586)');
    
    // Check for coordinates
    expect(stdout).toContain('lat: 40.7128');
    expect(stdout).toContain('lng: -74.006');
    expect(stdout).toContain('lat: 34.0522');
    expect(stdout).toContain('lng: -118.2437');
    expect(stdout).toContain('lat: 41.8781');
    expect(stdout).toContain('lng: -87.6298');
  });

  it('handles empty R-tree', async () => {
    const filename = 'test-rtree-decode-empty.bjson';
    
    // Clean up before test
    await cleanupFile(filename);
    
    // Create empty tree
    const tree = new RTree(filename, 4);
    await tree.open();
    await tree.close();
    
    // Run CLI tool
    const { stdout } = await runCli(filename);
    
    expect(stdout).toContain('R-tree is empty');
  });

  it('displays all points from tree with many entries', async () => {
    const filename = 'test-rtree-decode-many.bjson';
    
    // Clean up before test
    await cleanupFile(filename);
    
    // Create tree with multiple points
    const tree = new RTree(filename, 4);
    await tree.open();
    
    const points = [];
    for (let i = 0; i < 10; i++) {
      const id = new ObjectId();
      const lat = 25 + Math.random() * 24;
      const lng = -125 + Math.random() * 59;
      points.push({ id, lat, lng });
      await tree.insert(lat, lng, id);
    }
    
    await tree.close();
    
    // Run CLI tool
    const { stdout } = await runCli(filename);
        
    // Verify all ObjectIds are present
    for (const point of points) {
      expect(stdout).toContain(`ObjectId(${point.id.toHexString()})`);
    }
  });

  it('displays points with different ObjectId formats', async () => {
    const filename = 'test-rtree-decode-oids.bjson';
    
    // Clean up before test
    await cleanupFile(filename);
    
    // Create tree with various ObjectIds
    const tree = new RTree(filename, 4);
    await tree.open();
    
    const id1 = new ObjectId(); // Generated
    const id2 = new ObjectId('000000000000000000000000'); // All zeros
    const id3 = new ObjectId('ffffffffffffffffffffffff'); // All Fs
    
    await tree.insert(40.0, -74.0, id1);
    await tree.insert(41.0, -75.0, id2);
    await tree.insert(42.0, -76.0, id3);
    
    await tree.close();
    
    // Run CLI tool
    const { stdout } = await runCli(filename);
    
    expect(stdout).toContain('ObjectId(000000000000000000000000)');
    expect(stdout).toContain('ObjectId(ffffffffffffffffffffffff)');
    expect(stdout).toContain(`ObjectId(${id1.toHexString()})`);
  });
});
