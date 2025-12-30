# Binary JSON (BJson)

A compact binary encoding format for JSON data with support for Origin Private File System (OPFS) in browsers. This library enables efficient storage and retrieval of JSON data in a binary format, with support for MongoDB ObjectIds.

## Features

- 🚀 **Compact Binary Format**: Efficient binary encoding of JSON data
- 💾 **OPFS Support**: Read and write binary JSON files using Origin Private File System
- 🔄 **Full Round-trip**: Perfect encoding and decoding of all JSON types
- 📦 **MongoDB ObjectId Support**: Native support for MongoDB ObjectIds (24-character hex strings)
- 🎯 **File Pointer Support**: Built-in Pointer type for storing 64-bit file offsets for indexed data access
- 🔍 **File Scanning**: Ability to scan through files and read records sequentially
- ➕ **Append Operations**: Append new records to existing files
- 🌐 **Browser & Node.js**: Works in both browser and Node.js environments

## Type Encoding

The library uses the following byte values for encoding JSON types:

| Type    | Byte Value | Data Format                                          |
|---------|-----------|------------------------------------------------------|
| NULL    | 0x00      | No additional data                                   |
| FALSE   | 0x01      | No additional data                                   |
| TRUE    | 0x02      | No additional data                                   |
| INT     | 0x03      | 4 bytes (32-bit signed integer, little-endian)      |
| FLOAT   | 0x04      | 8 bytes (64-bit float, little-endian)               |
| STRING  | 0x05      | 4-byte length + UTF-8 encoded bytes                 |
| OID     | 0x06      | 12 bytes (MongoDB ObjectId)                         |
| DATE    | 0x07      | 8 bytes (64-bit signed integer milliseconds, little-endian) |
| POINTER | 0x08      | 8 bytes (64-bit non-negative integer file offset, little-endian) |
| ARRAY   | 0x10      | 4-byte length + encoded elements                    |
| OBJECT  | 0x11      | 4-byte count + key-value pairs                      |

## Installation

### Node.js

```bash
npm install bjson
```

### Browser

Include the script in your HTML:

```html
<script src="bjson.js"></script>
```

## Usage

### Basic Encoding and Decoding

```javascript
const { encode, decode } = require('./bjson.js');

// Encode data to binary
const data = { name: 'John', age: 30, active: true };
const binary = encode(data);

// Decode binary back to data
const decoded = decode(binary);
console.log(decoded); // { name: 'John', age: 30, active: true }
```

### Using MongoDB ObjectId

```javascript
const { ObjectId, encode, decode } = require('./bjson.js');

const data = {
  _id: new ObjectId('507f1f77bcf86cd799439011'),
  name: 'Document'
};

const binary = encode(data);
const decoded = decode(binary);

console.log(decoded._id.toString()); // '507f1f77bcf86cd799439011'
```

### Using Date Objects

```javascript
const { encode, decode } = require('./bjson.js');

const data = {
  timestamp: new Date('2023-01-15T12:30:45Z'),
  message: 'Hello'
};

const binary = encode(data);
const decoded = decode(binary);

console.log(decoded.timestamp); // Date object: 2023-01-15T12:30:45.000Z
console.log(decoded.message); // 'Hello'
```

### Using Pointer for File Offsets

```javascript
const { Pointer, encode, decode } = require('./bjson.js');

// Create an index record with a pointer to data at offset 2048
const indexRecord = {
  key: 'user_123',
  dataOffset: new Pointer(2048)
};

const binary = encode(indexRecord);
const decoded = decode(binary);

console.log(decoded.dataOffset.valueOf()); // 2048
// Use the pointer to seek to that position in a file and read data
```

### OPFS File Operations (Browser Only)

#### Write to File

```javascript
const { BJsonFile } = window.BJson;

const file = new BJsonFile('data.bjson');
const data = { name: 'John', age: 30 };

await file.write(data);
```

#### Read from File

```javascript
const file = new BJsonFile('data.bjson');
const data = await file.read();

console.log(data); // { name: 'John', age: 30 }
```

#### Append to File

```javascript
const file = new BJsonFile('data.bjson');

// Write initial record
await file.write({ id: 1, name: 'Record 1' });

// Append more records
await file.append({ id: 2, name: 'Record 2' });
await file.append({ id: 3, name: 'Record 3' });
```

#### Scan File (Read All Records)

```javascript
const file = new BJsonFile('data.bjson');

for await (const record of file.scan()) {
  console.log(record);
}
// Output:
// { id: 1, name: 'Record 1' }
// { id: 2, name: 'Record 2' }
// { id: 3, name: 'Record 3' }
```

#### Other File Operations

```javascript
const file = new BJsonFile('data.bjson');

// Check if file exists
const exists = await file.exists();
console.log(exists); // true or false

// Delete file
await file.delete();
```

## Browser Support

The OPFS functionality requires browsers that support the Origin Private File System API:

- Chrome 102+
- Edge 102+
- Opera 88+
- Other Chromium-based browsers

For other browsers, the encoding and decoding functions work normally, but file operations are not available.

## Demo

Open `demo.html` in a supported browser to see an interactive demonstration of all features.

## API Reference

### `encode(value)`

Encodes a JavaScript value to binary format.

- **Parameters**: `value` - Any JSON-serializable value (including ObjectId)
- **Returns**: `Uint8Array` - Binary encoded data

### `decode(data)`

Decodes binary data to a JavaScript value.

- **Parameters**: `data` - `Uint8Array` containing binary encoded data
- **Returns**: Decoded JavaScript value

### `ObjectId`

Class representing a MongoDB ObjectId.

#### Constructor

```javascript
new ObjectId(value)
```

- **Parameters**: 
  - `value` - Either a 24-character hex string or 12-byte Uint8Array

#### Methods

- `toString()` - Returns the ObjectId as a 24-character hex string
- `toBytes()` - Returns the ObjectId as a 12-byte Uint8Array
- `static isValid(value)` - Checks if a string is a valid ObjectId format

### `Pointer`

Class representing a file offset pointer.

#### Constructor

```javascript
new Pointer(offset)
```

- **Parameters**: 
  - `offset` - A non-negative integer representing a file byte offset (must be within Number.MAX_SAFE_INTEGER)

#### Methods

- `valueOf()` - Returns the offset as a number
- `toString()` - Returns the offset as a string
- `toJSON()` - Returns the offset as a number for JSON serialization
- `equals(other)` - Compares this Pointer with another for equality

### `BJsonFile`

Class for OPFS file operations (browser only).

#### Constructor

```javascript
new BJsonFile(filename)
```

- **Parameters**: `filename` - Name of the file in OPFS

#### Methods

- `async write(data)` - Write data to file (overwrites existing)
- `async read()` - Read and decode data from file
- `async append(data)` - Append data to existing file
- `async *scan()` - Async generator to scan through all records in file
- `async delete()` - Delete the file
- `async exists()` - Check if file exists

## Examples

### Complex Data Structure

```javascript
const { ObjectId, encode, decode } = require('./bjson.js');

const document = {
  _id: new ObjectId('507f1f77bcf86cd799439011'),
  name: 'Product',
  price: 99.99,
  inStock: true,
  tags: ['electronics', 'featured'],
  metadata: {
    created: 1234567890,
    updated: null,
    stats: {
      views: 1500,
      purchases: 42
    }
  },
  reviews: [
    { rating: 5, comment: 'Great product!' },
    { rating: 4, comment: 'Good value' }
  ]
};

const binary = encode(document);
console.log(`Encoded size: ${binary.length} bytes`);

const decoded = decode(binary);
console.log(decoded);
```

### Batch File Operations

```javascript
const file = new BJsonFile('products.bjson');

// Write multiple products
const products = [
  { id: 1, name: 'Product 1', price: 10.00 },
  { id: 2, name: 'Product 2', price: 20.00 },
  { id: 3, name: 'Product 3', price: 30.00 }
];

// Write first product
await file.write(products[0]);

// Append remaining products
for (let i = 1; i < products.length; i++) {
  await file.append(products[i]);
}

// Read all products
const allProducts = [];
for await (const product of file.scan()) {
  allProducts.push(product);
}

console.log(allProducts);
```

### Using Pointers for File Seeking

```javascript
const { Pointer, encode, decode } = require('./bjson.js');
const fs = require('fs');

// Scenario: Build an index of records with pointers to actual data locations

// Step 1: Write data records and track their offsets
const records = [
  { id: 1, name: 'Alice', email: 'alice@example.com' },
  { id: 2, name: 'Bob', email: 'bob@example.com' },
  { id: 3, name: 'Charlie', email: 'charlie@example.com' }
];

const dataFile = 'data.bjson';
const indexFile = 'index.bjson';
const index = [];

// Write records and build index
let currentOffset = 0;
const dataBuffer = [];

for (const record of records) {
  const encoded = encode(record);
  dataBuffer.push(encoded);
  
  // Store index entry with pointer to data location
  index.push({
    id: record.id,
    name: record.name,
    dataPointer: new Pointer(currentOffset)
  });
  
  currentOffset += encoded.length;
}

// Write data file
const allData = new Uint8Array(currentOffset);
let writeOffset = 0;
for (const buf of dataBuffer) {
  allData.set(buf, writeOffset);
  writeOffset += buf.length;
}
fs.writeFileSync(dataFile, allData);

// Write index file
const indexEncoded = encode(index);
fs.writeFileSync(indexFile, indexEncoded);

// Step 2: Use the index to seek and read specific records
const indexData = decode(fs.readFileSync(indexFile));
const fullDataFile = fs.readFileSync(dataFile);

// Find and read record with id: 2
const indexEntry = indexData.find(entry => entry.id === 2);
const offset = indexEntry.dataPointer.valueOf();

// Seek to offset and decode the record
// Note: In a real implementation, you'd need to determine the record size
// For this example, we'll read a known-size chunk
const recordData = fullDataFile.slice(offset); // In practice, you'd know the size
const record = decode(recordData);

console.log(record); // { id: 2, name: 'Bob', email: 'bob@example.com' }
```

## Testing

Run the test suite:

```bash
node test.js
```

## License

MIT License - See LICENSE file for details

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.