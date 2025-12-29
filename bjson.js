/**
 * Binary JSON Encoder/Decoder
 * 
 * Encodes JavaScript values to a compact binary format compatible with
 * Origin Private File System (OPFS).
 */

const TYPE = {
  NULL: 0x00,
  FALSE: 0x01,
  TRUE: 0x02,
  INT: 0x03,
  FLOAT: 0x04,
  STRING: 0x05,
  OID: 0x06,
  DATE: 0x07,
  ARRAY: 0x10,
  OBJECT: 0x11
};


/**
 * ObjectId class - MongoDB-compatible 24-character hex string identifier
 * Format: 8-char timestamp + 16-char random data
 */
class ObjectId {
  constructor(id) {
    if (id === undefined || id === null) {
      // Generate new ObjectId
      this.id = ObjectId.generate();
    } else if (typeof id === 'string') {
      // Create from hex string
      if (!ObjectId.isValid(id)) {
        throw new Error(`Argument passed in must be a string of 24 hex characters, got: ${id}`);
      }
      this.id = id.toLowerCase();
    } else if (id instanceof Uint8Array && id.length === 12) {
      this.id = Array.from(id).map(b => b.toString(16).padStart(2, '0')).join('');
    } else if (id instanceof ObjectId) {
      // Copy constructor
      this.id = id.id;
    } else {
      throw new Error(`Argument passed in must be a string of 24 hex characters or an ObjectId`);
    }
  }

  /**
   * Returns the ObjectId as a 24-character hex string
   */
  toString() {
    return this.id;
  }

  /**
   * Returns the ObjectId as a 24-character hex string (alias for toString)
   */
  toHexString() {
    return this.id;
  }

  /**
   * Returns the timestamp portion of the ObjectId as a Date
   */
  getTimestamp() {
    const timestamp = parseInt(this.id.substring(0, 8), 16);
    return new Date(timestamp * 1000);
  }

  /**
   * Compares this ObjectId with another for equality
   */
  equals(other) {
    if (!other) return false;
    
    if (other instanceof ObjectId) {
      return this.id === other.id;
    }
    
    if (typeof other === 'string') {
      return this.id === other.toLowerCase();
    }
    
    // Handle objects with id property
    if (other.id) {
      return this.id === other.id;
    }
    
    return false;
  }

  /**
   * Returns the ObjectId in JSON format (as hex string)
   */
  toJSON() {
    return this.id;
  }

  /**
   * Custom inspect for Node.js console.log
   */
  inspect() {
    return `ObjectId("${this.id}")`;
  }

  toBytes() {
    const bytes = new Uint8Array(12);
    for (let i = 0; i < 12; i++) {
      bytes[i] = parseInt(this.id.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }

  /**
   * Validates if a string is a valid ObjectId hex string
   */
  static isValid(id) {
    if (!id) return false;
    if (typeof id !== 'string') return false;
    if (id.length !== 24) return false;
    return /^[0-9a-fA-F]{24}$/.test(id);
  }

  /**
   * Creates an ObjectId from a timestamp
   */
  static createFromTime(timestamp) {
    const ts = Math.floor(timestamp / 1000);
    const tsHex = ('00000000' + ts.toString(16)).slice(-8);
    const tail = '0000000000000000'; // Zero out the random portion
    return new ObjectId(tsHex + tail);
  }

  /**
   * Generates a new ObjectId hex string
   * Format: 8-char timestamp (4 bytes) + 16-char random data (8 bytes)
   */
  static generate() {
    const ts = Math.floor(Date.now() / 1000);
    
    // Generate 8 random bytes
    const rand = typeof crypto !== 'undefined' && crypto.getRandomValues ? new Uint8Array(8) : null;
    let tail = '';
    
    if (rand) {
      crypto.getRandomValues(rand);
      for (let i = 0; i < rand.length; i++) {
        tail += ('0' + rand[i].toString(16)).slice(-2);
      }
    } else {
      // Fallback for environments without crypto
      // Generate two 8-character hex strings
      tail = Math.random().toString(16).slice(2).padEnd(8, '0').slice(0, 8) +
             Math.random().toString(16).slice(2).padEnd(8, '0').slice(0, 8);
    }
    
    const tsHex = ('00000000' + ts.toString(16)).slice(-8);
    return (tsHex + tail).slice(0, 24);
  }
}

/**
 * Encode a JavaScript value to binary format
 */
function encode(value) {
  const buffers = [];

  function encodeValue(val) {
    if (val === null) {
      buffers.push(new Uint8Array([TYPE.NULL]));
    } else if (val === false) {
      buffers.push(new Uint8Array([TYPE.FALSE]));
    } else if (val === true) {
      buffers.push(new Uint8Array([TYPE.TRUE]));
    } else if (val instanceof ObjectId) {
      buffers.push(new Uint8Array([TYPE.OID]));
      buffers.push(val.toBytes());
    } else if (val instanceof Date) {
      buffers.push(new Uint8Array([TYPE.DATE]));
      const buffer = new ArrayBuffer(8);
      const view = new DataView(buffer);
      view.setBigInt64(0, BigInt(val.getTime()), true); // little-endian
      buffers.push(new Uint8Array(buffer));
    } else if (typeof val === 'number') {
      if (Number.isInteger(val) && val >= -2147483648 && val <= 2147483647) {
        // 32-bit signed integer
        buffers.push(new Uint8Array([TYPE.INT]));
        const buffer = new ArrayBuffer(4);
        const view = new DataView(buffer);
        view.setInt32(0, val, true); // little-endian
        buffers.push(new Uint8Array(buffer));
      } else {
        // 64-bit float
        buffers.push(new Uint8Array([TYPE.FLOAT]));
        const buffer = new ArrayBuffer(8);
        const view = new DataView(buffer);
        view.setFloat64(0, val, true); // little-endian
        buffers.push(new Uint8Array(buffer));
      }
    } else if (typeof val === 'string') {
      buffers.push(new Uint8Array([TYPE.STRING]));
      const encoded = new TextEncoder().encode(val);
      // Store length as 32-bit integer
      const lengthBuffer = new ArrayBuffer(4);
      const lengthView = new DataView(lengthBuffer);
      lengthView.setUint32(0, encoded.length, true);
      buffers.push(new Uint8Array(lengthBuffer));
      buffers.push(encoded);
    } else if (Array.isArray(val)) {
      buffers.push(new Uint8Array([TYPE.ARRAY]));
      // Store array length as 32-bit integer
      const lengthBuffer = new ArrayBuffer(4);
      const lengthView = new DataView(lengthBuffer);
      lengthView.setUint32(0, val.length, true);
      buffers.push(new Uint8Array(lengthBuffer));
      // Encode each element
      for (const item of val) {
        encodeValue(item);
      }
    } else if (typeof val === 'object') {
      buffers.push(new Uint8Array([TYPE.OBJECT]));
      const keys = Object.keys(val);
      // Store number of keys as 32-bit integer
      const lengthBuffer = new ArrayBuffer(4);
      const lengthView = new DataView(lengthBuffer);
      lengthView.setUint32(0, keys.length, true);
      buffers.push(new Uint8Array(lengthBuffer));
      // Encode each key-value pair
      for (const key of keys) {
        // Encode key as string (without type byte)
        const encoded = new TextEncoder().encode(key);
        const keyLengthBuffer = new ArrayBuffer(4);
        const keyLengthView = new DataView(keyLengthBuffer);
        keyLengthView.setUint32(0, encoded.length, true);
        buffers.push(new Uint8Array(keyLengthBuffer));
        buffers.push(encoded);
        // Encode value
        encodeValue(val[key]);
      }
    } else {
      throw new Error(`Unsupported type: ${typeof val}`);
    }
  }

  encodeValue(value);

  // Combine all buffers
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of buffers) {
    result.set(buf, offset);
    offset += buf.length;
  }

  return result;
}

/**
 * Decode binary data to JavaScript value
 */
function decode(data) {
  let offset = 0;

  function decodeValue() {
    if (offset >= data.length) {
      throw new Error('Unexpected end of data');
    }

    const type = data[offset++];

    switch (type) {
      case TYPE.NULL:
        return null;
      
      case TYPE.FALSE:
        return false;
      
      case TYPE.TRUE:
        return true;
      
      case TYPE.INT: {
        if (offset + 4 > data.length) {
          throw new Error('Unexpected end of data for INT');
        }
        const view = new DataView(data.buffer, data.byteOffset + offset, 4);
        const value = view.getInt32(0, true);
        offset += 4;
        return value;
      }
      
      case TYPE.FLOAT: {
        if (offset + 8 > data.length) {
          throw new Error('Unexpected end of data for FLOAT');
        }
        const view = new DataView(data.buffer, data.byteOffset + offset, 8);
        const value = view.getFloat64(0, true);
        offset += 8;
        return value;
      }
      
      case TYPE.STRING: {
        if (offset + 4 > data.length) {
          throw new Error('Unexpected end of data for STRING length');
        }
        const lengthView = new DataView(data.buffer, data.byteOffset + offset, 4);
        const length = lengthView.getUint32(0, true);
        offset += 4;
        
        if (offset + length > data.length) {
          throw new Error('Unexpected end of data for STRING content');
        }
        const stringData = data.slice(offset, offset + length);
        offset += length;
        return new TextDecoder().decode(stringData);
      }
      
      case TYPE.OID: {
        if (offset + 12 > data.length) {
          throw new Error('Unexpected end of data for OID');
        }
        const oidBytes = data.slice(offset, offset + 12);
        offset += 12;
        return new ObjectId(oidBytes);
      }
      
      case TYPE.DATE: {
        if (offset + 8 > data.length) {
          throw new Error('Unexpected end of data for DATE');
        }
        const view = new DataView(data.buffer, data.byteOffset + offset, 8);
        const timestamp = view.getBigInt64(0, true);
        offset += 8;
        return new Date(Number(timestamp));
      }
      
      case TYPE.ARRAY: {
        if (offset + 4 > data.length) {
          throw new Error('Unexpected end of data for ARRAY length');
        }
        const lengthView = new DataView(data.buffer, data.byteOffset + offset, 4);
        const length = lengthView.getUint32(0, true);
        offset += 4;
        
        const arr = [];
        for (let i = 0; i < length; i++) {
          arr.push(decodeValue());
        }
        return arr;
      }
      
      case TYPE.OBJECT: {
        if (offset + 4 > data.length) {
          throw new Error('Unexpected end of data for OBJECT length');
        }
        const lengthView = new DataView(data.buffer, data.byteOffset + offset, 4);
        const length = lengthView.getUint32(0, true);
        offset += 4;
        
        const obj = {};
        for (let i = 0; i < length; i++) {
          // Decode key
          if (offset + 4 > data.length) {
            throw new Error('Unexpected end of data for OBJECT key length');
          }
          const keyLengthView = new DataView(data.buffer, data.byteOffset + offset, 4);
          const keyLength = keyLengthView.getUint32(0, true);
          offset += 4;
          
          if (offset + keyLength > data.length) {
            throw new Error('Unexpected end of data for OBJECT key');
          }
          const keyData = data.slice(offset, offset + keyLength);
          offset += keyLength;
          const key = new TextDecoder().decode(keyData);
          
          // Decode value
          obj[key] = decodeValue();
        }
        return obj;
      }
      
      default:
        throw new Error(`Unknown type byte: 0x${type.toString(16)}`);
    }
  }

  return decodeValue();
}

/**
 * OPFS File Operations
 */
class BJsonFile {
  constructor(filename) {
    this.filename = filename;
    this.root = null;
    this.fileHandle = null;
  }

  async init() {
    if (!navigator.storage || !navigator.storage.getDirectory) {
      throw new Error('Origin Private File System (OPFS) is not supported in this browser');
    }
    this.root = await navigator.storage.getDirectory();
  }

  async write(data) {
    await this.init();
    
    // Encode data to binary
    const binaryData = encode(data);
    
    // Get file handle
    this.fileHandle = await this.root.getFileHandle(this.filename, { create: true });
    
    // Create writable stream
    const writable = await this.fileHandle.createWritable();
    
    // Write data
    await writable.write(binaryData);
    await writable.close();
  }

  async read() {
    await this.init();
    
    try {
      // Get file handle
      this.fileHandle = await this.root.getFileHandle(this.filename);
      
      // Get file
      const file = await this.fileHandle.getFile();
      
      // Read as array buffer
      const arrayBuffer = await file.arrayBuffer();
      const binaryData = new Uint8Array(arrayBuffer);
      
      // Decode and return
      return decode(binaryData);
    } catch (error) {
      if (error.name === 'NotFoundError') {
        throw new Error(`File not found: ${this.filename}`);
      }
      throw error;
    }
  }

  async append(data) {
    await this.init();
    
    // Encode new data to binary
    const binaryData = encode(data);
    
    // Get file handle
    this.fileHandle = await this.root.getFileHandle(this.filename, { create: true });
    
    // Get existing file size
    const file = await this.fileHandle.getFile();
    const existingSize = file.size;
    
    // Create writable stream
    const writable = await this.fileHandle.createWritable({ keepExistingData: true });
    
    // Seek to end
    await writable.seek(existingSize);
    
    // Write new data
    await writable.write(binaryData);
    await writable.close();
  }

  async *scan() {
    await this.init();
    
    try {
      // Get file handle
      this.fileHandle = await this.root.getFileHandle(this.filename);
      
      // Get file
      const file = await this.fileHandle.getFile();
      
      // Read as array buffer
      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      
      let offset = 0;
      
      // Scan through and yield each top-level value
      while (offset < data.length) {
        function getValueSize(dataView, startPos) {
          let pos = startPos;
          if (pos >= dataView.length) return 0;
          
          const type = dataView[pos++];
          
          switch (type) {
            case TYPE.NULL:
            case TYPE.FALSE:
            case TYPE.TRUE:
              return 1;
            
            case TYPE.INT:
              return 1 + 4;
            
            case TYPE.FLOAT:
              return 1 + 8;
            
            case TYPE.OID:
              return 1 + 12;
            
            case TYPE.DATE:
              return 1 + 8;
            
            case TYPE.STRING: {
              const lengthView = new DataView(dataView.buffer, dataView.byteOffset + pos, 4);
              const length = lengthView.getUint32(0, true);
              return 1 + 4 + length;
            }
            
            case TYPE.ARRAY: {
              let size = 1 + 4; // type + length
              const lengthView = new DataView(dataView.buffer, dataView.byteOffset + pos, 4);
              const length = lengthView.getUint32(0, true);
              pos += 4;
              for (let i = 0; i < length; i++) {
                const elementSize = getValueSize(dataView, pos);
                size += elementSize;
                pos += elementSize;
              }
              return size;
            }
            
            case TYPE.OBJECT: {
              let size = 1 + 4; // type + length
              const lengthView = new DataView(dataView.buffer, dataView.byteOffset + pos, 4);
              const numKeys = lengthView.getUint32(0, true);
              pos += 4;
              for (let i = 0; i < numKeys; i++) {
                // Key length + key
                const keyLengthView = new DataView(dataView.buffer, dataView.byteOffset + pos, 4);
                const keyLength = keyLengthView.getUint32(0, true);
                size += 4 + keyLength;
                pos += 4 + keyLength;
                // Value
                const valueSize = getValueSize(dataView, pos);
                size += valueSize;
                pos += valueSize;
              }
              return size;
            }
            
            default:
              throw new Error(`Unknown type byte: 0x${type.toString(16)}`);
          }
        }
        
        const valueSize = getValueSize(data, offset);
        const valueData = data.slice(offset, offset + valueSize);
        offset += valueSize;
        
        // Decode and yield this value
        yield decode(valueData);
      }
    } catch (error) {
      if (error.name === 'NotFoundError') {
        throw new Error(`File not found: ${this.filename}`);
      }
      throw error;
    }
  }

  async delete() {
    await this.init();
    try {
      await this.root.removeEntry(this.filename);
    } catch (error) {
      if (error.name === 'NotFoundError') {
        // File doesn't exist, nothing to delete
        return;
      }
      throw error;
    }
  }

  async exists() {
    await this.init();
    try {
      await this.root.getFileHandle(this.filename);
      return true;
    } catch (error) {
      if (error.name === 'NotFoundError') {
        return false;
      }
      throw error;
    }
  }
}

export {
  TYPE,
  ObjectId,
  encode,
  decode,
  BJsonFile
};
