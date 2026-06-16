import { mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const root = new URL('./', import.meta.url);
const parts = (await readdir(root))
  .filter((name) => name.startsWith('payload.part') && name !== 'payload.part000')
  .sort();
if (!parts.length) throw new Error('Missing payload parts');
const encoded = (await Promise.all(parts.map((name) => readFile(new URL(name, root), 'utf8')))).join('').trim();
const files = JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'));
await rm(new URL('./dist', root), { recursive: true, force: true });
await mkdir(new URL('./dist', root), { recursive: true });
await Promise.all(Object.entries(files).map(([name, content]) =>
  writeFile(new URL(`./dist/${name}`, root), content, 'utf8')
));
console.log(`Built ${Object.keys(files).length} static files from ${parts.length} payload parts.`);
