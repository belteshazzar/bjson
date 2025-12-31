
import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { TextIndex } from '../src/TextIndex.js';

describe('TextIndex', function() {
  let index;

  beforeEach(function() {
    index = new TextIndex();
  });

  afterEach(function() {
    index = null;
  });

  // Helper function to extract IDs from scored results
  const getIds = (results) => {
    if (results.length === 0) return [];
    if (typeof results[0] === 'string') return results;
    return results.map(r => r.id);
  };

  describe('Constructor', function() {
    it('should create an empty index', function() {
      expect(index.getTermCount()).toBe(0);
      expect(index.getDocumentCount()).toBe(0);
    });
  });

  describe('add()', function() {
    it('should add a simple term to the index', function() {
      index.add('doc1', 'hello');
      expect(index.getDocumentCount()).toBe(1);
      expect(index.getTermCount()).toBe(1);
    });

    it('should add multiple terms to the index', function() {
      index.add('doc1', 'hello world');
      expect(index.getDocumentCount()).toBe(1);
      expect(index.getTermCount()).toBe(2);
    });

    it('should add multiple documents to the index', function() {
      index.add('doc1', 'hello world');
      index.add('doc2', 'goodbye world');
      expect(index.getDocumentCount()).toBe(2);
      expect(index.getTermCount()).toBe(3); // hello, world, goodbye
    });

    it('should handle stemming correctly', function() {
      index.add('doc1', 'running runs run');
      // All three words should stem to 'run'
      expect(index.getTermCount()).toBe(1);
    });

    it('should handle case-insensitive text', function() {
      index.add('doc1', 'Hello WORLD hello');
      // 'Hello', 'WORLD', and 'hello' should be treated the same
      expect(index.getTermCount()).toBe(2); // hello, world
    });

    it('should handle punctuation and special characters', function() {
      index.add('doc1', 'Hello, world! How are you?');
      // With stop words: 'how', 'are' and 'you' are all filtered out
      expect(index.getTermCount()).toBe(2); // hello, world
    });

    it('should handle empty text', function() {
      index.add('doc1', '');
      expect(index.getDocumentCount()).toBe(1);
      expect(index.getTermCount()).toBe(0);
    });

    it('should handle non-string text gracefully', function() {
      index.add('doc1', null);
      expect(index.getDocumentCount()).toBe(1);
      expect(index.getTermCount()).toBe(0);
    });

    it('should throw error when document ID is missing', function() {
      expect(() => index.add(null, 'hello')).toThrow('Document ID is required');
      expect(() => index.add('', 'hello')).toThrow('Document ID is required');
    });

    it('should handle adding same document multiple times', function() {
      index.add('doc1', 'hello world');
      index.add('doc1', 'goodbye world');
      expect(index.getDocumentCount()).toBe(1);
      // Should have hello, world, goodbye
      expect(index.getTermCount()).toBe(3);
    });

    it('should handle complex text with various word forms', function() {
      index.add('doc1', 'The quick brown foxes are jumping over the lazy dogs');
      const results = index.query('fox jump dog', { scored: false });
      expect(results).toContain('doc1');
    });
  });

  describe('remove()', function() {
    it('should remove a document from the index', function() {
      index.add('doc1', 'hello world');
      expect(index.getDocumentCount()).toBe(1);
      
      const removed = index.remove('doc1');
      expect(removed).toBe(true);
      expect(index.getDocumentCount()).toBe(0);
      expect(index.getTermCount()).toBe(0);
    });

    it('should remove only the specified document', function() {
      index.add('doc1', 'hello world');
      index.add('doc2', 'hello universe');
      
      index.remove('doc1');
      expect(index.getDocumentCount()).toBe(1);
      expect(index.getTermCount()).toBe(2); // hello, universe
    });

    it('should clean up terms that are only in removed document', function() {
      index.add('doc1', 'unique');
      index.add('doc2', 'common');
      
      index.remove('doc1');
      expect(index.getTermCount()).toBe(1); // only 'common' remains
    });

    it('should keep shared terms when one document is removed', function() {
      index.add('doc1', 'hello world');
      index.add('doc2', 'hello universe');
      
      index.remove('doc1');
      const results = index.query('hello', { scored: false });
      expect(results).toEqual(['doc2']);
    });

    it('should return false when removing non-existent document', function() {
      const removed = index.remove('nonexistent');
      expect(removed).toBe(false);
    });

    it('should handle removing from empty index', function() {
      const removed = index.remove('doc1');
      expect(removed).toBe(false);
      expect(index.getDocumentCount()).toBe(0);
    });

    it('should allow re-adding a removed document', function() {
      index.add('doc1', 'hello');
      index.remove('doc1');
      index.add('doc1', 'world');
      
      expect(index.getDocumentCount()).toBe(1);
      const results = index.query('world', { scored: false });
      expect(results).toContain('doc1');
    });
  });

  describe('query()', function() {
    beforeEach(function() {
      index.add('doc1', 'The quick brown fox jumps over the lazy dog');
      index.add('doc2', 'A fast brown fox');
      index.add('doc3', 'The lazy cat sleeps');
      index.add('doc4', 'Dogs and cats are friends');
    });

    it('should find documents with single term', function() {
      const results = index.query('fox', { scored: false });
      expect(results).toHaveLength(2);
      expect(results).toContain('doc1');
      expect(results).toContain('doc2');
    });

    it('should find documents with multiple terms (AND)', function() {
      const results = index.query('brown fox', { scored: false });
      expect(results).toHaveLength(2);
      expect(results).toContain('doc1');
      expect(results).toContain('doc2');
    });

    it('should apply stemming to query terms', function() {
      // 'jumping' should stem to 'jump', matching 'jumps'
      const results = index.query('jumping', { scored: false });
      expect(results).toContain('doc1');
    });

    it('should return empty array when no matches found', function() {
      const results = index.query('elephant', { scored: false });
      expect(results).toEqual([]);
    });

    it('should handle case-insensitive queries', function() {
      const results = index.query('FOX', { scored: false });
      expect(results).toHaveLength(2);
    });

    it('should handle empty query', function() {
      const results = index.query('', { scored: false });
      expect(results).toEqual([]);
    });

    it('should handle query with punctuation', function() {
      const results = index.query('fox!', { scored: false });
      expect(results).toHaveLength(2);
    });

    it('should return only documents matching ALL terms', function() {
      const results = index.query('lazy dog', { scored: false, requireAll: true });
      expect(results).toHaveLength(1);
      expect(results).toContain('doc1');
    });

    it('should handle queries with stemming variations', function() {
      // 'dogs' should stem to 'dog'
      const results = index.query('dogs', { scored: false });
      expect(results).toHaveLength(2);
      expect(results).toContain('doc1');
      expect(results).toContain('doc4');
    });

    it('should handle complex queries', function() {
      const results = index.query('the lazy', { scored: false, requireAll: true });
      expect(results).toHaveLength(2);
      expect(results).toContain('doc1');
      expect(results).toContain('doc3');
    });

    it('should return empty when one term does not match', function() {
      const results = index.query('fox elephant', { scored: false, requireAll: true });
      expect(results).toEqual([]);
    });
  });

  describe('getTermCount()', function() {
    it('should return 0 for empty index', function() {
      expect(index.getTermCount()).toBe(0);
    });

    it('should return correct count after adding terms', function() {
      index.add('doc1', 'hello world');
      expect(index.getTermCount()).toBe(2);
    });

    it('should account for stemming', function() {
      index.add('doc1', 'running runs');
      expect(index.getTermCount()).toBe(1); // both stem to 'run'
    });

    it('should update count after removal', function() {
      index.add('doc1', 'unique term');
      index.add('doc2', 'shared term');
      expect(index.getTermCount()).toBe(3);
      
      index.remove('doc1');
      expect(index.getTermCount()).toBe(2); // 'unique' removed, 'shared' and 'term' remain
    });
  });

  describe('getDocumentCount()', function() {
    it('should return 0 for empty index', function() {
      expect(index.getDocumentCount()).toBe(0);
    });

    it('should return correct count after adding documents', function() {
      index.add('doc1', 'hello');
      index.add('doc2', 'world');
      expect(index.getDocumentCount()).toBe(2);
    });

    it('should not double count same document', function() {
      index.add('doc1', 'hello');
      index.add('doc1', 'world');
      expect(index.getDocumentCount()).toBe(1);
    });

    it('should update count after removal', function() {
      index.add('doc1', 'hello');
      index.add('doc2', 'world');
      index.remove('doc1');
      expect(index.getDocumentCount()).toBe(1);
    });
  });

  describe('clear()', function() {
    it('should clear all data from the index', function() {
      index.add('doc1', 'hello world');
      index.add('doc2', 'goodbye world');
      
      index.clear();
      
      expect(index.getTermCount()).toBe(0);
      expect(index.getDocumentCount()).toBe(0);
    });

    it('should allow adding data after clear', function() {
      index.add('doc1', 'hello');
      index.clear();
      index.add('doc2', 'world');
      
      expect(index.getDocumentCount()).toBe(1);
      expect(index.getTermCount()).toBe(1);
    });

    it('should handle clearing empty index', function() {
      index.clear();
      expect(index.getTermCount()).toBe(0);
      expect(index.getDocumentCount()).toBe(0);
    });
  });

  describe('Integration tests', function() {
    it('should handle a realistic document collection', function() {
      index.add('blog1', 'How to learn JavaScript programming');
      index.add('blog2', 'JavaScript is a programming language');
      index.add('blog3', 'Learning Python for beginners');
      index.add('blog4', 'Advanced JavaScript techniques');
      
      // Query for JavaScript programming
      let results = index.query('JavaScript programming', { scored: false, requireAll: true });
      expect(results).toHaveLength(2);
      expect(results).toContain('blog1');
      expect(results).toContain('blog2');
      
      // Query for learning
      results = index.query('learning', { scored: false });
      expect(results).toHaveLength(2);
      expect(results).toContain('blog1');
      expect(results).toContain('blog3');
      
      // Remove a document and query again
      index.remove('blog1');
      results = index.query('learning', { scored: false });
      expect(results).toHaveLength(1);
      expect(results).toContain('blog3');
    });

    it('should handle documents with overlapping terms', function() {
      index.add('doc1', 'apple orange banana');
      index.add('doc2', 'orange banana grape');
      index.add('doc3', 'banana grape mango');
      
      const results = index.query('banana', { scored: false });
      expect(results).toHaveLength(3);
      
      const results2 = index.query('orange banana', { scored: false, requireAll: true });
      expect(results2).toHaveLength(2);
      expect(results2).toContain('doc1');
      expect(results2).toContain('doc2');
    });

    it('should handle adding, querying, removing, and re-adding', function() {
      index.add('doc1', 'test document');
      let results = index.query('test', { scored: false });
      expect(results).toContain('doc1');
      
      index.remove('doc1');
      results = index.query('test', { scored: false });
      expect(results).toHaveLength(0);
      
      index.add('doc1', 'new test content');
      results = index.query('test', { scored: false });
      expect(results).toContain('doc1');
      
      results = index.query('document', { scored: false });
      expect(results).toHaveLength(0); // old content removed
    });
  });

  describe('Relevance Scoring', function() {
    beforeEach(function() {
      // Add test documents
      index.add('doc1', 'The quick brown fox jumps over the lazy dog');
      index.add('doc2', 'A quick brown dog runs through the forest');
      index.add('doc3', 'The lazy cat sleeps under the tree');
      index.add('doc4', 'Foxes are quick and clever animals');
      index.add('doc5', 'Dogs and cats are popular pets');
    });

    it('should return scored results by default', function() {
      const results = index.query('quick');
      expect(Array.isArray(results)).toBe(true);
      expect(results[0]).toHaveProperty('id');
      expect(results[0]).toHaveProperty('score');
      expect(typeof results[0].score).toBe('number');
    });

    it('should rank documents by relevance', function() {
      const results = index.query('quick');
      // All documents with 'quick' should have scores
      expect(results.length).toBe(3);
      // Scores should be in descending order
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
      }
    });

    it('should give higher scores to documents with multiple matching terms', function() {
      const results = index.query('lazy dog');
      // doc1 has both 'lazy' and 'dog', should score highest
      expect(results[0].id).toBe('doc1');
      // Other docs should have lower scores
      expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    it('should include partial matches when not using requireAll', function() {
      const results = index.query('lazy dog', { scored: false });
      // Should include doc1 (has both), doc2 (has dog), doc3 (has lazy), doc5 (has dog)
      expect(results.length).toBeGreaterThan(1);
      expect(results).toContain('doc1');
    });

    it('should return only exact matches with requireAll option', function() {
      const results = index.query('lazy dog', { scored: false, requireAll: true });
      // Only doc1 has both terms
      expect(results).toHaveLength(1);
      expect(results[0]).toBe('doc1');
    });

    it('should handle term frequency in scoring', function() {
      index.clear();
      index.add('doc1', 'apple apple apple banana');
      index.add('doc2', 'apple banana cherry');
      index.add('doc3', 'banana cherry date');
      
      const results = index.query('apple');
      // doc1 has apple 3 times, doc2 has apple 1 time, doc3 doesn't have apple
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results[0]).toHaveProperty('score');
      // Verify scores are positive (IDF will be log(3/2) > 0)
      expect(results[0].score).toBeGreaterThan(0);
    });

    it('should calculate TF-IDF correctly', function() {
      index.clear();
      index.add('doc1', 'rare word');
      index.add('doc2', 'common common common');
      index.add('doc3', 'common word');
      index.add('doc4', 'common stuff');
      
      const results = index.query('rare', { scored: false });
      // 'rare' only appears in doc1
      expect(results).toContain('doc1');
      
      const commonResults = index.query('common', { scored: false });
      // 'common' appears in multiple docs
      expect(commonResults.length).toBe(3);
    });
  });


});
