/**
 * Build step: delete `dist/` so each build starts from empty output.
 *
 * Runs before both `tsc` passes; without it, files removed from `src` would linger in the
 * published package. Used only by `npm run build`, never at runtime.
 */
import { rm } from 'node:fs/promises';

await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true });
