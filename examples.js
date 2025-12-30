/**
 * Example usage of bjson library
 */

import { ObjectId, Pointer, encode, decode } from './bjson.js';

console.log('=== Binary JSON Examples ===\n');

// Example 1: Basic types
console.log('1. Basic Types:');
const basic = {
  null: null,
  boolean: true,
  integer: 42,
  float: 3.14159,
  string: 'Hello, World!'
};

const basicEncoded = encode(basic);
console.log(`   Original:`, basic);
console.log(`   Encoded size: ${basicEncoded.length} bytes`);
console.log(`   Decoded:`, decode(basicEncoded));
console.log();

// Example 2: Arrays
console.log('2. Arrays:');
const arrays = {
  numbers: [1, 2, 3, 4, 5],
  mixed: [1, 'two', true, null, 3.14],
  nested: [[1, 2], [3, 4], [5, 6]]
};

const arraysEncoded = encode(arrays);
console.log(`   Original:`, arrays);
console.log(`   Encoded size: ${arraysEncoded.length} bytes`);
console.log(`   Decoded:`, decode(arraysEncoded));
console.log();

// Example 3: Objects
console.log('3. Objects:');
const objects = {
  user: {
    name: 'John Doe',
    age: 30,
    email: 'john@example.com'
  },
  settings: {
    theme: 'dark',
    notifications: true
  }
};

const objectsEncoded = encode(objects);
console.log(`   Original:`, JSON.stringify(objects, null, 2));
console.log(`   Encoded size: ${objectsEncoded.length} bytes`);
console.log(`   Decoded:`, JSON.stringify(decode(objectsEncoded), null, 2));
console.log();

// Example 4: MongoDB ObjectId
console.log('4. MongoDB ObjectId:');
const docWithOid = {
  _id: new ObjectId('507f1f77bcf86cd799439011'),
  name: 'MongoDB Document',
  createdAt: 1234567890
};

const oidEncoded = encode(docWithOid);
console.log(`   Original:`, { 
  _id: docWithOid._id.toString(), 
  name: docWithOid.name, 
  createdAt: docWithOid.createdAt 
});
console.log(`   Encoded size: ${oidEncoded.length} bytes`);
const oidDecoded = decode(oidEncoded);
console.log(`   Decoded:`, { 
  _id: oidDecoded._id.toString(), 
  name: oidDecoded.name, 
  createdAt: oidDecoded.createdAt 
});
console.log();

// Example 5: Pointer (File Offset Reference)
console.log('5. Pointer (File Offset Reference):');
const docWithPointer = {
  type: 'index',
  key: 'user_123',
  dataOffset: new Pointer(2048),
  metadata: 'Points to user data at byte offset 2048'
};

const pointerEncoded = encode(docWithPointer);
console.log(`   Original:`, { 
  type: docWithPointer.type, 
  key: docWithPointer.key,
  dataOffset: docWithPointer.dataOffset.valueOf(), 
  metadata: docWithPointer.metadata 
});
console.log(`   Encoded size: ${pointerEncoded.length} bytes`);
const pointerDecoded = decode(pointerEncoded);
console.log(`   Decoded:`, { 
  type: pointerDecoded.type, 
  key: pointerDecoded.key,
  dataOffset: pointerDecoded.dataOffset.valueOf(), 
  metadata: pointerDecoded.metadata 
});
console.log(`   Pointer offset for file seeking: ${pointerDecoded.dataOffset.valueOf()}`);
console.log();

// Example 6: Complex nested structure
console.log('6. Complex Structure:');
const complex = {
  _id: new ObjectId('507f1f77bcf86cd799439011'),
  title: 'Blog Post',
  author: {
    name: 'Jane Smith',
    id: 123
  },
  tags: ['javascript', 'programming', 'tutorial'],
  content: 'This is a sample blog post content...',
  metadata: {
    views: 1500,
    likes: 42,
    published: true,
    comments: [
      { user: 'Alice', text: 'Great post!' },
      { user: 'Bob', text: 'Very helpful, thanks!' }
    ]
  },
  stats: {
    wordCount: 500,
    readTime: 3.5
  }
};

const complexEncoded = encode(complex);
console.log(`   Original size (JSON): ${JSON.stringify(complex).length} bytes`);
console.log(`   Encoded size (Binary): ${complexEncoded.length} bytes`);
console.log(`   Compression ratio: ${(complexEncoded.length / JSON.stringify(complex).length * 100).toFixed(1)}%`);
const complexDecoded = decode(complexEncoded);
console.log(`   Successful round-trip: ${JSON.stringify(complexDecoded._id.toString()) === JSON.stringify(complex._id.toString())}`);
console.log();

// Example 7: Size comparison
console.log('7. Size Comparison (JSON vs Binary):');
const testData = [
  { name: 'Small object', data: { a: 1, b: 2 } },
  { name: 'Array of numbers', data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  { name: 'String data', data: { text: 'The quick brown fox jumps over the lazy dog' } },
  { name: 'Mixed types', data: { num: 42, str: 'test', bool: true, nil: null, arr: [1, 2, 3] } }
];

testData.forEach(({ name, data }) => {
  const jsonSize = JSON.stringify(data).length;
  const binarySize = encode(data).length;
  const ratio = (binarySize / jsonSize * 100).toFixed(1);
  console.log(`   ${name}:`);
  console.log(`     JSON: ${jsonSize} bytes`);
  console.log(`     Binary: ${binarySize} bytes (${ratio}%)`);
});
console.log();

// Example 8: Error handling
console.log('8. Error Handling:');
try {
  const invalid = new Uint8Array([0xFF, 0x00, 0x00]);
  decode(invalid);
} catch (error) {
  console.log(`   Caught expected error: ${error.message}`);
}

try {
  new ObjectId('invalid-oid');
} catch (error) {
  console.log(`   Caught expected error: ${error.message}`);
}
console.log();

console.log('=== Examples completed successfully! ===');
