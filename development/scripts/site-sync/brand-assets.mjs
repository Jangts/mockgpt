// Synchronize this project's released brand assets from its maintained originals.
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeAssetCopy } from '../../tools/resources/builtin-display/asset-copy.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

// Shared originals are the only editable source; each consumer ships its own copy.
export const brandAssets = [
  {
    "source": "shared/visual-assets/branding/mockgpt/mockgpt-logo.png",
    "copies": [
      "packages/mock-gpt/docs/assets/mockgpt-logo.png",
      "apps/mock-gpt-playground/docs/assets/mockgpt-logo.png"
    ]
  },
  {
    "source": "shared/visual-assets/branding/mockgpt/mockgpt-icon.svg",
    "copies": [
      "apps/mock-gpt-playground/src/assets/mockgpt-icon.svg"
    ]
  }
];

export async function syncBrandAssets(root = projectRoot) {
  for (const asset of brandAssets) {
    const bytes = await readFile(resolve(root, asset.source));
    for (const copy of asset.copies) await writeAssetCopy(resolve(root, copy), bytes);
  }
}

export async function checkBrandAssets(root = projectRoot) {
  const errors = [];
  for (const asset of brandAssets) {
    const source = await readFile(resolve(root, asset.source));
    for (const copy of asset.copies) {
      const bytes = await readFile(resolve(root, copy)).catch((error) => {
        if (error.code === 'ENOENT') return undefined;
        throw error;
      });
      if (!bytes?.equals(source))
        errors.push(`Brand asset copy differs from ${asset.source}: ${copy}`);
    }
  }
  return errors;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.includes('--write')) await syncBrandAssets();
  const errors = await checkBrandAssets();
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  }
}
