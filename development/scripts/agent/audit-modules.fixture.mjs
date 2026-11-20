import { readdir } from 'node:fs/promises';

// Import every generated ESM module once, including unreferenced modules, so
// coverage cannot silently omit a source file with no tests or consumers.
for (const name of ['mock-gpt']) {
  const root = new URL(`../../../packages/${name}/dist/esm/`, import.meta.url);
  for (const entry of await readdir(root, { recursive: true })) if (entry.endsWith('.js')) await import(new URL(entry, root));
}
