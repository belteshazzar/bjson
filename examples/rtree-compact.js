import { RTree } from '../src/rtree.js';
import { BJsonFile } from '../src/bjson.js';

// Provide OPFS in Node using node-opfs (installed as devDependency)
const nodeOpfs = await import('node-opfs');
Object.defineProperty(global, 'navigator', {
  value: nodeOpfs.navigator,
  writable: true,
  configurable: true
});

// Helper to clean up a bjson file if it exists
async function cleanup(filename) {
  const file = new BJsonFile(filename);
  if (await file.exists()) {
    await file.open('rw');
    await file.delete();
  }
}

async function main() {
  const filename = 'demo-rtree.bjson';
  const compactedFilename = 'demo-rtree-compacted.bjson';

  await cleanup(filename);
  await cleanup(compactedFilename);

  const tree = new RTree(filename, 4);
  await tree.open();

  const points = [
    { id: 'sf', lat: 37.7749, lng: -122.4194 },
    { id: 'la', lat: 34.0522, lng: -118.2437 },
    { id: 'nyc', lat: 40.7128, lng: -74.0060 },
    { id: 'chi', lat: 41.8781, lng: -87.6298 }
  ];

  for (const point of points) {
    await tree.insert(point.lat, point.lng, point.id);
  }

  const radiusResults = await tree.searchRadius(37.7749, -122.4194, 500);
  console.log('Within 500km of SF:', radiusResults);

  const bboxResults = await tree.searchBBox({
    minLat: 30,
    maxLat: 42,
    minLng: -125,
    maxLng: -70
  });
  console.log('BBox covering US entries:', bboxResults);

  const result = await tree.compact(compactedFilename);
  console.log('Compaction result:', result);

  await tree.close();

  const compactedTree = new RTree(compactedFilename, 4);
  await compactedTree.open();
  const postCompactResults = await compactedTree.searchRadius(39, -98, 2500);
  console.log('After compaction, within 2500km of US center:', postCompactResults);
  await compactedTree.close();

  // Optional: clean up files at the end
  // await cleanup(filename);
  // await cleanup(compactedFilename);
}

main().catch((err) => {
  console.error('Demo failed:', err);
  process.exit(1);
});
