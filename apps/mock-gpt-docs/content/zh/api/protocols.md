---
title: "协议与生命周期"
outline: [2, 3]
---

# 协议与生命周期

查询路径支持及配置实例级后台、批处理与文件资源。

## Contents

| 符号 | 类别 | 说明 |
| --- | --- | --- |
| [`protocolCatalog`](#api-protocolcatalog) | 常量 | Read-only catalog of supported native codecs. |
| [`findProtocol`](#api-findprotocol) | 函数 | Look up a codec by native request path. |
| [`LifecycleOptions`](#api-lifecycleoptions) | 接口 | Opt in to background, batch and file resources. |
| [`ResourceLimits`](#api-resourcelimits) | 接口 | Per-instance lifecycle resource limits. |
| [`LifecycleFault`](#api-lifecyclefault) | 接口 | A configured operation fault. |
| [`lifecycleCatalog`](#api-lifecyclecatalog) | 常量 | Native lifecycle state transitions. |
| [`lifecycleFaultCatalog`](#api-lifecyclefaultcatalog) | 常量 | Supported lifecycle faults. |


## protocolCatalog {#api-protocolcatalog}

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
const protocolCatalog: readonly ProtocolCodec[]
```


## findProtocol {#api-findprotocol}

**导入：** `@jangts/mock-gpt`。

## 定义

### 调用


```ts
findProtocol(path: string): ProtocolCodec | undefined
```


| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `path` | `string` | 必需 | — |

**返回：** `ProtocolCodec \| undefined`


## LifecycleOptions {#api-lifecycleoptions}

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
interface LifecycleOptions
```

## Fields

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `limits` | `ResourceLimits \| undefined` | 可省略 | 说明见类型定义。 |
| `delayMs` | `number \| undefined` | 可省略 | 说明见类型定义。 |
| `faults` | `readonly LifecycleFault[] \| undefined` | 可省略 | 说明见类型定义。 |
| `scope` | `((request: Request) => string) \| undefined` | 可省略 | Synthetic identity only; credentials are never retained as scope. |


## ResourceLimits {#api-resourcelimits}

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
interface ResourceLimits
```

## Fields

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `maxOperations` | `number \| undefined` | 可省略 | 说明见类型定义。 |
| `maxFiles` | `number \| undefined` | 可省略 | 说明见类型定义。 |
| `maxItems` | `number \| undefined` | 可省略 | 说明见类型定义。 |
| `maxBytes` | `number \| undefined` | 可省略 | 说明见类型定义。 |
| `ttlMs` | `number \| undefined` | 可省略 | 说明见类型定义。 |
| `maxReads` | `number \| undefined` | 可省略 | 说明见类型定义。 |


## LifecycleFault {#api-lifecyclefault}

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
interface LifecycleFault
```

## Fields

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `kind` | `LifecycleFaultKind` | 必需 | 说明见类型定义。 |
| `operation` | `number \| undefined` | 可省略 | 说明见类型定义。 |
| `itemId` | `string \| undefined` | 可省略 | 说明见类型定义。 |


## lifecycleCatalog {#api-lifecyclecatalog}

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
const lifecycleCatalog: Readonly<Record<OperationState, readonly OperationState[]>>
```


## lifecycleFaultCatalog {#api-lifecyclefaultcatalog}

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
const lifecycleFaultCatalog: Readonly<{ readonly 'reject-before-accept': { readonly stage: "before-accept"; }; readonly 'lose-ack': { readonly stage: "after-accept"; }; readonly 'reverse-results': { readonly stage: "results"; }; readonly 'missing-item': { readonly stage: "results"; }; readonly 'duplicate-item': { readonly stage: "results"; }; readonly 'fail-item': { readonly stage: "generation"; }; }>
```
