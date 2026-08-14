// The root package.json declares "type": "module", which would make Node treat
// every .js file under dist/cjs as ESM. Dropping a package.json with
// "type": "commonjs" into that directory scopes the CommonJS build correctly
// without a bundler.
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const target = join(root, 'dist', 'cjs', 'package.json');

await writeFile(target, `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`);

console.log(`wrote ${target}`);
