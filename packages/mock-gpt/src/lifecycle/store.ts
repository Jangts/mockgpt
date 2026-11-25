/** Instance-local bounded resources and atomic lifecycle transitions; no timers or external I/O. */
import { MockGPTError } from '../shared/utils.js';
export type OperationState = 'pending' | 'completed' | 'cancelled' | 'failed' | 'expired';
export const lifecycleCatalog: Readonly<Record<OperationState, readonly OperationState[]>> =
  Object.freeze({
    pending: Object.freeze(['completed', 'cancelled', 'failed', 'expired'] as OperationState[]),
    completed: Object.freeze([]),
    cancelled: Object.freeze([]),
    failed: Object.freeze([]),
    expired: Object.freeze([]),
  });
export interface ResourceLimits {
  maxOperations?: number;
  maxFiles?: number;
  maxItems?: number;
  maxBytes?: number;
  ttlMs?: number;
  maxReads?: number;
}
export interface Resource {
  id: string;
  scope: string;
  expires: number;
}
export interface StoredFile extends Resource {
  text: string;
  filename: string;
  bytes: number;
  reads: number;
}
export interface StoredOperation extends Resource {
  state: OperationState;
  controller: AbortController;
  ready: number;
  bytes: number;
}
export const resourceError = (code: string, message: string, status = 400) =>
  new MockGPTError(code, message, status);
/** All mutation and expiration belongs to this store, including tombstones and byte ownership. */
export class ResourceStore<O extends StoredOperation> {
  readonly operations = new Map<string, O>();
  readonly files = new Map<string, StoredFile>();
  private tombstones = new Map<string, string>();
  readonly limits: Required<ResourceLimits>;
  private sequence = 0;
  constructor(
    readonly clock: () => number,
    limits: ResourceLimits = {},
  ) {
    this.limits = {
      maxOperations: 100,
      maxFiles: 100,
      maxItems: 100,
      maxBytes: 16 * 1024 * 1024,
      ttlMs: 60_000,
      maxReads: 1000,
      ...limits,
    };
    for (const [key, value] of Object.entries(this.limits))
      if (!Number.isSafeInteger(value) || value <= 0)
        throw resourceError('MOCK_CONFIG', `lifecycle.${key} must be a positive integer`);
  }
  now() {
    const value = this.clock();
    if (!Number.isFinite(value))
      throw resourceError('MOCK_CONFIG', 'clock must return finite milliseconds');
    return value;
  }
  id(prefix: string) {
    return `${prefix}${++this.sequence}`;
  }
  transition(operation: O, next: OperationState) {
    if (lifecycleCatalog[operation.state].includes(next)) {
      operation.state = next;
      if (next !== 'completed')
        operation.controller.abort(resourceError('MOCK_CANCELLED', 'Operation stopped'));
    }
  }
  sweep() {
    const now = this.now();
    for (const [id, item] of [...this.operations, ...this.files] as [string, O | StoredFile][]) {
      if (item.expires > now) continue;
      if ('state' in item) this.transition(item as O, 'expired');
      this.operations.delete(id);
      this.files.delete(id);
      this.tombstones.set(id, item.scope);
      while (this.tombstones.size > this.limits.maxOperations + this.limits.maxFiles)
        this.tombstones.delete(this.tombstones.keys().next().value!);
    }
  }
  get<T extends Resource>(map: Map<string, T>, id: string, scope: string): T {
    this.sweep();
    const item = map.get(id);
    if (!item || item.scope !== scope) {
      if (this.tombstones.get(id) === scope)
        throw resourceError('MOCK_RESOURCE_EXPIRED', 'Resource expired', 410);
      throw resourceError('MOCK_RESOURCE_NOT_FOUND', 'Resource not found', 404);
    }
    return item;
  }
  get bytes() {
    return [...this.files.values(), ...this.operations.values()].reduce(
      (sum, item) => sum + item.bytes,
      0,
    );
  }
  capacity(bytes: number, count: 'files' | 'operations') {
    this.sweep();
    const limit = count === 'files' ? this.limits.maxFiles : this.limits.maxOperations;
    if (this[count].size >= limit || this.bytes + bytes > this.limits.maxBytes)
      throw resourceError('MOCK_RESOURCE_LIMIT', 'Resource capacity exceeded', 413);
  }
  file(text: string, scope: string, filename = 'output.jsonl') {
    const bytes = new TextEncoder().encode(text).length;
    this.capacity(bytes, 'files');
    const file: StoredFile = {
      id: this.id('file-mock-'),
      scope,
      expires: this.now() + this.limits.ttlMs,
      text,
      filename,
      bytes,
      reads: 0,
    };
    this.files.set(file.id, file);
    return file;
  }
  get active() {
    this.sweep();
    return [...this.operations.values()].filter((o) => o.state === 'pending').length;
  }
  reset() {
    if (this.active) throw resourceError('MOCK_ACTIVE', 'Cannot reset active operations');
    this.operations.clear();
    this.files.clear();
    this.tombstones.clear();
    this.sequence = 0;
  }
}
