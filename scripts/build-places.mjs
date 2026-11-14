// Builds apps/frontend/public/data/places.txt, the place list the trip box highlights from.
//
// Source: GeoNames (https://www.geonames.org, CC BY 4.0): cities15000.txt (every city of 15,000+
// people), admin1CodesASCII.txt (states, provinces, regions) and countryInfo.txt.
// Download and unzip them from https://download.geonames.org/export/dump/ into one folder, then:
//
//   node scripts/build-places.mjs <geonames-folder> [dictionary]
//
// One lowercase name per line. A leading "~" marks a name that is also an everyday English word
// (found in lowercase in the dictionary, /usr/share/dict/words by default): the box only highlights
// those when typed with a capital ("Nice" but not "a nice hotel").
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const [, , geoDir, dictPath = '/usr/share/dict/words'] = process.argv;
if (!geoDir) {
  console.error('usage: node scripts/build-places.mjs <geonames-folder> [dictionary]');
  process.exit(1);
}

const read = (file) => readFileSync(path.join(geoDir, file), 'utf8').split('\n').filter((line) => line && !line.startsWith('#'));
const words = new Set(readFileSync(dictPath, 'utf8').split('\n').filter((w) => w && w === w.toLowerCase()));

const names = new Set();
const add = (name) => {
  const clean = name.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
  // Skip codes, numbers and one- or two-letter names: too short to tell apart from ordinary text.
  if (clean.length < 3 || /\d/.test(clean) || !/\p{L}/u.test(clean)) return;
  names.add(clean);
};

for (const line of read('cities15000.txt')) {
  const cols = line.split('\t');
  add(cols[1]); // name
  add(cols[2]); // ASCII name, so "Sao Paulo" matches as well as "São Paulo"
  // For larger cities, also the plain-ASCII alternate names people still type: Mysore, Bombay, Peking.
  if (Number(cols[14]) >= 500_000) {
    for (const alt of cols[3].split(',')) if (/^[A-Z][a-z]+(?:[ '-][A-Za-z][a-z]+)*$/.test(alt)) add(alt);
  }
}
for (const line of read('admin1CodesASCII.txt')) {
  const cols = line.split('\t');
  add(cols[1]);
  add(cols[2]);
}
for (const line of read('countryInfo.txt')) add(line.split('\t')[4]);

const out = [...names].sort().map((name) => (words.has(name) ? `~${name}` : name));
const target = path.resolve(import.meta.dirname, '../apps/frontend/public/data/places.txt');
mkdirSync(path.dirname(target), { recursive: true });
writeFileSync(target, `${out.join('\n')}\n`);
console.log(`${out.length} places (${out.filter((n) => n.startsWith('~')).length} also everyday words) → ${path.relative(process.cwd(), target)}`);
