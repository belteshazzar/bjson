import { stemmer } from 'stemmer';
import { BPlusTree } from './bplustree.js';

// Common English stop words that don't add semantic value to searches
const STOPWORDS = new Set([
  'a', 'about', 'after', 'all', 'also', 'am', 'an', 'and', 'another', 'any', 'are', 
  'around', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'between', 'both', 
  'but', 'by', 'came', 'can', 'come', 'could', 'did', 'do', 'each', 'for', 'from', 
  'get', 'got', 'has', 'had', 'he', 'have', 'her', 'here', 'him', 'himself', 'his', 
  'how', 'i', 'if', 'in', 'into', 'is', 'it', 'like', 'make', 'many', 'me', 'might', 
  'more', 'most', 'much', 'must', 'my', 'never', 'now', 'of', 'on', 'only', 'or', 
  'other', 'our', 'out', 'over', 'said', 'same', 'see', 'should', 'since', 'some', 
  'still', 'such', 'take', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 
  'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under', 'up', 'very', 
  'was', 'way', 'we', 'well', 'were', 'what', 'where', 'which', 'while', 'who', 
  'with', 'would', 'you', 'your'
]);

/**
 * TextIndex - A text index implementation using Porter stemmer algorithm
 * 
 * This class provides full-text search capabilities by indexing terms
 * and associating them with document IDs. It uses the Porter stemmer
 * algorithm to normalize words to their root forms.
 */
export class TextIndex {
  constructor(options = {}) {
    const {
      baseFilename = `text-index-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      order = 16,
      trees
    } = options;

    this.baseFilename = baseFilename;
    this.index = trees?.index || new BPlusTree(`${baseFilename}-terms.bjson`, order);
    this.documentTerms = trees?.documentTerms || new BPlusTree(`${baseFilename}-documents.bjson`, order);
    this.documentLengths = trees?.documentLengths || new BPlusTree(`${baseFilename}-lengths.bjson`, order);
    this.isOpen = false;
  }

  async open() {
    if (this.isOpen) {
      throw new Error('TextIndex is already open');
    }

    await Promise.all([
      this.index.open(),
      this.documentTerms.open(),
      this.documentLengths.open()
    ]);

    this.isOpen = true;
  }

  async close() {
    if (!this.isOpen) {
      return;
    }

    await Promise.all([
      this.index.close(),
      this.documentTerms.close(),
      this.documentLengths.close()
    ]);

    this.isOpen = false;
  }

  _ensureOpen() {
    if (!this.isOpen) {
      throw new Error('TextIndex is not open');
    }
  }

  /**
   * Tokenize text into individual words
   * @param {string} text - The text to tokenize
   * @returns {string[]} Array of words
   */
  _tokenize(text) {
    if (typeof text !== 'string') {
      return [];
    }
    // Split on non-word characters and filter out empty strings
    const words = text.toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 0);
    
    // Filter stop words
    return words.filter(word => !STOPWORDS.has(word));
  }

  /**
   * Add terms from text to the index for a given document ID
   * @param {string} docId - The document identifier
   * @param {string} text - The text content to index
   */
  async add(docId, text) {
    this._ensureOpen();

    if (!docId) {
      throw new Error('Document ID is required');
    }

    const words = this._tokenize(text);
    const termFrequency = new Map();

    words.forEach(word => {
      const stem = stemmer(word);
      termFrequency.set(stem, (termFrequency.get(stem) || 0) + 1);
    });

    for (const [stem, frequency] of termFrequency.entries()) {
      const postings = (await this.index.search(stem)) || {};
      postings[docId] = frequency;
      await this.index.add(stem, postings);
    }

    const existingTerms = (await this.documentTerms.search(docId)) || {};
    const mergedTerms = { ...existingTerms };
    termFrequency.forEach((frequency, stem) => {
      mergedTerms[stem] = frequency;
    });

    const docLength = Object.values(mergedTerms).reduce((sum, count) => sum + count, 0);

    await this.documentTerms.add(docId, mergedTerms);
    await this.documentLengths.add(docId, docLength);
  }

  /**
   * Remove all indexed terms for a given document ID
   * @param {string} docId - The document identifier to remove
   * @returns {boolean} True if document was found and removed, false otherwise
   */
  async remove(docId) {
    this._ensureOpen();

    const terms = await this.documentTerms.search(docId);
    if (!terms) {
      return false;
    }

    for (const [term] of Object.entries(terms)) {
      const postings = (await this.index.search(term)) || {};
      delete postings[docId];

      if (Object.keys(postings).length === 0) {
        await this.index.delete(term);
      } else {
        await this.index.add(term, postings);
      }
    }

    await this.documentTerms.delete(docId);
    await this.documentLengths.delete(docId);
    return true;
  }

  /**
   * Query the index for documents containing the given terms with relevance scoring
   * @param {string} queryText - The search query text
   * @param {Object} options - Query options
   * @param {boolean} options.scored - If true, return scored results; if false, return just IDs (default: true)
   * @param {boolean} options.requireAll - If true, require ALL terms; if false, rank by relevance (default: false)
   * @returns {Array} Array of document IDs (if scored=false) or objects with {id, score} (if scored=true)
   */
  async query(queryText, options = { scored: true, requireAll: false }) {
    this._ensureOpen();

    const words = this._tokenize(queryText);
    if (words.length === 0) {
      return [];
    }

    const stemmedTerms = words.map(word => stemmer(word));
    const uniqueTerms = [...new Set(stemmedTerms)];

    if (options.requireAll) {
      const docSets = [];
      for (const term of uniqueTerms) {
        const termDocs = await this.index.search(term);
        docSets.push(new Set(Object.keys(termDocs || {})));
      }

      if (docSets.length === 0) {
        return [];
      }

      const intersection = new Set(docSets[0]);
      for (let i = 1; i < docSets.length; i++) {
        for (const docId of [...intersection]) {
          if (!docSets[i].has(docId)) {
            intersection.delete(docId);
          }
        }
      }

      return Array.from(intersection);
    }

    const docLengthEntries = await this.documentLengths.toArray();
    const docLengthMap = new Map(docLengthEntries.map(({ key, value }) => [String(key), value || 1]));
    const totalDocs = docLengthEntries.length;

    const idf = new Map();
    for (const term of uniqueTerms) {
      const termDocs = await this.index.search(term);
      const docsWithTerm = termDocs ? Object.keys(termDocs).length : 0;
      if (docsWithTerm > 0) {
        idf.set(term, Math.log(totalDocs / docsWithTerm));
      }
    }

    const docScores = new Map();
    for (const term of uniqueTerms) {
      const termDocs = await this.index.search(term);
      if (!termDocs) {
        continue;
      }

      for (const [docId, termFreq] of Object.entries(termDocs)) {
        const docLength = docLengthMap.get(docId) || 1;
        const tf = termFreq / docLength;
        const termIdf = idf.get(term) || 0;
        const prev = docScores.get(docId) || 0;
        docScores.set(docId, prev + tf * termIdf);
      }
    }

    for (const [docId, score] of docScores.entries()) {
      const docTerms = (await this.documentTerms.search(docId)) || {};
      const matchingTerms = uniqueTerms.filter(term => !!docTerms[term]).length;
      const coverage = matchingTerms / uniqueTerms.length;
      docScores.set(docId, score * (1 + coverage));
    }

    const results = Array.from(docScores.entries())
      .map(([id, score]) => ({ id, score }))
      .sort((a, b) => b.score - a.score);

    if (options.scored === false) {
      return results.map(r => r.id);
    }
    
    return results;
  }

  /**
   * Get the number of unique terms in the index
   * @returns {number} Number of unique terms
   */
  async getTermCount() {
    this._ensureOpen();
    const terms = await this.index.toArray();
    return terms.length;
  }

  /**
   * Get the number of documents in the index
   * @returns {number} Number of indexed documents
   */
  async getDocumentCount() {
    this._ensureOpen();
    const docs = await this.documentTerms.toArray();
    return docs.length;
  }

  /**
   * Clear all data from the index
   */
  async clear() {
    this._ensureOpen();

    const [terms, docs, lengths] = await Promise.all([
      this.index.toArray(),
      this.documentTerms.toArray(),
      this.documentLengths.toArray()
    ]);

    // Run deletes sequentially to avoid overlapping writes on the same underlying file
    for (const entry of terms) {
      await this.index.delete(entry.key);
    }

    for (const entry of docs) {
      await this.documentTerms.delete(entry.key);
    }

    for (const entry of lengths) {
      await this.documentLengths.delete(entry.key);
    }
  }

  /**
   * Compact all internal B+ trees into new files and switch the index to use them.
   * @param {string} destinationBase - Base filename (without suffixes) for the compacted files
   * @returns {Promise<{terms: object, documents: object, lengths: object}>}
   */
  async compact(destinationBase = `${this.baseFilename}-compact-${Date.now()}`) {
    this._ensureOpen();

    if (!destinationBase) {
      throw new Error('Destination base filename is required for compaction');
    }

    const termsDest = `${destinationBase}-terms.bjson`;
    const documentsDest = `${destinationBase}-documents.bjson`;
    const lengthsDest = `${destinationBase}-lengths.bjson`;

    const results = await Promise.all([
      this.index.compact(termsDest),
      this.documentTerms.compact(documentsDest),
      this.documentLengths.compact(lengthsDest)
    ]);

    const indexOrder = this.index.order;
    const documentsOrder = this.documentTerms.order;
    const lengthsOrder = this.documentLengths.order;

    await this.close();

    this.baseFilename = destinationBase;
    this.index = new BPlusTree(termsDest, indexOrder);
    this.documentTerms = new BPlusTree(documentsDest, documentsOrder);
    this.documentLengths = new BPlusTree(lengthsDest, lengthsOrder);

    await this.open();

    return {
      terms: results[0],
      documents: results[1],
      lengths: results[2]
    };
  }

}

// Re-export the stemmer so consumers can share the exact same implementation
export { stemmer };
