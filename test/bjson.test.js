/**
 * Test suite for bjson encoder/decoder
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { TYPE, ObjectId, Pointer, encode, decode, BJsonFile } from '../src/bjson.js';

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

describe('Binary JSON Encoder/Decoder', () => {
  describe('NULL', () => {
    it('should encode null to 1 byte', () => {
      const encoded = encode(null);
      expect(encoded).toHaveLength(1);
      expect(encoded[0]).toBe(TYPE.NULL);
    });

    it('should round-trip null', () => {
      const encoded = encode(null);
      const decoded = decode(encoded);
      expect(decoded).toBe(null);
    });
  });

  describe('FALSE', () => {
    it('should encode false to 1 byte', () => {
      const encoded = encode(false);
      expect(encoded).toHaveLength(1);
      expect(encoded[0]).toBe(TYPE.FALSE);
    });

    it('should round-trip false', () => {
      const encoded = encode(false);
      const decoded = decode(encoded);
      expect(decoded).toBe(false);
    });
  });

  describe('TRUE', () => {
    it('should encode true to 1 byte', () => {
      const encoded = encode(true);
      expect(encoded).toHaveLength(1);
      expect(encoded[0]).toBe(TYPE.TRUE);
    });

    it('should round-trip true', () => {
      const encoded = encode(true);
      const decoded = decode(encoded);
      expect(decoded).toBe(true);
    });
  });

  describe('INT', () => {
    it('should encode integer to 9 bytes', () => {
      const encoded = encode(42);
      expect(encoded).toHaveLength(9);
      expect(encoded[0]).toBe(TYPE.INT);
    });

    it('should round-trip positive integer', () => {
      expect(decode(encode(42))).toBe(42);
    });

    it('should round-trip negative integer', () => {
      expect(decode(encode(-123))).toBe(-123);
    });

    it('should round-trip max 32-bit integer', () => {
      expect(decode(encode(2147483647))).toBe(2147483647);
    });

    it('should round-trip min 32-bit integer', () => {
      expect(decode(encode(-2147483648))).toBe(-2147483648);
    });
  });

  describe('FLOAT', () => {
    it('should encode float to 9 bytes', () => {
      const encoded = encode(3.14159);
      expect(encoded).toHaveLength(9);
      expect(encoded[0]).toBe(TYPE.FLOAT);
    });

    it('should round-trip float', () => {
      const value = 3.14159;
      const decoded = decode(encode(value));
      expect(Math.abs(decoded - value)).toBeLessThan(0.00001);
    });

    it('should round-trip large float', () => {
      expect(decode(encode(1e100))).toBe(1e100);
    });

    it('should round-trip negative float', () => {
      expect(decode(encode(-2.5))).toBe(-2.5);
    });
  });

  describe('STRING', () => {
    it('should have correct type byte', () => {
      const encoded = encode('hello');
      expect(encoded[0]).toBe(TYPE.STRING);
    });

    it('should round-trip simple string', () => {
      expect(decode(encode('hello'))).toBe('hello');
    });

    it('should round-trip empty string', () => {
      expect(decode(encode(''))).toBe('');
    });

    it('should round-trip unicode string', () => {
      const text = 'Hello 世界 🌍';
      expect(decode(encode(text))).toBe(text);
    });
  });

  describe('ObjectId', () => {
    it('should convert to string', () => {
      const oid = new ObjectId('507f1f77bcf86cd799439011');
      expect(oid.toString()).toBe('507f1f77bcf86cd799439011');
    });

    it('should encode to 13 bytes', () => {
      const oid = new ObjectId('507f1f77bcf86cd799439011');
      const encoded = encode(oid);
      expect(encoded).toHaveLength(13);
      expect(encoded[0]).toBe(TYPE.OID);
    });

    it('should round-trip ObjectId', () => {
      const oid = new ObjectId('507f1f77bcf86cd799439011');
      const decoded = decode(encode(oid));
      expect(decoded).toBeInstanceOf(ObjectId);
      expect(decoded.toString()).toBe('507f1f77bcf86cd799439011');
    });

    it('should throw on invalid ObjectId', () => {
      expect(() => new ObjectId('invalid')).toThrow();
    });

    it('should validate ObjectId format', () => {
      expect(ObjectId.isValid('507f1f77bcf86cd799439011')).toBe(true);
      expect(ObjectId.isValid('invalid')).toBe(false);
    });
  });

  describe('DATE', () => {
    it('should encode date to 9 bytes', () => {
      const date = new Date('2023-01-15T12:30:45.000Z');
      const encoded = encode(date);
      expect(encoded).toHaveLength(9);
      expect(encoded[0]).toBe(TYPE.DATE);
    });

    it('should round-trip date', () => {
      const date = new Date('2023-01-15T12:30:45.000Z');
      const decoded = decode(encode(date));
      expect(decoded).toBeInstanceOf(Date);
      expect(decoded.getTime()).toBe(date.getTime());
    });

    it('should round-trip epoch date', () => {
      const date = new Date(0);
      expect(decode(encode(date)).getTime()).toBe(0);
    });

    it('should round-trip future date', () => {
      const date = new Date('2099-12-31T23:59:59.999Z');
      expect(decode(encode(date)).getTime()).toBe(date.getTime());
    });
  });

  describe('POINTER', () => {
    it('should get value via valueOf()', () => {
      const ptr = new Pointer(1024);
      expect(ptr.valueOf()).toBe(1024);
    });

    it('should convert to string', () => {
      const ptr = new Pointer(1024);
      expect(ptr.toString()).toBe('1024');
    });

    it('should encode to 9 bytes', () => {
      const ptr = new Pointer(1024);
      const encoded = encode(ptr);
      expect(encoded).toHaveLength(9);
      expect(encoded[0]).toBe(TYPE.POINTER);
    });

    it('should round-trip pointer', () => {
      const ptr = new Pointer(1024);
      const decoded = decode(encode(ptr));
      expect(decoded).toBeInstanceOf(Pointer);
      expect(decoded.valueOf()).toBe(1024);
    });

    it('should round-trip zero pointer', () => {
      const ptr = new Pointer(0);
      expect(decode(encode(ptr)).valueOf()).toBe(0);
    });

    it('should round-trip max safe integer pointer', () => {
      const ptr = new Pointer(9007199254740991); // MAX_SAFE_INTEGER
      expect(decode(encode(ptr)).valueOf()).toBe(9007199254740991);
    });

    it('should throw on negative offset', () => {
      expect(() => new Pointer(-1)).toThrow();
    });

    it('should throw on non-number offset', () => {
      expect(() => new Pointer('invalid')).toThrow();
    });

    it('should throw on non-integer offset', () => {
      expect(() => new Pointer(3.14)).toThrow();
    });

    it('should compare equal pointers', () => {
      const ptr1 = new Pointer(100);
      const ptr2 = new Pointer(100);
      expect(ptr1.equals(ptr2)).toBe(true);
    });

    it('should compare different pointers as not equal', () => {
      const ptr1 = new Pointer(100);
      const ptr3 = new Pointer(200);
      expect(ptr1.equals(ptr3)).toBe(false);
    });
  });

  describe('ARRAY', () => {
    it('should have correct type byte', () => {
      const encoded = encode([1, 2, 3]);
      expect(encoded[0]).toBe(TYPE.ARRAY);
    });

    it('should round-trip simple array', () => {
      expect(decode(encode([1, 2, 3]))).toEqual([1, 2, 3]);
    });

    it('should round-trip empty array', () => {
      expect(decode(encode([]))).toEqual([]);
    });

    it('should round-trip mixed type array', () => {
      const arr = [1, 'hello', true, null, 3.14];
      expect(decode(encode(arr))).toEqual(arr);
    });

    it('should round-trip nested array', () => {
      const arr = [[1, 2], [3, 4]];
      expect(decode(encode(arr))).toEqual(arr);
    });
  });

  describe('OBJECT', () => {
    it('should have correct type byte', () => {
      const encoded = encode({ a: 1, b: 2 });
      expect(encoded[0]).toBe(TYPE.OBJECT);
    });

    it('should round-trip simple object', () => {
      expect(decode(encode({ a: 1, b: 2 }))).toEqual({ a: 1, b: 2 });
    });

    it('should round-trip empty object', () => {
      expect(decode(encode({}))).toEqual({});
    });

    it('should round-trip mixed type object', () => {
      const obj = { num: 42, str: 'test', bool: true, nil: null, float: 3.14 };
      expect(decode(encode(obj))).toEqual(obj);
    });

    it('should round-trip nested object', () => {
      const obj = { user: { name: 'John', age: 30 }, items: [1, 2, 3] };
      expect(decode(encode(obj))).toEqual(obj);
    });
  });

  describe('Complex Structures', () => {
    it('should round-trip complex nested structure', () => {
      const data = {
        name: 'Test Document',
        count: 42,
        price: 99.99,
        active: true,
        tags: ['javascript', 'binary', 'json'],
        metadata: {
          created: 1234567890,
          updated: null,
          nested: { deep: 'value' }
        },
        items: [
          { id: 1, name: 'Item 1' },
          { id: 2, name: 'Item 2' }
        ]
      };

      const encoded = encode(data);
      const decoded = decode(encoded);
      expect(decoded).toEqual(data);
    });
  });

  describe('Pointer with File Offset Simulation', () => {
    it('should handle pointer in record', () => {
      const targetData = { id: 123, name: 'Referenced Data', value: 42 };
      const targetEncoded = encode(targetData);

      const record = {
        type: 'reference',
        dataPointer: new Pointer(1024),
        metadata: 'This record points to data at offset 1024'
      };

      const encoded = encode(record);
      const decoded = decode(encoded);

      expect(decoded.dataPointer).toBeInstanceOf(Pointer);
      expect(decoded.dataPointer.valueOf()).toBe(1024);
    });
  });

  describe('Error Handling', () => {
    it('should throw on unknown type byte', () => {
      expect(() => decode(new Uint8Array([0xFF]))).toThrow();
    });

    it('should throw on incomplete INT', () => {
      expect(() => decode(new Uint8Array([TYPE.INT, 0x00]))).toThrow();
    });

    it('should throw on incomplete STRING', () => {
      expect(() => decode(new Uint8Array([TYPE.STRING, 0x0A, 0x00, 0x00, 0x00]))).toThrow();
    });
  });
});

describe.skipIf(!hasOPFS)('BJsonFile', () => {
  const testFiles = ['test-bjsonfile.bjson', 'test-bjsonfile2.bjson'];

  afterEach(async () => {
    // Clean up test files
    for (const filename of testFiles) {
      try {
        const file = new BJsonFile(filename);
        if (await file.exists()) {
          await file.open('rw');
          await file.delete();
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });

  it('should write and read file', async () => {
    const file = new BJsonFile('test-bjsonfile.bjson');
    await file.open('rw');

    const data = {
      name: 'Test Document',
      count: 42,
      price: 99.99,
      active: true,
      tags: ['javascript', 'binary', 'json'],
      metadata: {
        created: 1234567890,
        updated: null
      }
    };

    await file.write(data);
    await file.close();

    await file.open('r');
    const readData = await file.read();
    await file.close();

    expect(readData.name).toBe('Test Document');
    expect(readData.count).toBe(42);
    expect(readData.price).toBe(99.99);
    expect(readData.active).toBe(true);
    expect(readData.tags).toHaveLength(3);
    expect(readData.metadata.updated).toBe(null);
  });

  it('should check file existence', async () => {
    const file = new BJsonFile('test-bjsonfile.bjson');
    await file.open('rw');
    await file.write({ test: 'data' });
    await file.close();

    expect(await file.exists()).toBe(true);

    const nonExistent = new BJsonFile('nonexistent.bjson');
    expect(await nonExistent.exists()).toBe(false);
  });

  it('should append and scan records', async () => {
    const file = new BJsonFile('test-bjsonfile2.bjson');
    
    // Write first record
    await file.open('rw');
    await file.write({ id: 1, name: 'First' });
    await file.close();

    // Append second record
    await file.open('rw');
    await file.append({ id: 2, name: 'Second' });
    await file.close();

    // Scan records
    await file.open('r');
    const records = [];
    for await (const record of file.scan()) {
      records.push(record);
    }
    await file.close();

    expect(records).toHaveLength(2);
    expect(records[0].id).toBe(1);
    expect(records[1].id).toBe(2);
  });

  it('should enforce read-only mode', async () => {
    const file = new BJsonFile('test-bjsonfile.bjson');
    await file.open('rw');
    await file.write({ test: 'data' });
    await file.close();

    await file.open('r');
    expect(() => file.ensureWritable()).toThrow();
    await file.close();
  });

  it('should delete file', async () => {
    const file = new BJsonFile('test-bjsonfile.bjson');
    await file.open('rw');
    await file.write({ test: 'data' });
    await file.delete();

    expect(await file.exists()).toBe(false);
  });
});
