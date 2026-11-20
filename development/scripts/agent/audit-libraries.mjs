// 根 `test:agent-audit`：对 MockGPT 公共包的编译产物做 100% 覆盖率审计。
// 参数：`--no-build` 跳过重新构建，`--repeat=1..20` 指定重复轮次（默认 1），其它参数报用法错误。
// 输出：`.tmp/agent-audit/summary.json` 与 c8 覆盖率汇总，原始 V8 数据用完即删。
// 副作用：默认先构建本项目的包（写 dist）并写 `.tmp/agent-audit`；不改源码、不改 lockfile、不提交。
// 审计期间源文件或构建产物被改动时直接判失败，须等其它改动结束再重跑。
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Report } from 'c8';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const packages = ['mock-gpt'];
const args = process.argv.slice(2);
const repeatArg = args.find(arg => arg.startsWith('--repeat='));
const repeat = repeatArg ? Number(repeatArg.slice('--repeat='.length)) : 1;
// 只接受清单内选项；未知参数、越界轮次按用法错误退出，避免静默忽略用户的意图。
if (!Number.isSafeInteger(repeat) || repeat < 1 || repeat > 20 || args.some(arg => arg !== '--no-build' && arg !== repeatArg)) throw new Error('Usage: npm run test:agent-audit -- [--no-build] [--repeat=1..20]');
// 审计产物统一放 .tmp，随时可删。
const output = resolve(root, '.tmp/agent-audit');
await mkdir(output, { recursive: true });
/** 以继承 stdio 的子进程运行命令；command、args、env 透传，退出码非 0 时 reject。 */
function run(command, args, env = process.env) {
  return new Promise((accept, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', env });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? accept() : reject(new Error(`${command} exited with ${signal ?? code}`)));
  });
}
// 构建本项目拥有的公共包；外部 SDK 通过已声明依赖消费。
if (!args.includes('--no-build')) for (const name of ['mock-gpt']) await run('npm', ['run', 'build', '--workspace', `@jangts/${name}`]);
// 收集登记的包 test 目录下的测试文件，与固定 fixture 一起交给 node --test。
const tests = [];
for (const name of packages) {
  const directory = `packages/${name}/test`;
  for (const entry of await readdir(resolve(root, directory))) if (entry.endsWith('.test.mjs')) tests.push(`${directory}/${entry}`);
}
/**
 * 对依赖清单、审计脚本及登记的包的运行、测试和 Skill 来源求 sha256。
 * 返回十六进制摘要，用于判断审计期间工作区是否被改动。
 */
async function auditFingerprint() {
  const hash = createHash('sha256');
  for (const file of [
    'package.json',
    'package-lock.json',
    ...['audit-libraries.mjs', 'audit-reporter.mjs', 'audit-modules.fixture.mjs', 'audit-coverage.test.mjs'].map(name => `development/scripts/agent/${name}`),
  ]) {
    hash.update(file); hash.update(await readFile(resolve(root, file)));
  }
  for (const name of packages) {
    hash.update(await readFile(resolve(root, `packages/${name}/package.json`)));
    const folders = ['dist', 'src', 'test', ...(name === 'agent-core' ? ['skills'] : [])];
    for (const folder of folders) {
      const directory = resolve(root, `packages/${name}/${folder}`);
      for (const file of (await readdir(directory, { recursive: true })).sort()) if (/\.(?:js|cjs|mjs|ts|json|txt|md)$/.test(file)) {
        hash.update(name + '/' + folder + '/' + file); hash.update(await readFile(resolve(directory, file)));
      }
    }
  }
  return hash.digest('hex');
}
for (let round = 1; round <= repeat; round++) {
  console.log(`Library audit ${round}/${repeat}`);
  const coveragePath = resolve(output, 'coverage-summary.json');
  const rawDirectory = resolve(output, 'v8');
  const summaryPath = resolve(output, 'summary.json');
  // 先落 running 状态，进程被中断时也能看出这一轮没有跑完。
  await writeFile(summaryPath, JSON.stringify({ round, status: 'running' }) + '\n');
  try {
    const fingerprint = await auditFingerprint();
    try {
      // 每轮重建原始 V8 目录，避免上一轮的覆盖率文件混进结果。
      await rm(rawDirectory, { recursive: true, force: true });
      await mkdir(rawDirectory, { recursive: true });
      await run(process.execPath, ['--test-concurrency=4', '--test-timeout=120000',
        '--test-reporter=./development/scripts/agent/audit-reporter.mjs', '--test',
        'development/scripts/agent/audit-modules.fixture.mjs', 'development/scripts/agent/audit-coverage.test.mjs', ...tests],
      { ...process.env, NODE_V8_COVERAGE: rawDirectory });
      // Merge the complete V8 range trees before conversion. Node's experimental
      // test reporter can drop uncovered ranges depending on process order.
      // all/src/include 让没被执行到的模块也计入统计，否则漏测会伪装成高覆盖率。
      await Report({ reporter: ['json', 'json-summary'], reportsDirectory: output, tempDirectory: rawDirectory,
        all: true, src: packages.map(name => resolve(root, `packages/${name}/dist/esm`)),
        include: packages.map(name => `packages/${name}/dist/esm/**`), exclude: [], extension: ['.js'],
        excludeNodeModules: false }).run();
    } finally {
      if (await auditFingerprint() !== fingerprint) throw new Error('Source, tests or build artifacts changed during the audit. Rerun after other changes finish.');
    }
    const coverage = JSON.parse(await readFile(coveragePath, 'utf8'));
    // c8 的汇总键是绝对路径，转成相对路径后才能与包内文件逐一对应。
    const covered = new Map(Object.entries(coverage).filter(([path]) => path !== 'total').map(([path, file]) => [relative(root, path), file]));
    const failures = [], summary = [];
    for (const name of packages) {
      const directory = `packages/${name}/dist/esm`;
      const files = (await readdir(resolve(root, directory), { recursive: true })).filter(file => file.endsWith('.js'));
      const totals = { lines: [0, 0], branches: [0, 0], functions: [0, 0], statements: [0, 0] };
      for (const entry of files) {
        const path = `${directory}/${entry}`, file = covered.get(path);
        // 产物里出现但没有任何测量记录的模块不能算通过，否则新增文件会悄悄逃过审计。
        if (!file) { failures.push(`Unmeasured module: ${path}`); continue; }
        if (file.functions.total > 0 && file.functions.covered === 0) failures.push(`No exercised functions: ${path}`);
        for (const key of Object.keys(totals)) {
          totals[key][0] += file[key].covered; totals[key][1] += file[key].total;
        }
      }
      const percentages = Object.fromEntries(Object.entries(totals).map(([key, [hit, total]]) => [key, total ? hit * 100 / total : 100]));
      // 公共包按 100% 要求验收：任一项命中数不等于总数即记为失败。
      for (const [key, [hit, total]] of Object.entries(totals)) if (hit !== total) failures.push(`${name}: ${key} coverage ${hit}/${total}; required 100%`);
      summary.push({ package: name, modules: files.length, ...percentages });
      console.log(`${name}: ${files.length} modules; ${Object.entries(percentages).map(([key, percent]) => `${key} ${percent.toFixed(2)}%`).join(', ')}`);
    }
    await writeFile(summaryPath, JSON.stringify({ round, status: failures.length ? 'failed' : 'passed', packages: summary, failures }, null, 2) + '\n');
    if (failures.length) throw new Error(failures.join('\n'));
  } catch (error) {
    // 失败时把错误写进同一份 summary，便于直接看产物定位问题。
    const summary = JSON.parse(await readFile(summaryPath, 'utf8'));
    await writeFile(summaryPath, JSON.stringify({ ...summary, status: 'failed', error: String(error) }, null, 2) + '\n');
    throw error;
  } finally {
    await rm(rawDirectory, { recursive: true, force: true });
  }
}
console.log('Coverage and summary: .tmp/agent-audit/');
