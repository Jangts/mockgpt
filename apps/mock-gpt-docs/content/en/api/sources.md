---
title: "Web sources"
outline: [2, 3]
---

# Web sources

`/web` is a Node-only entry. `sources.web()` fetches real web pages and extracts the body text, then hands it to a local summarization algorithm. It does not start a browser, maintain logins or fetch PDFs.

## Contents

| Symbol | Kind | Description |
| --- | --- | --- |
| [`sources`](#api-sources) | constant | Web-page body source namespace. |
| [`isPublicAddress`](#api-ispublicaddress) | function | Public-address check reused for address validation. |
| [`WebOptions`](#api-weboptions) | interface | Options for sources.web(). |
| [`LoadedPage`](#api-loadedpage) | interface | Web-page load result. |
| [`WebProfile`](#api-webprofile) | type alias | Request-header profile: browser or crawler-compatible alias. |


## sources {#api-sources}

**Import:** `@jangts/mock-gpt/web`。

## Definition

**Namespace:** `sources`

## ## Member index

| Member | Purpose |
| --- | --- |
| [`web`](#member-web) | Web-page body source: fetches HTML/plain text, removes scripts and navigation, then hands the result to a text generator. |

### web {#member-web}

Retrieve a page and return its readable text.


```ts
sources.web(options?: WebOptions): Exclude<TextSource, string>
```


| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `options` | `WebOptions` | Optional | — |

**Returns:** `(context: GenerationContext) => string \| Promise<string>`


## isPublicAddress {#api-ispublicaddress}

Decide whether an address is an acceptable public destination.

**Import:** `@jangts/mock-gpt/web`。

## Definition

### Call


```ts
isPublicAddress(address: string): boolean
```

Decide whether an address is an acceptable public destination.

| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `address` | `string` | Required | — |

**Returns:** `boolean`


## WebOptions {#api-weboptions}

Configuration of `sources.web`.

**Import:** `@jangts/mock-gpt/web`。

## Definition

```ts
interface WebOptions
```

## Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `url` | `string \| ((context: GenerationContext) => string) \| undefined` | Optional | Fixed URL or synchronous selector; when omitted the prompt must contain exactly one URL. |
| `profile` | `"browser" \| "crawler" \| undefined` | Optional | Header profile; only `browser` (alias `crawler`) exists today. Default `browser`. |
| `headers` | `Record<string, string> \| undefined` | Optional | Content negotiation only; never copies browser cookies or model credentials. |
| `timeoutMs` | `number \| undefined` | Optional | Total retrieval deadline in milliseconds (1-120 000); default 20 000. |
| `maxBytes` | `number \| undefined` | Optional | Maximum page size in bytes (1-20 971 520); default 2 MiB, applied before and after decoding. |
| `maxChars` | `number \| undefined` | Optional | Maximum characters of extracted text kept for analysis (1-1 000 000); default 30 000. |
| `maxRedirects` | `number \| undefined` | Optional | Redirect budget (0-10); default 3. Each target is re-validated like the original URL. |
| `fallback` | `string \| undefined` | Optional | Explicit replacement source text on retrieval failure; request cancellation still throws. |
| `load` | `((url: URL, signal: AbortSignal, maxBytes: number) => Promise<LoadedPage>) \| undefined` | Optional | Trusted offline/custom transport. It owns its destination policy; not supplied by remote clients. |


## LoadedPage {#api-loadedpage}

A fetched page body plus the metadata needed for decoding and diagnostics.

**Import:** `@jangts/mock-gpt/web`。

## Definition

```ts
interface LoadedPage
```

## Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `bytes` | `Uint8Array<ArrayBufferLike>` | Required | Body bytes, still compressed only if the caller bypassed this transport. |
| `url` | `string` | Required | Final URL after redirects; may contain a query string, so callers must bound it before reporting. |
| `contentType` | `string` | Required | Raw `content-type` header, possibly empty and possibly including a charset parameter. |
| `status` | `number \| undefined` | Optional | HTTP status; omitted by existing custom loaders means 200. |


## WebProfile {#api-webprofile}

Name of an entry in `webHeaderProfiles`.

**Import:** `@jangts/mock-gpt/web`。

## Definition

```ts
type WebProfile = keyof typeof webHeaderProfiles;
```

## ## Examples
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
sources.web({ profile: 'browser', headers: { 'Accept-Language': 'en-US,en;q=0.9,zh;q=0.8' } });
```

Uses Node HTTP only. By default it rejects localhost, private and reserved addresses; each redirect re-checks and pins the connection address. An explicit security-challenge page returns `MOCK_WEB_CHALLENGE` even on HTTP 200; a block page returns `MOCK_WEB_BLOCKED`; redirect to a login path is reported as `MOCK_WEB_AUTH_REQUIRED`; timeouts are reported separately as `MOCK_WEB_TIMEOUT`. Source diagnostics are recorded in `mock.records`. HTML body extraction prefers Mozilla Readability and falls back to text filtered from scripts, styles and navigation.
