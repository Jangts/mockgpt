---
title: "网页来源 sources"
outline: [2, 3]
---

# 网页来源 sources

`/web` 是 Node 专属入口；`sources.web()` 真实抓取网页并提取正文，交给本地摘要算法，不启动浏览器、不维护登录、不抓 PDF。

## Contents

| 符号 | 类别 | 说明 |
| --- | --- | --- |
| [`sources`](#api-sources) | 常量 | Web-page body source namespace. |
| [`isPublicAddress`](#api-ispublicaddress) | 函数 | Public-address check reused for address validation. |
| [`WebOptions`](#api-weboptions) | 接口 | Options for sources.web(). |
| [`LoadedPage`](#api-loadedpage) | 接口 | Web-page load result. |
| [`WebProfile`](#api-webprofile) | 类型别名 | Request-header profile: browser or crawler-compatible alias. |


## sources {#api-sources}

**导入：** `@jangts/mock-gpt/web`。

## 定义

**Namespace:** `sources`

## ## 成员目录

| 成员 | 用途 |
| --- | --- |
| [`web`](#member-web) | 网页正文来源：抓取 HTML/纯文本、去除脚本与导航后交给文本生成器。 |

### web {#member-web}

Retrieve a page and return its readable text.


```ts
sources.web(options?: WebOptions): Exclude<TextSource, string>
```


| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `options` | `WebOptions` | 可省略 | — |

**返回：** `(context: GenerationContext) => string \| Promise<string>`


## isPublicAddress {#api-ispublicaddress}

Decide whether an address is an acceptable public destination.

**导入：** `@jangts/mock-gpt/web`。

## 定义

### 调用


```ts
isPublicAddress(address: string): boolean
```

Decide whether an address is an acceptable public destination.

| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `address` | `string` | 必需 | — |

**返回：** `boolean`


## WebOptions {#api-weboptions}

Configuration of `sources.web`.

**导入：** `@jangts/mock-gpt/web`。

## 定义

```ts
interface WebOptions
```

## Fields

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `url` | `string \| ((context: GenerationContext) => string) \| undefined` | 可省略 | Fixed URL or synchronous selector; when omitted the prompt must contain exactly one URL. |
| `profile` | `"browser" \| "crawler" \| undefined` | 可省略 | Header profile; only `browser` (alias `crawler`) exists today. Default `browser`. |
| `headers` | `Record<string, string> \| undefined` | 可省略 | Content negotiation only; never copies browser cookies or model credentials. |
| `timeoutMs` | `number \| undefined` | 可省略 | Total retrieval deadline in milliseconds (1-120 000); default 20 000. |
| `maxBytes` | `number \| undefined` | 可省略 | Maximum page size in bytes (1-20 971 520); default 2 MiB, applied before and after decoding. |
| `maxChars` | `number \| undefined` | 可省略 | Maximum characters of extracted text kept for analysis (1-1 000 000); default 30 000. |
| `maxRedirects` | `number \| undefined` | 可省略 | Redirect budget (0-10); default 3. Each target is re-validated like the original URL. |
| `fallback` | `string \| undefined` | 可省略 | Explicit replacement source text on retrieval failure; request cancellation still throws. |
| `load` | `((url: URL, signal: AbortSignal, maxBytes: number) => Promise<LoadedPage>) \| undefined` | 可省略 | Trusted offline/custom transport. It owns its destination policy; not supplied by remote clients. |


## LoadedPage {#api-loadedpage}

A fetched page body plus the metadata needed for decoding and diagnostics.

**导入：** `@jangts/mock-gpt/web`。

## 定义

```ts
interface LoadedPage
```

## Fields

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `bytes` | `Uint8Array<ArrayBufferLike>` | 必需 | Body bytes, still compressed only if the caller bypassed this transport. |
| `url` | `string` | 必需 | Final URL after redirects; may contain a query string, so callers must bound it before reporting. |
| `contentType` | `string` | 必需 | Raw `content-type` header, possibly empty and possibly including a charset parameter. |
| `status` | `number \| undefined` | 可省略 | HTTP status; omitted by existing custom loaders means 200. |


## WebProfile {#api-webprofile}

Name of an entry in `webHeaderProfiles`.

**导入：** `@jangts/mock-gpt/web`。

## 定义

```ts
type WebProfile = keyof typeof webHeaderProfiles;
```

## ## 使用示例
```js
import { MockGPT, generators } from '@jangts/mock-gpt';
import { sources } from '@jangts/mock-gpt/web';

const mock = new MockGPT({
  rules: [{
    prompt: /https?:\/\//,
    generator: generators.summary({ source: sources.web() }),
  }],
});
```

```js
sources.web({ profile: 'browser', headers: { 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' } });
```

只用 Node HTTP 请求，默认拒绝本机、私网和保留地址，每次重定向重新检查并固定连接地址。明确的安全验证页即使 HTTP 200 也返回 `MOCK_WEB_CHALLENGE`；拦截页返回 `MOCK_WEB_BLOCKED`；重定向到登录路径识别为 `MOCK_WEB_AUTH_REQUIRED`；超时单独报告 `MOCK_WEB_TIMEOUT`。来源诊断记入 `mock.records`；HTML 正文提取优先使用 Mozilla Readability，未识别时退化为过滤脚本／样式／导航后的文本。
