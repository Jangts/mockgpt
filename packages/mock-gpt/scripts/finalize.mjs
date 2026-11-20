/**
 * Build step: mark the ESM output directory as ES modules.
 *
 * The package root declares `"type": "commonjs"`, so without this marker Node would parse
 * `dist/esm/*.js` as CommonJS and the `import` condition in `exports` would fail. The CJS build
 * needs no marker. Used only by `npm run build`, never at runtime.
 */
import { writeFile } from 'node:fs/promises';

await writeFile(new URL('../dist/esm/package.json', import.meta.url), '{"type":"module"}\n');
