/** Validate this cropped workspace, declared imports, lock links and public module formats. */
/** Verify the cropped workspace catalogs, lockfile, public exports and package dependency boundaries. */
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { optionalLockProblems } from './optional-locks.mjs';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const pkg = await read('package.json'),
  lock = await read('package-lock.json');
const packages = await read('packages/catalog.json');
for (const filename of ['pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb']) {
  await assert.rejects(access(path.join(root, filename)), `Use only package-lock.json: ${filename}`);
}
assert.deepEqual(optionalLockProblems(lock), []);
assert.deepEqual(pkg.workspaces, ['apps/*', 'packages/*']);
assert.equal(
  await readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8'),
  'packages:\n' + pkg.workspaces.map((item) => `  - '${item}'\n`).join(''),
);
const require = createRequire(path.join(root, 'package.json'));
const { preProcessFile } = require('typescript');
const locations = [];
for (const folder of ['apps', 'packages']) {
  for (const entry of await readdir(path.join(root, folder), { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const location = `${folder}/${entry.name}`;
    try {
      await access(path.join(root, location, 'package.json'));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    locations.push(location);
  }
}
assert.deepEqual(
  Object.keys(packages).sort(),
  locations
    .filter((item) => item.startsWith('packages/'))
    .map((item) => item.slice(9))
    .sort(),
);
/** Inspect actual imports, rather than accepting a manifest as proof of package isolation. */
async function inspect(directory, owner, dependencies, environment) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await inspect(filename, owner, dependencies, environment);
    else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
      for (const { fileName: target } of preProcessFile(
        await readFile(filename, 'utf8'),
        true,
        true,
      ).importedFiles) {
        if (target.startsWith('.')) {
          if (environment)
            assert.ok(
              !path.relative(owner, path.resolve(path.dirname(filename), target)).startsWith('..'),
              `Package escape: ${filename}: ${target}`,
            );
        } else if (target.startsWith('node:')) {
          if (environment)
            assert.equal(environment, 'node', `Node import in universal package: ${filename}`);
        } else
          assert.ok(
            Object.keys(dependencies).some(
              (name) => target === name || target.startsWith(name + '/'),
            ),
            `Undeclared dependency: ${filename}: ${target}`,
          );
      }
    }
  }
}
for (const location of locations) {
  const item = await read(`${location}/package.json`),
    consumer = createRequire(path.join(root, location, 'package.json'));
  assert.equal(lock.packages[`node_modules/${item.name}`]?.resolved, location);
  assert.equal(lock.packages[location]?.version, item.version);
  await assert.rejects(access(path.join(root, location, 'package-lock.json')));
  const deps = { ...item.dependencies, ...item.peerDependencies, ...item.devDependencies };
  const owner = path.join(root, location);
  try {
    await access(path.join(owner, 'src'));
    await inspect(path.join(owner, 'src'), owner, deps, packages[location.slice(9)]?.environment);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (location.startsWith('packages/')) {
    assert.equal(packages[location.slice(9)].name, item.name);
    for (const [entry, target] of Object.entries(item.exports ?? {})) {
      if (typeof target === 'string') {
        await access(path.join(owner, target));
        continue;
      }
      await access(path.join(owner, target.types));
      const spec = item.name + (entry === '.' ? '' : entry.slice(1));
      assert.deepEqual(
        Object.keys(await import(spec)).sort(),
        Object.keys(consumer(spec)).sort(),
        `Module formats differ: ${spec}`,
      );
    }
  }
}
console.log(
  `Workspace passed: ${locations.length} workspaces, ${Object.keys(packages).length} packages`,
);
