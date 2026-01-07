import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { TextIndex } from '../src/textindex.js';
import { BJsonFile } from '../src/bjson.js';

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

describe.skipIf(!hasOPFS)('TextIndex compaction', function() {
  let index;
  let baseName;
  let compactBase;
  let counter = 0;

  async function cleanupFiles(name) {
    if (!name) return;
    const files = [
      `${name}-terms.bjson`,
      `${name}-documents.bjson`,
      `${name}-lengths.bjson`
    ];

    for (const file of files) {
        const handle = new BJsonFile(file);
        if (await handle.exists()) {
          await handle.delete();
        }
    }
  }

  beforeEach(async function() {
    baseName = `text-index-${Date.now()}-${counter++}`;
    compactBase = null;
    index = new TextIndex({ baseFilename: baseName });
    await index.open();
  });

  afterEach(async function() {
    if (index) {
      await index.close();
      index = null;
    }

    await cleanupFiles(baseName);
    await cleanupFiles(compactBase);
  });

  it('compacts underlying trees and keeps queries working', async function() {
    await index.add('doc1', 'The quick brown fox jumps');
    await index.add('doc2', 'Lazy dogs nap all day');

    const before = await index.query('quick fox', { scored: false });
    expect(before).toContain('doc1');

    compactBase = `${baseName}-compact`;
    const result = await index.compact(compactBase);

    expect(result.terms.newFilename).toBe(`${compactBase}-terms.bjson`);
    expect(result.documents.newFilename).toBe(`${compactBase}-documents.bjson`);
    expect(result.lengths.newFilename).toBe(`${compactBase}-lengths.bjson`);
    expect(index.baseFilename).toBe(compactBase);

    const after = await index.query('quick fox', { scored: false });
    expect(after).toEqual(expect.arrayContaining(before));
    expect(await index.getDocumentCount()).toBe(2);

    await index.add('doc3', 'quick dogs and foxes together');
    const post = await index.query('dogs', { scored: false });
    expect(post).toContain('doc3');
  });
});
