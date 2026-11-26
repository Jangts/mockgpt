# 构建与静态部署

本文供文档站维护者使用，不属于公开 SDK 使用文档。

默认构建地址为 `https://mockgpt-docs.pages.jangts.cafe`，使用域名根路径；换域名可设置 `MOCK_GPT_DOCS_ORIGIN=https://your-domain.example`，子目录托管可设置 `MOCK_GPT_DOCS_BASE=/mock-gpt/`。

## 在仓库中使用

从本仓库的 MockGPT 源码生成文档。

从仓库根目录执行，使用根 `package-lock.json`：

```sh
npm ci
npm run docs:mock-gpt
```

开发命令启动 VitePress 文档服务器。示例在站点中展示为代码。

生成可部署的静态站：

```sh
npm run build:docs:mock-gpt
```

输出目录为：

```text
apps/mock-gpt-docs/dist/
├── index.html       # 语言入口：按浏览器语言进入 /en/ 或 /zh/
├── en/              # 英文页面
├── zh/              # 中文页面
├── branding/        # MockGPT 标志与图标
└── assets/          # 页面脚本、样式、本地搜索索引
```

英文与中文位于同级目录 `/en/`、`/zh/`；`/` 只承担语言入口，按浏览器语言进入 `/en/` 或 `/zh/`，由 head 内联脚本立即完成，不渲染可见的等待或选择页面。这个目录可整体复制到任意静态托管平台。源码目录和 Markdown 不作为托管根目录。`dist/` 已由 `.gitignore` 忽略，不提交生成物。

构建产物的本地预览：

```sh
npm run preview:docs:mock-gpt
```

## 静态托管

| 配置 | 值 |
| --- | --- |
| 工作目录 | 本仓库根目录 |
| 安装 | `npm ci --ignore-scripts` |
| 构建 | `npm run build:docs:mock-gpt` |
| 发布目录 | `apps/mock-gpt-docs/dist` |
| 域名根路径 | `MOCK_GPT_DOCS_BASE=/` |
| 子目录路径 | 如 `MOCK_GPT_DOCS_BASE=/mock-gpt/` |
| 后端、环境密钥 | 无 |

站点使用 VitePress 1.6，正文、代码高亮和全文搜索索引都在构建时生成，托管端只需分发静态文件。没有后端、数据库、在线模型或远程搜索服务。

## 发布到 Jangts Pages

将 [配置样例](../scripts/deploy.config.example.json) 复制到仓库根目录的 `.local/pages/mock-gpt-docs.json`，填写本机 SSH 连接和密钥路径。
发布入口为 `npm run deploy --workspace @jangts/mock-gpt-docs`。
