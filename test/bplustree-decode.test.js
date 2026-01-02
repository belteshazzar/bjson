import { describe, it, expect } from 'vitest';
import { execFile } from 'child_process';
import { BPlusTree } from '../src/bplustree.js';
import { ObjectId, Pointer } from '../src/bjson.js';

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
    execFile('node', ['bin/bplustree-decode.js', filePath], { cwd: process.cwd() }, (error, stdout, stderr) => {
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

describe.skipIf(!hasOPFS)('bplustree-decode CLI', () => {
  it('decodes and prints B+ tree with various types', async () => {
    const filename = 'test-bplustree-decode-cli.bjson';
    
    // Create and populate tree
    const tree = new BPlusTree(filename, 3);
    await tree.open();
    
    const oid1 = new ObjectId('5f1d7f3a0b0c0d0e0f101112');
    const oid2 = new ObjectId('6a6b6c6d6e6f707172737475');
    const date1 = new Date('2020-01-02T03:04:05.000Z');
    const date2 = new Date('2021-01-01T00:00:00.000Z');
    
    await tree.add(1, { id: oid1, created: date1, ref: new Pointer(1234) });
    await tree.add(2, [new Pointer(99), oid2, date2]);
    await tree.add('apple', 'red');
    await tree.add(10, { nested: { value: 'test' } });
    
    await tree.close();
    
    // Run CLI tool
    const { stdout } = await runCli(filename);
    
    // Check output contains expected formatting
    expect(stdout).toContain('B+ tree contains 4 entries');
    expect(stdout).toContain('Entry 0:');
    expect(stdout).toContain('Entry 1:');
    expect(stdout).toContain('Entry 2:');
    expect(stdout).toContain('Entry 3:');
    
    // Check for proper formatting of special types
    expect(stdout).toContain('Pointer(1234)');
    expect(stdout).toContain('Pointer(99)');
    expect(stdout).toContain('ObjectId(5f1d7f3a0b0c0d0e0f101112)');
    expect(stdout).toContain('ObjectId(6a6b6c6d6e6f707172737475)');
    expect(stdout).toContain('Date(2020-01-02T03:04:05.000Z)');
    expect(stdout).toContain('Date(2021-01-01T00:00:00.000Z)');
    
    // Check for keys and values
    expect(stdout).toContain('key: 1');
    expect(stdout).toContain('key: 2');
    expect(stdout).toContain('key: "apple"');
    expect(stdout).toContain('key: 10');
    expect(stdout).toContain('value: "red"');
  });

  it('handles empty B+ tree', async () => {
    const filename = 'test-bplustree-decode-empty.bjson';
    
    // Create empty tree
    const tree = new BPlusTree(filename, 3);
    await tree.open();
    await tree.close();
    
    // Run CLI tool
    const { stdout } = await runCli(filename);
    
    expect(stdout).toContain('B+ tree is empty');
  });

  it('displays entries in sorted key order', async () => {
    const filename = 'test-bplustree-decode-sorted.bjson';
    
    // Create tree with unsorted insertions
    const tree = new BPlusTree(filename, 3);
    await tree.open();
    
    await tree.add(5, 'five');
    await tree.add(2, 'two');
    await tree.add(8, 'eight');
    await tree.add(1, 'one');
    await tree.add(9, 'nine');
    
    await tree.close();
    
    // Run CLI tool
    const { stdout } = await runCli(filename);
    
    expect(stdout).toContain('B+ tree contains 5 entries');
    
    // Check that keys appear in sorted order
    const lines = stdout.split('\n');
    const keyLines = lines.filter(line => line.includes('key:'));
    
    expect(keyLines[0]).toContain('key: 1');
    expect(keyLines[1]).toContain('key: 2');
    expect(keyLines[2]).toContain('key: 5');
    expect(keyLines[3]).toContain('key: 8');
    expect(keyLines[4]).toContain('key: 9');
  });
});
