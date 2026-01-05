/**
 * Test suite for TextLog implementation
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TextLog, ENTRY_TYPE } from '../src/textlog.js';
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

describe.skipIf(!hasOPFS)('TextLog', function() {
  let testFileCounter = 0;

  function getTestFilename() {
    return `test-textlog-${Date.now()}-${testFileCounter++}.bjson`;
  }

  async function cleanupFile(filename) {
    try {
      const file = new BJsonFile(filename);
      if (await file.exists()) {
        await file.open('rw');
        await file.delete();
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  describe('Constructor', function() {
    it('should create a TextLog with default diffsPerSnapshot', function() {
      const log = new TextLog('test.bjson');
      expect(log.diffsPerSnapshot).toBe(10);
    });

    it('should create a TextLog with custom diffsPerSnapshot', function() {
      const log = new TextLog('test.bjson', 5);
      expect(log.diffsPerSnapshot).toBe(5);
    });

    it('should throw error for invalid diffsPerSnapshot', function() {
      expect(() => new TextLog('test.bjson', 0)).toThrow('diffsPerSnapshot must be at least 1');
      expect(() => new TextLog('test.bjson', -1)).toThrow('diffsPerSnapshot must be at least 1');
    });
  });

  describe('Basic operations', function() {
    let filename;
    let log;

    beforeEach(function() {
      filename = getTestFilename();
    });

    afterEach(async function() {
      if (log && log.isOpen) {
        await log.close();
      }
      await cleanupFile(filename);
    });

    it('should create and open new log', async function() {
      log = new TextLog(filename, 5);
      await log.open();

      expect(log.isOpen).toBe(true);
      expect(log.getCurrentVersion()).toBe(0);

      await log.close();
    });

    it('should add first version as snapshot', async function() {
      log = new TextLog(filename, 5);
      await log.open();

      const version = await log.addVersion('Hello, World!');
      expect(version).toBe(1);
      expect(log.getCurrentVersion()).toBe(1);

      await log.close();
    });

    it('should retrieve added version', async function() {
      log = new TextLog(filename, 5);
      await log.open();

      await log.addVersion('Hello, World!');
      const text = await log.getVersion(1);
      
      expect(text).toBe('Hello, World!');

      await log.close();
    });

    it('should add multiple versions', async function() {
      log = new TextLog(filename, 5);
      await log.open();

      await log.addVersion('Version 1');
      await log.addVersion('Version 2');
      await log.addVersion('Version 3');

      expect(log.getCurrentVersion()).toBe(3);

      const v1 = await log.getVersion(1);
      const v2 = await log.getVersion(2);
      const v3 = await log.getVersion(3);

      expect(v1).toBe('Version 1');
      expect(v2).toBe('Version 2');
      expect(v3).toBe('Version 3');

      await log.close();
    });

    it('should handle empty text', async function() {
      log = new TextLog(filename, 5);
      await log.open();

      await log.addVersion('');
      const text = await log.getVersion(1);
      
      expect(text).toBe('');

      await log.close();
    });

    it('should throw error for invalid version', async function() {
      log = new TextLog(filename, 5);
      await log.open();

      await log.addVersion('Test');

      await expect(log.getVersion(0)).rejects.toThrow('Invalid version');
      await expect(log.getVersion(2)).rejects.toThrow('Invalid version');
      await expect(log.getVersion(-1)).rejects.toThrow('Invalid version');

      await log.close();
    });
  });

  describe('Snapshot vs Diff strategy', function() {
    let filename;
    let log;

    beforeEach(function() {
      filename = getTestFilename();
    });

    afterEach(async function() {
      if (log && log.isOpen) {
        await log.close();
      }
      await cleanupFile(filename);
    });

    it('should create snapshot every N diffs', async function() {
      // Set diffsPerSnapshot to 3
      log = new TextLog(filename, 3);
      await log.open();

      // Add 5 versions
      await log.addVersion('Version 1'); // Snapshot (first version)
      await log.addVersion('Version 2'); // Diff 1
      await log.addVersion('Version 3'); // Diff 2
      await log.addVersion('Version 4'); // Diff 3
      await log.addVersion('Version 5'); // Snapshot (after 3 diffs)

      // Verify all versions are retrievable
      expect(await log.getVersion(1)).toBe('Version 1');
      expect(await log.getVersion(2)).toBe('Version 2');
      expect(await log.getVersion(3)).toBe('Version 3');
      expect(await log.getVersion(4)).toBe('Version 4');
      expect(await log.getVersion(5)).toBe('Version 5');

      await log.close();
    });

    it('should handle many versions with periodic snapshots', async function() {
      log = new TextLog(filename, 5);
      await log.open();

      // Add 12 versions (should create snapshots at v1, v6, v11)
      for (let i = 1; i <= 12; i++) {
        await log.addVersion(`Version ${i} text content`);
      }

      // Verify all versions are retrievable
      for (let i = 1; i <= 12; i++) {
        const text = await log.getVersion(i);
        expect(text).toBe(`Version ${i} text content`);
      }

      await log.close();
    });
  });

  describe('Diff functionality', function() {
    let filename;
    let log;

    beforeEach(function() {
      filename = getTestFilename();
    });

    afterEach(async function() {
      if (log && log.isOpen) {
        await log.close();
      }
      await cleanupFile(filename);
    });

    it('should create human-readable diff between versions', async function() {
      log = new TextLog(filename, 5);
      await log.open();

      await log.addVersion('Hello\nWorld\n');
      await log.addVersion('Hello\nBeautiful World\n');

      const diff = await log.getDiff(1, 2);
      
      expect(diff).toContain('--- version 1');
      expect(diff).toContain('+++ version 2');
      expect(diff).toContain('-World');
      expect(diff).toContain('+Beautiful World');

      await log.close();
    });

    it('should handle diff with no changes', async function() {
      log = new TextLog(filename, 5);
      await log.open();

      await log.addVersion('Same text');
      await log.addVersion('Same text');

      const diff = await log.getDiff(1, 2);
      
      // No hunks means no changes
      expect(diff).toContain('--- version 1');
      expect(diff).toContain('+++ version 2');

      await log.close();
    });

    it('should create diff between non-adjacent versions', async function() {
      log = new TextLog(filename, 5);
      await log.open();

      await log.addVersion('Line 1\nLine 2\nLine 3\n');
      await log.addVersion('Line 1\nLine 2 modified\nLine 3\n');
      await log.addVersion('Line 1\nLine 2 modified\nLine 3\nLine 4\n');

      const diff = await log.getDiff(1, 3);
      
      expect(diff).toContain('--- version 1');
      expect(diff).toContain('+++ version 3');
      expect(diff).toContain('-Line 2');
      expect(diff).toContain('+Line 2 modified');
      expect(diff).toContain('+Line 4');

      await log.close();
    });

    it('should throw error for invalid diff versions', async function() {
      log = new TextLog(filename, 5);
      await log.open();

      await log.addVersion('Test');

      await expect(log.getDiff(0, 1)).rejects.toThrow('Invalid fromVersion');
      await expect(log.getDiff(1, 2)).rejects.toThrow('Invalid toVersion');
      await expect(log.getDiff(2, 1)).rejects.toThrow('Invalid fromVersion');

      await log.close();
    });
  });

  describe('Hash functionality', function() {
    let filename;
    let log;

    beforeEach(function() {
      filename = getTestFilename();
    });

    afterEach(async function() {
      if (log && log.isOpen) {
        await log.close();
      }
      await cleanupFile(filename);
    });

    it('should compute SHA hash for each version', async function() {
      log = new TextLog(filename, 5);
      await log.open();

      await log.addVersion('Hello, World!');
      const hash = await log.getVersionHash(1);
      
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64); // SHA-256 produces 64 hex characters

      await log.close();
    });

    it('should produce same hash for same content', async function() {
      log = new TextLog(filename, 5);
      await log.open();

      await log.addVersion('Same content');
      await log.addVersion('Same content');
      
      const hash1 = await log.getVersionHash(1);
      const hash2 = await log.getVersionHash(2);
      
      expect(hash1).toBe(hash2);

      await log.close();
    });

    it('should produce different hash for different content', async function() {
      log = new TextLog(filename, 5);
      await log.open();

      await log.addVersion('Content A');
      await log.addVersion('Content B');
      
      const hash1 = await log.getVersionHash(1);
      const hash2 = await log.getVersionHash(2);
      
      expect(hash1).not.toBe(hash2);

      await log.close();
    });
  });

  describe('Persistence', function() {
    let filename;
    let log;

    beforeEach(function() {
      filename = getTestFilename();
    });

    afterEach(async function() {
      if (log && log.isOpen) {
        await log.close();
      }
      await cleanupFile(filename);
    });

    it('should persist data across open/close cycles', async function() {
      // Create and populate log
      log = new TextLog(filename, 5);
      await log.open();
      
      await log.addVersion('Version 1');
      await log.addVersion('Version 2');
      await log.addVersion('Version 3');
      
      await log.close();

      // Reopen and verify
      log = new TextLog(filename, 5);
      await log.open();
      
      expect(log.getCurrentVersion()).toBe(3);
      expect(await log.getVersion(1)).toBe('Version 1');
      expect(await log.getVersion(2)).toBe('Version 2');
      expect(await log.getVersion(3)).toBe('Version 3');

      await log.close();
    });

    it('should maintain metadata across sessions', async function() {
      // Create log with specific settings
      log = new TextLog(filename, 7);
      await log.open();
      
      await log.addVersion('Test');
      
      await log.close();

      // Reopen and verify settings
      log = new TextLog(filename, 7);
      await log.open();
      
      expect(log.diffsPerSnapshot).toBe(7);
      expect(log.getCurrentVersion()).toBe(1);

      await log.close();
    });

    it('should handle adding versions after reopening', async function() {
      // Create log and add versions
      log = new TextLog(filename, 5);
      await log.open();
      
      await log.addVersion('Version 1');
      await log.addVersion('Version 2');
      
      await log.close();

      // Reopen and add more versions
      log = new TextLog(filename, 5);
      await log.open();
      
      await log.addVersion('Version 3');
      await log.addVersion('Version 4');
      
      expect(log.getCurrentVersion()).toBe(4);
      expect(await log.getVersion(1)).toBe('Version 1');
      expect(await log.getVersion(2)).toBe('Version 2');
      expect(await log.getVersion(3)).toBe('Version 3');
      expect(await log.getVersion(4)).toBe('Version 4');

      await log.close();
    });
  });

  describe('Edge cases', function() {
    let filename;
    let log;

    beforeEach(function() {
      filename = getTestFilename();
    });

    afterEach(async function() {
      if (log && log.isOpen) {
        await log.close();
      }
      await cleanupFile(filename);
    });

    it('should handle large text content', async function() {
      log = new TextLog(filename, 5);
      await log.open();

      const largeText = 'Lorem ipsum '.repeat(1000);
      await log.addVersion(largeText);
      
      const retrieved = await log.getVersion(1);
      expect(retrieved).toBe(largeText);

      await log.close();
    });

    it('should handle special characters', async function() {
      log = new TextLog(filename, 5);
      await log.open();

      const specialText = '🎉 Unicode: café, naïve, 中文, 日本語\n\t\r\n';
      await log.addVersion(specialText);
      
      const retrieved = await log.getVersion(1);
      expect(retrieved).toBe(specialText);

      await log.close();
    });

    it('should handle line-by-line changes', async function() {
      log = new TextLog(filename, 5);
      await log.open();

      const text1 = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n';
      const text2 = 'Line 1\nLine 2 modified\nLine 3\nLine 4\nLine 5\n';
      const text3 = 'Line 1\nLine 2 modified\nLine 3\nLine 4 changed\nLine 5\n';

      await log.addVersion(text1);
      await log.addVersion(text2);
      await log.addVersion(text3);

      expect(await log.getVersion(1)).toBe(text1);
      expect(await log.getVersion(2)).toBe(text2);
      expect(await log.getVersion(3)).toBe(text3);

      await log.close();
    });
  });
});
