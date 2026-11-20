import { mkdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import lockfile from 'proper-lockfile';

/** All application predev/prebuild calls share this lease, including child compilers. */
export async function withPackageBuildLock(workspace, build, { signal, onWait = () => {} } = {}) {
  const root = await realpath(workspace);
  const directory = join(root, '.tmp/workspace-build');
  await mkdir(directory, { recursive: true });
  const compromised = new AbortController();
  const active = signal ? AbortSignal.any([signal, compromised.signal]) : compromised.signal;
  let release, announced = false;
  while (!release) {
    active.throwIfAborted();
    try {
      release = await lockfile.lock(root, {
        lockfilePath: join(directory, 'packages.lock'), stale: 120000, update: 10000,
        onCompromised: error => compromised.abort(error),
      });
    } catch (error) {
      if (error.code !== 'ELOCKED') throw error;
      if (!announced) { announced = true; onWait(); }
      await setTimeout(250, undefined, { signal: active });
    }
  }
  try { active.throwIfAborted(); return await build(active); }
  finally { if (!compromised.signal.aborted) await release(); }
}
