// 根 `npm run build:packages` 与 `postinstall` 的公共包构建入口，由根 package.json 调用。
// 读取 `packages/catalog.json`，按 packageConsumers 推导拓扑顺序，逐个执行
// `npm run build --workspace <name>`；各包具体构建步骤仍由包自己的 build 脚本负责。
// 副作用：写各包 dist 并占用 `.tmp/workspace-build` 构建锁；不安装依赖、不改 lockfile、
// 不提交代码。收到 SIGINT/SIGTERM 时结束正在运行的子进程并以非零码退出。
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withPackageBuildLock } from './build-lock.mjs';
const root = new URL('../../../', import.meta.url);
const packages = JSON.parse(await readFile(new URL('packages/catalog.json', root), 'utf8'));
// 构建顺序由包之间的引用推导，catalog 的书写顺序不参与决策。
const ordered = [];
const active = new Set();
const completed = new Set();
// 被依赖包的清单：packageConsumers 表达运行时依赖，peerDependencies 表达可选表面在编译期需要的类型。
const manifests = new Map(
  await Promise.all(
    Object.entries(packages).map(async ([directory, entry]) => [
      directory,
      JSON.parse(await readFile(new URL(`packages/${directory}/package.json`, root), 'utf8')),
    ]),
  ),
);
const directoryByName = new Map(Object.entries(packages).map(([directory, entry]) => [entry.name, directory]));
/**
 * 列出必须先构建的包目录：登记为消费者的运行时依赖，以及本包 peerDependencies 指向的公共包。
 *
 * @param directory 当前包目录（catalog 键）。
 * @returns 需要先构建的包目录列表。
 */
function predecessors(directory) {
  const consumers = Object.entries(packages)
    .filter(([, entry]) => entry.packageConsumers?.includes(directory))
    .map(([name]) => name);
  const peers = Object.keys(manifests.get(directory)?.peerDependencies ?? {})
    .map((name) => directoryByName.get(name))
    .filter(Boolean);
  return [...new Set([...consumers, ...peers])];
}
/**
 * 深度优先把被依赖的包排到消费者之前，参数 directory 是 catalog 键（包目录名）。
 * active 用于发现循环依赖并抛错，completed 让重复访问直接返回。
 * 副作用是填充 ordered，无返回值。
 */
function visit(directory) {
  if (completed.has(directory)) return;
  if (active.has(directory)) throw new Error(`Cyclic package dependency: ${directory}`);
  active.add(directory);
  for (const dependency of predecessors(directory)) visit(dependency);
  active.delete(directory);
  completed.add(directory);
  ordered.push(packages[directory]);
}
for (const directory of Object.keys(packages)) visit(directory);
/**
 * 在子进程中执行 `npm run build --workspace <name>` 构建单个包。
 * name 为包名，signal 中止时终止子进程并 reject；构建失败或进程启动失败同样 reject。
 * 成功时 resolve，无返回值。
 */
function buildPackage(name, signal) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    // POSIX 下让子进程独立成组，取消时能连同它派生的编译进程一起结束。
    const grouped = process.platform !== 'win32';
    const child = spawn('npm', ['run', 'build', '--workspace', name], {
      cwd: fileURLToPath(root), stdio: 'inherit', detached: grouped,
    });
    const stop = () => {
      try { if (grouped) process.kill(-child.pid, 'SIGTERM'); else child.kill('SIGTERM'); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    };
    signal.addEventListener('abort', stop, { once: true });
    child.once('error', error => { signal.removeEventListener('abort', stop); reject(error); });
    child.once('close', code => {
      signal.removeEventListener('abort', stop);
      if (signal.aborted) reject(signal.reason);
      else if (code !== 0) reject(new Error(`${name} build failed (${code ?? 'signal'})`));
      else resolve();
    });
  });
}

const cancellation = new AbortController();
const stop = () => cancellation.abort(new Error('公共包构建已取消。'));
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
try {
  // 多个应用的 predev/prebuild 可能并发触发构建；锁保证同一时间只有一个进程写 dist，
  // onWait 只在真正需要排队时提示一次。
  await withPackageBuildLock(fileURLToPath(root), async signal => {
    for (const { name } of ordered) await buildPackage(name, signal);
  }, { signal: cancellation.signal, onWait: () => console.log('另一个进程正在构建公共包，等待完成后继续…') });
} catch (error) {
  // 取消与构建失败都只输出消息并置非零退出码，由调用方决定后续处理。
  console.error(error.message);
  process.exitCode = 1;
} finally {
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
}
