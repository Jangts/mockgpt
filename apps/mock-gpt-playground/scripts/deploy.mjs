/**
 * Playground 静态站点发布脚本：构建 mock-gpt 与 playground，打包 dist，经 scp 上传后
 * 在目标机执行 deploy-remote.py 校验并替换 Pages 站点。目标主机、路径与 SSH 身份来自
 * 本机忽略文件 scripts/deploy.config.json（由相邻 example 复制），不做证书或 NPM 配置变更。
 */
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('../', import.meta.url));
const root = fileURLToPath(new URL('../../../', import.meta.url));

/** 运行外部命令并复用父进程标准流；失败时抛出错误并带上退出码或信号。 */
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.signal || result.status})`);
}

/**
 * 递归列出构建产物并计算逐文件 sha256，供远端替换前核对上传内容。
 * @param directory 待扫描目录。
 * @param prefix 相对路径前缀，用于拼接嵌套目录。
 * @returns 相对路径到文件哈希的映射。
 * @throws 目录中出现非普通文件（如符号链接）时抛出。
 */
function manifest(directory, prefix = '') {
  return Object.fromEntries(
    readdirSync(directory).flatMap((name) => {
      const path = join(directory, name),
        relative = prefix + name,
        stat = lstatSync(path);
      if (stat.isDirectory()) return Object.entries(manifest(path, relative + '/'));
      if (!stat.isFile()) throw new Error(`Unsupported build entry: ${relative}`);
      return [[relative, createHash('sha256').update(readFileSync(path)).digest('hex')]];
    }),
  );
}

/** 校验配置并执行完整发布流程；临时上传包在收尾时清理。 */
function deploy() {
  const config = JSON.parse(readFileSync(new URL('./deploy.config.json', import.meta.url), 'utf8'));
  if (!/^[a-z_][a-z0-9_-]*@[a-z0-9][a-z0-9.-]*$/i.test(config.host))
    throw new Error('Invalid SSH host');
  if (!/^[a-z0-9-]+$/.test(config.site)) throw new Error('Invalid Pages site name');
  if (!config.pagesRoot.startsWith('/') || !existsSync(config.identity))
    throw new Error('Check Pages path and SSH identity in deploy.config.json');
  const sshOptions = [
    '-i',
    config.identity,
    '-o',
    'IdentitiesOnly=yes',
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=10',
  ];
  const temporary = mkdtempSync(join(tmpdir(), 'mockgpt-pages-'));
  const upload = `/tmp/mockgpt-playground-${randomUUID()}.tgz`;
  let uploaded = false;
  try {
    run('npm', ['run', 'build', '--workspace', '@jangts/mock-gpt']);
    run('npm', ['run', 'build', '--workspace', '@jangts/mock-gpt-playground']);
    const dist = join(app, 'dist'),
      files = manifest(dist);
    if (!files['index.html']) throw new Error('Build has no index.html');
    const archive = join(temporary, 'site.tgz');
    run('tar', ['-czf', archive, '-C', dist, '.']);
    uploaded = true;
    run('scp', [...sshOptions, archive, `${config.host}:${upload}`]);
    const payload = Buffer.from(
      JSON.stringify({
        ...config,
        upload,
        files,
        digest: createHash('sha256').update(readFileSync(archive)).digest('hex'),
      }),
    ).toString('base64');
    const script =
      `import base64, json\nCONFIG = json.loads(base64.b64decode('${payload}'))\n` +
      readFileSync(new URL('./deploy-remote.py', import.meta.url), 'utf8');
    run('ssh', [...sshOptions, config.host, 'sudo python3 -'], {
      input: script,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    uploaded = false;
    console.log(
      `Published ${config.site}.pages.jangts.cafe (current protocol: see deploy/pages/README.md)`,
    );
  } finally {
    if (uploaded) {
      // The path is generated above, never supplied by the caller.
      const cleanup = spawnSync('ssh', [...sshOptions, config.host, `sudo rm -f -- ${upload}`], {
        stdio: 'inherit',
      });
      if (cleanup.error || cleanup.status !== 0)
        console.error(`Remove temporary upload manually: ${upload}`);
    }
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv.includes('--help')) {
  console.log(
    'Usage: npm run deploy --workspace @jangts/mock-gpt-playground\nBuild MockGPT and Playground, pack dist, upload with scp, verify and replace this Pages site over SSH.\nCopy scripts/deploy.config.example.json to scripts/deploy.config.json and configure the target and identity path locally. No NPM or certificate changes.',
  );
} else if (process.argv.length > 2) {
  console.error('Unknown arguments; use --help.');
  process.exitCode = 1;
} else {
  try {
    deploy();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
