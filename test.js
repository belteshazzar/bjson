/**
 * Test suite for bjson encoder/decoder
 */

import { TYPE, ObjectId, Pointer, encode, decode, BJsonFile } from './bjson.js';

// Test counter
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✓ ${message}`);
    passed++;
  } else {
    console.error(`✗ ${message}`);
    failed++;
  }
}

function assertThrows(fn, message) {
  try {
    fn();
    console.error(`✗ ${message} (expected to throw)`);
    failed++;
  } catch (e) {
    console.log(`✓ ${message}`);
    passed++;
  }
}

function assertEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr === expectedStr) {
    console.log(`✓ ${message}`);
    passed++;
  } else {
    console.error(`✗ ${message}`);
    console.error(`  Expected: ${expectedStr}`);
    console.error(`  Actual: ${actualStr}`);
    failed++;
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual, null, 2);
  const expectedStr = JSON.stringify(expected, null, 2);
  if (actualStr === expectedStr) {
    console.log(`✓ ${message}`);
    passed++;
  } else {
    console.error(`✗ ${message}`);
    console.error(`  Expected: ${expectedStr}`);
    console.error(`  Actual: ${actualStr}`);
    failed++;
  }
}

console.log('Testing Binary JSON Encoder/Decoder\n');

// Test NULL
console.log('--- Testing NULL ---');
const nullEncoded = encode(null);
assert(nullEncoded.length === 1, 'NULL encoded to 1 byte');
assert(nullEncoded[0] === TYPE.NULL, 'NULL has correct type byte');
assertEqual(decode(nullEncoded), null, 'NULL round-trip');

// Test FALSE
console.log('\n--- Testing FALSE ---');
const falseEncoded = encode(false);
assert(falseEncoded.length === 1, 'FALSE encoded to 1 byte');
assert(falseEncoded[0] === TYPE.FALSE, 'FALSE has correct type byte');
assertEqual(decode(falseEncoded), false, 'FALSE round-trip');

// Test TRUE
console.log('\n--- Testing TRUE ---');
const trueEncoded = encode(true);
assert(trueEncoded.length === 1, 'TRUE encoded to 1 byte');
assert(trueEncoded[0] === TYPE.TRUE, 'TRUE has correct type byte');
assertEqual(decode(trueEncoded), true, 'TRUE round-trip');

// Test INT
console.log('\n--- Testing INT ---');
const intEncoded = encode(42);
assert(intEncoded.length === 5, 'INT encoded to 5 bytes (1 type + 4 data)');
assert(intEncoded[0] === TYPE.INT, 'INT has correct type byte');
assertEqual(decode(intEncoded), 42, 'INT round-trip (positive)');

const negIntEncoded = encode(-123);
assertEqual(decode(negIntEncoded), -123, 'INT round-trip (negative)');

const maxIntEncoded = encode(2147483647);
assertEqual(decode(maxIntEncoded), 2147483647, 'INT round-trip (max)');

const minIntEncoded = encode(-2147483648);
assertEqual(decode(minIntEncoded), -2147483648, 'INT round-trip (min)');

// Test FLOAT
console.log('\n--- Testing FLOAT ---');
const floatEncoded = encode(3.14159);
assert(floatEncoded.length === 9, 'FLOAT encoded to 9 bytes (1 type + 8 data)');
assert(floatEncoded[0] === TYPE.FLOAT, 'FLOAT has correct type byte');
const decodedFloat = decode(floatEncoded);
assert(Math.abs(decodedFloat - 3.14159) < 0.00001, 'FLOAT round-trip');

const largeFloatEncoded = encode(1e100);
assertEqual(decode(largeFloatEncoded), 1e100, 'FLOAT round-trip (large)');

const negFloatEncoded = encode(-2.5);
assertEqual(decode(negFloatEncoded), -2.5, 'FLOAT round-trip (negative)');

// Test STRING
console.log('\n--- Testing STRING ---');
const stringEncoded = encode('hello');
assert(stringEncoded[0] === TYPE.STRING, 'STRING has correct type byte');
assertEqual(decode(stringEncoded), 'hello', 'STRING round-trip (simple)');

const emptyStringEncoded = encode('');
assertEqual(decode(emptyStringEncoded), '', 'STRING round-trip (empty)');

const unicodeStringEncoded = encode('Hello 世界 🌍');
assertEqual(decode(unicodeStringEncoded), 'Hello 世界 🌍', 'STRING round-trip (unicode)');

// Test ObjectId
console.log('\n--- Testing ObjectId ---');
const oid = new ObjectId('507f1f77bcf86cd799439011');
assert(oid.toString() === '507f1f77bcf86cd799439011', 'ObjectId toString');
const oidEncoded = encode(oid);
assert(oidEncoded.length === 13, 'OID encoded to 13 bytes (1 type + 12 data)');
assert(oidEncoded[0] === TYPE.OID, 'OID has correct type byte');
const decodedOid = decode(oidEncoded);
assert(decodedOid instanceof ObjectId, 'Decoded OID is ObjectId instance');
assertEqual(decodedOid.toString(), '507f1f77bcf86cd799439011', 'OID round-trip');

assertThrows(() => new ObjectId('invalid'), 'Invalid ObjectId throws error');
assert(ObjectId.isValid('507f1f77bcf86cd799439011'), 'ObjectId.isValid returns true for valid');
assert(!ObjectId.isValid('invalid'), 'ObjectId.isValid returns false for invalid');

// Test DATE
console.log('\n--- Testing DATE ---');
const date = new Date('2023-01-15T12:30:45.000Z');
const dateEncoded = encode(date);
assert(dateEncoded.length === 9, 'DATE encoded to 9 bytes (1 type + 8 data)');
assert(dateEncoded[0] === TYPE.DATE, 'DATE has correct type byte');
const decodedDate = decode(dateEncoded);
assert(decodedDate instanceof Date, 'Decoded DATE is Date instance');
assertEqual(decodedDate.getTime(), date.getTime(), 'DATE round-trip');

const epochDate = new Date(0);
assertEqual(decode(encode(epochDate)).getTime(), 0, 'DATE round-trip (epoch)');

const futureDate = new Date('2099-12-31T23:59:59.999Z');
assertEqual(decode(encode(futureDate)).getTime(), futureDate.getTime(), 'DATE round-trip (future)');

// Test POINTER
console.log('\n--- Testing POINTER ---');
const pointer = new Pointer(1024);
assert(pointer.valueOf() === 1024, 'Pointer valueOf');
assert(pointer.toString() === '1024', 'Pointer toString');
const pointerEncoded = encode(pointer);
assert(pointerEncoded.length === 9, 'POINTER encoded to 9 bytes (1 type + 8 data)');
assert(pointerEncoded[0] === TYPE.POINTER, 'POINTER has correct type byte');
const decodedPointer = decode(pointerEncoded);
assert(decodedPointer instanceof Pointer, 'Decoded POINTER is Pointer instance');
assertEqual(decodedPointer.valueOf(), 1024, 'POINTER round-trip');

const zeroPointer = new Pointer(0);
assertEqual(decode(encode(zeroPointer)).valueOf(), 0, 'POINTER round-trip (zero)');

const largePointer = new Pointer(9007199254740991); // MAX_SAFE_INTEGER
assertEqual(decode(encode(largePointer)).valueOf(), 9007199254740991, 'POINTER round-trip (max safe integer)');

assertThrows(() => new Pointer(-1), 'Negative offset throws error');
assertThrows(() => new Pointer('invalid'), 'Non-number offset throws error');
assertThrows(() => new Pointer(3.14), 'Non-integer offset throws error');

// Test ARRAY
console.log('\n--- Testing ARRAY ---');
const arrayEncoded = encode([1, 2, 3]);
assert(arrayEncoded[0] === TYPE.ARRAY, 'ARRAY has correct type byte');
assertDeepEqual(decode(arrayEncoded), [1, 2, 3], 'ARRAY round-trip (simple)');

const emptyArrayEncoded = encode([]);
assertDeepEqual(decode(emptyArrayEncoded), [], 'ARRAY round-trip (empty)');

const mixedArrayEncoded = encode([1, 'hello', true, null, 3.14]);
assertDeepEqual(decode(mixedArrayEncoded), [1, 'hello', true, null, 3.14], 'ARRAY round-trip (mixed types)');

const nestedArrayEncoded = encode([[1, 2], [3, 4]]);
assertDeepEqual(decode(nestedArrayEncoded), [[1, 2], [3, 4]], 'ARRAY round-trip (nested)');

// Test OBJECT
console.log('\n--- Testing OBJECT ---');
const objectEncoded = encode({ a: 1, b: 2 });
assert(objectEncoded[0] === TYPE.OBJECT, 'OBJECT has correct type byte');
assertDeepEqual(decode(objectEncoded), { a: 1, b: 2 }, 'OBJECT round-trip (simple)');

const emptyObjectEncoded = encode({});
assertDeepEqual(decode(emptyObjectEncoded), {}, 'OBJECT round-trip (empty)');

const mixedObjectEncoded = encode({ 
  num: 42, 
  str: 'test', 
  bool: true, 
  nil: null,
  float: 3.14
});
assertDeepEqual(
  decode(mixedObjectEncoded), 
  { num: 42, str: 'test', bool: true, nil: null, float: 3.14 }, 
  'OBJECT round-trip (mixed types)'
);

const nestedObjectEncoded = encode({ 
  user: { name: 'John', age: 30 },
  items: [1, 2, 3]
});
assertDeepEqual(
  decode(nestedObjectEncoded), 
  { user: { name: 'John', age: 30 }, items: [1, 2, 3] }, 
  'OBJECT round-trip (nested)'
);

// Test complex nested structure
console.log('\n--- Testing Complex Structures ---');
const complexData = {
  _id: new ObjectId('507f1f77bcf86cd799439011'),
  name: 'Test Document',
  count: 42,
  price: 99.99,
  active: true,
  tags: ['javascript', 'binary', 'json'],
  metadata: {
    created: 1234567890,
    updated: null,
    nested: {
      deep: 'value'
    }
  },
  items: [
    { id: 1, name: 'Item 1' },
    { id: 2, name: 'Item 2' }
  ]
};

const complexEncoded = encode(complexData);
const complexDecoded = decode(complexEncoded);

// Compare JSON stringification (need to convert ObjectId back)
const complexExpected = JSON.parse(JSON.stringify(complexData, (key, value) => {
  if (value instanceof ObjectId) {
    return value.toString();
  }
  return value;
}));

const complexActual = JSON.parse(JSON.stringify(complexDecoded, (key, value) => {
  if (value instanceof ObjectId) {
    return value.toString();
  }
  return value;
}));

assertDeepEqual(complexActual, complexExpected, 'Complex structure round-trip');

// Test Pointer with file offset simulation
console.log('\n--- Testing Pointer with File Offset Simulation ---');
// Simulate a scenario where we have data at different offsets in a file
// First, encode the target data that would be at a specific offset
const targetData = { id: 123, name: 'Referenced Data', value: 42 };
const targetEncoded = encode(targetData);

// Now create a record with a pointer to where this data would be in a file
// Let's say the target data is at offset 1024
const recordWithPointer = {
  type: 'reference',
  dataPointer: new Pointer(1024),
  metadata: 'This record points to data at offset 1024'
};
const recordEncoded = encode(recordWithPointer);

// Decode the record and verify the pointer
const decodedRecord = decode(recordEncoded);
assert(decodedRecord.dataPointer instanceof Pointer, 'Decoded pointer is Pointer instance');
assertEqual(decodedRecord.dataPointer.valueOf(), 1024, 'Pointer value is correct');
console.log(`✓ Record with pointer successfully encoded and decoded`);

// Simulate reading data at the pointer offset
// In a real scenario, you would seek to offset 1024 in the file and read from there
const simulatedFileOffset = decodedRecord.dataPointer.valueOf();
assert(simulatedFileOffset === 1024, 'File offset from pointer is correct');
// Here we would decode the target data (simulated)
const decodedTargetData = decode(targetEncoded);
assertDeepEqual(decodedTargetData, targetData, 'Data at pointer offset decoded correctly');

// Test error handling
console.log('\n--- Testing Error Handling ---');
assertThrows(() => decode(new Uint8Array([0xFF])), 'Unknown type byte throws error');
assertThrows(() => decode(new Uint8Array([TYPE.INT, 0x00])), 'Incomplete INT throws error');
assertThrows(() => decode(new Uint8Array([TYPE.STRING, 0x0A, 0x00, 0x00, 0x00])), 'Incomplete STRING throws error');

// Summary
console.log('\n' + '='.repeat(50));
console.log(`Tests passed: ${passed}`);
console.log(`Tests failed: ${failed}`);
console.log('='.repeat(50));

if (failed > 0) {
  process.exit(1);
}
