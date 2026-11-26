---
title: "Protocols and lifecycles"
outline: [2, 3]
---

# Protocols and lifecycles

Inspect route support and configure background, batch and file resources.

## Contents

| Symbol | Kind | Description |
| --- | --- | --- |
| [`protocolCatalog`](#api-protocolcatalog) | constant | Read-only catalog of supported native codecs. |
| [`findProtocol`](#api-findprotocol) | function | Look up a codec by native request path. |
| [`LifecycleOptions`](#api-lifecycleoptions) | interface | Opt in to background, batch and file resources. |
| [`ResourceLimits`](#api-resourcelimits) | interface | Per-instance lifecycle resource limits. |
| [`LifecycleFault`](#api-lifecyclefault) | interface | A configured operation fault. |
| [`lifecycleCatalog`](#api-lifecyclecatalog) | constant | Native lifecycle state transitions. |
| [`lifecycleFaultCatalog`](#api-lifecyclefaultcatalog) | constant | Supported lifecycle faults. |


## protocolCatalog {#api-protocolcatalog}

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
const protocolCatalog: readonly ProtocolCodec[]
```


## findProtocol {#api-findprotocol}

**Import:** `@jangts/mock-gpt`。

## Definition

### Call


```ts
findProtocol(path: string): ProtocolCodec | undefined
```


| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `path` | `string` | Required | — |

**Returns:** `ProtocolCodec \| undefined`


## LifecycleOptions {#api-lifecycleoptions}

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
interface LifecycleOptions
```

## Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `limits` | `ResourceLimits \| undefined` | Optional | Description见类型定义。 |
| `delayMs` | `number \| undefined` | Optional | Description见类型定义。 |
| `faults` | `readonly LifecycleFault[] \| undefined` | Optional | Description见类型定义。 |
| `scope` | `((request: Request) => string) \| undefined` | Optional | Synthetic identity only; credentials are never retained as scope. |


## ResourceLimits {#api-resourcelimits}

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
interface ResourceLimits
```

## Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `maxOperations` | `number \| undefined` | Optional | Description见类型定义。 |
| `maxFiles` | `number \| undefined` | Optional | Description见类型定义。 |
| `maxItems` | `number \| undefined` | Optional | Description见类型定义。 |
| `maxBytes` | `number \| undefined` | Optional | Description见类型定义。 |
| `ttlMs` | `number \| undefined` | Optional | Description见类型定义。 |
| `maxReads` | `number \| undefined` | Optional | Description见类型定义。 |


## LifecycleFault {#api-lifecyclefault}

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
interface LifecycleFault
```

## Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `kind` | `LifecycleFaultKind` | Required | Description见类型定义。 |
| `operation` | `number \| undefined` | Optional | Description见类型定义。 |
| `itemId` | `string \| undefined` | Optional | Description见类型定义。 |


## lifecycleCatalog {#api-lifecyclecatalog}

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
const lifecycleCatalog: Readonly<Record<OperationState, readonly OperationState[]>>
```


## lifecycleFaultCatalog {#api-lifecyclefaultcatalog}

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
const lifecycleFaultCatalog: Readonly<{ readonly 'reject-before-accept': { readonly stage: "before-accept"; }; readonly 'lose-ack': { readonly stage: "after-accept"; }; readonly 'reverse-results': { readonly stage: "results"; }; readonly 'missing-item': { readonly stage: "results"; }; readonly 'duplicate-item': { readonly stage: "results"; }; readonly 'fail-item': { readonly stage: "generation"; }; }>
```
