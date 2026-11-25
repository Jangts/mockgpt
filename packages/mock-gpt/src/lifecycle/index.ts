/** Native background, Batch and file adapters over one bounded instance resource domain. */
import type { Generated, GenerationInput } from '../types.js';
import { errorResponse, readBytes, integer } from '../shared/utils.js';
import {
  ResourceStore,
  resourceError,
  type ResourceLimits,
  type StoredOperation,
} from './store.js';
import { faultsAt, validateFaults, type LifecycleFault } from './faults.js';
export { lifecycleCatalog } from './store.js';
export { lifecycleFaultCatalog } from './faults.js';
export type { LifecycleFault } from './faults.js';
export type { ResourceLimits } from './store.js';
type Wire = Record<string, any>;
type Kind = 'responses' | 'interactions' | 'openai-batch' | 'anthropic-batch' | 'gemini-batch';
interface Item {
  id: string;
  input: GenerationInput;
  result?: Wire;
  error?: Wire;
}
interface Operation extends StoredOperation {
  kind: Kind;
  model: string;
  items: Item[];
  executionComplete: boolean;
  faults: readonly LifecycleFault[];
  inputFile?: string;
  outputFile?: string;
  errorFile?: string;
  finalized: boolean;
}
export interface LifecycleOptions {
  limits?: ResourceLimits;
  delayMs?: number;
  faults?: readonly LifecycleFault[];
  /** Synthetic identity only; credentials are never retained as scope. */
  scope?: (request: Request) => string;
}
export interface LifecyclePorts {
  generate(input: GenerationInput, signal: AbortSignal): Promise<Generated>;
  decode(body: unknown, url: URL): GenerationInput;
  encode(input: GenerationInput, generated: Generated, id: string): Response | Promise<Response>;
  clock?: () => number;
  /** Per-request wire body limit, independent of retained resource bytes. Defaults to 1 MiB. */
  maxBodyBytes?: number;
  options?: LifecycleOptions;
}
const paths = {
  responses: /^\/(?:v1\/)?responses(?:\/([^/]+))?(\/cancel)?$/,
  interactions: /^\/(?:v1beta\/|v1\/)?interactions(?:\/([^/]+))?(\/cancel)?$/,
  'openai-batch': /^\/(?:v1\/)?batches(?:\/([^/]+))?(\/cancel)?$/,
  'anthropic-batch': /^\/(?:v1\/)?messages\/batches(?:\/([^/]+))?(\/(?:cancel|results))?$/,
  'gemini-batch': /^\/(?:v1beta\/|v1\/)?batches\/([^/:]+)(:cancel)?$/,
} as const;
/** Catalog controls route precedence and native operation family. */
export const lifecycleRoutes = Object.freeze(
  Object.entries(paths).map(([kind, pattern]) => Object.freeze({ kind: kind as Kind, pattern })),
);
const jsonl = (rows: readonly unknown[]) => rows.map((row) => JSON.stringify(row)).join('\n');
function object(value: unknown): Wire {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw resourceError('MOCK_REQUEST', 'Expected object');
  return value as Wire;
}
/** No polling timers: submission starts work once, clock controls visibility, reads only observe it. */
export class LifecycleRuntime {
  readonly store: ResourceStore<Operation>;
  private attempts = 0;
  private counters = { httpActions: 0, generations: 0, batchItems: 0 };
  private options: LifecycleOptions;
  private readonly maxBodyBytes: number;
  constructor(private ports: LifecyclePorts) {
    this.maxBodyBytes = integer(ports.maxBodyBytes ?? 1_048_576, 'maxBodyBytes', 1);
    this.options = {
      ...ports.options,
      limits: { ...ports.options?.limits },
      faults: ports.options?.faults?.map((fault) => ({ ...fault })),
    };
    validateFaults(this.options.faults ?? []);
    if (!Number.isSafeInteger(this.options.delayMs ?? 0) || (this.options.delayMs ?? 0) < 0)
      throw resourceError('MOCK_CONFIG', 'lifecycle.delayMs must be nonnegative integer');
    this.store = new ResourceStore(ports.clock ?? Date.now, this.options.limits);
  }
  get activeOperations() {
    return this.store.active;
  }
  get stats() {
    return {
      lifecycleHttpActions: this.counters.httpActions,
      lifecycleGenerations: this.counters.generations,
      batchItems: this.counters.batchItems,
      activeOperations: this.activeOperations,
    };
  }
  reset() {
    this.store.reset();
    this.attempts = 0;
    this.counters = { httpActions: 0, generations: 0, batchItems: 0 };
  }
  private scope(request: Request) {
    const scope = this.options.scope?.(request) ?? request.headers.get('x-mock-scope') ?? 'default';
    if (typeof scope !== 'string' || !scope.length)
      throw resourceError('MOCK_REQUEST', 'Invalid resource scope');
    return scope;
  }
  private async body(request: Request): Promise<Wire> {
    try {
      return object(
        JSON.parse(
          new TextDecoder().decode(
            await readBytes(request.body, this.maxBodyBytes, request.signal),
          ),
        ),
      );
    } catch (error) {
      request.signal.throwIfAborted();
      if ((error as any)?.code) throw error;
      throw resourceError('MOCK_REQUEST', 'Invalid JSON');
    }
  }
  private decode(body: Wire, path: string, request: Request): GenerationInput {
    return {
      ...this.ports.decode(
        { ...body, stream: false, background: false },
        new URL(path, request.url),
      ),
      wirePath: path,
    };
  }
  private fileId(name: string) {
    return name.replace(/^files\//, '');
  }
  private rows(file: string, scope: string): Wire[] {
    try {
      return this.store
        .get(this.store.files, this.fileId(file), scope)
        .text.split('\n')
        .filter(Boolean)
        .map((line) => object(JSON.parse(line)));
    } catch (error) {
      if ((error as any)?.code) throw error;
      throw resourceError('MOCK_REQUEST', 'Invalid JSONL');
    }
  }
  private async items(kind: Kind, body: Wire, request: Request, scope: string): Promise<Item[]> {
    let rows: Wire[];
    let model = body.model;
    if (kind === 'responses' || kind === 'interactions')
      return [
        {
          id: 'result',
          input: this.decode(
            body,
            kind === 'responses' ? '/v1/responses' : '/v1beta/interactions',
            request,
          ),
        },
      ];
    if (kind === 'openai-batch') {
      if (typeof body.input_file_id !== 'string')
        throw resourceError('MOCK_REQUEST', 'input_file_id required');
      rows = this.rows(body.input_file_id, scope).map((row) => {
        if (
          typeof row.url !== 'string' ||
          (body.endpoint !== undefined && row.url !== body.endpoint)
        )
          throw resourceError('MOCK_REQUEST', 'Batch item endpoint mismatch');
        return { id: row.custom_id, body: row.body, path: row.url, method: row.method };
      });
    } else if (kind === 'anthropic-batch') {
      if (!Array.isArray(body.requests))
        throw resourceError('MOCK_REQUEST', 'requests must be an array');
      rows = body.requests.map((row: Wire) => ({
        id: row?.custom_id,
        body: row?.params,
        path: '/v1/messages',
      }));
    } else {
      const config = body.batch?.input_config ?? body.batch?.inputConfig;
      model = decodeURIComponent(
        new URL(request.url).pathname.match(/models\/(.+):batchGenerateContent$/)?.[1] ?? '',
      );
      const raw =
        config?.file_name || config?.fileName
          ? this.rows(config.file_name ?? config.fileName, scope)
          : config?.requests?.requests;
      if (!Array.isArray(raw))
        throw resourceError('MOCK_REQUEST', 'Gemini batch input requires requests or file_name');
      rows = raw.map((row: Wire) => ({
        id: row.key ?? row.metadata?.key,
        body: row.request,
        path: `/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      }));
    }
    if (!Array.isArray(rows) || !rows.length || rows.length > this.store.limits.maxItems)
      throw resourceError('MOCK_RESOURCE_LIMIT', 'Batch item count outside limits', 413);
    const ids = new Set<string>();
    return rows.map((row) => {
      if (
        typeof row.id !== 'string' ||
        !row.id ||
        ids.has(row.id) ||
        (row.method !== undefined && row.method !== 'POST')
      )
        throw resourceError('MOCK_REQUEST', 'Invalid or duplicate batch item ID/method');
      ids.add(row.id);
      return { id: row.id, input: this.decode(object(row.body), row.path, request) };
    });
  }
  private async submit(kind: Kind, body: Wire, request: Request, scope: string) {
    const number = ++this.attempts;
    const faults = this.options.faults ?? [];
    if (faultsAt(faults, number, 'before-accept').length)
      throw resourceError('MOCK_REJECTED', 'Submission rejected', 503);
    const items = await this.items(kind, body, request, scope);
    const selected = faults.filter((f) => f.operation === undefined || f.operation === number);
    if (
      selected.some(
        (f) =>
          (!kind.endsWith('-batch') &&
            ['reverse-results', 'missing-item', 'duplicate-item'].includes(f.kind)) ||
          (f.itemId && !items.some((i) => i.id === f.itemId)),
      )
    )
      throw resourceError('MOCK_CONFIG', 'lifecycle.faults incompatible with operation/items');
    const bytes = new TextEncoder().encode(JSON.stringify(items)).length;
    this.store.capacity(bytes, 'operations');
    const now = this.store.now();
    const operation: Operation = {
      id: this.store.id(
        kind === 'gemini-batch'
          ? 'batches/mock-'
          : kind === 'responses'
            ? 'resp-mock-'
            : kind === 'interactions'
              ? 'interaction-mock-'
              : 'batch-mock-',
      ),
      scope,
      state: 'pending',
      controller: new AbortController(),
      ready: now + (this.options.delayMs ?? 0),
      expires: now + this.store.limits.ttlMs,
      bytes,
      kind,
      items,
      model: items[0].input.model,
      faults: faults.filter((f) => f.operation === undefined || f.operation === number),
      executionComplete: false,
      finalized: false,
      inputFile: body.input_file_id,
    };
    this.store.operations.set(operation.id, operation);
    void this.execute(operation).then(() => {
      operation.executionComplete = true;
    });
    if (faultsAt(faults, number, 'after-accept').length)
      throw resourceError('MOCK_NETWORK', 'Simulated acknowledgement loss');
    return Response.json(this.view(operation));
  }
  private async execute(operation: Operation) {
    for (const item of operation.items) {
      if (operation.state !== 'pending' || operation.controller.signal.aborted) break;
      try {
        this.counters.generations++;
        if (operation.kind.endsWith('-batch')) this.counters.batchItems++;
        const generated = await this.ports.generate(item.input, operation.controller.signal);
        if (operation.state !== 'pending') return;
        if (
          operation.faults.some(
            (f) => f.kind === 'fail-item' && (!f.itemId || f.itemId === item.id),
          )
        )
          throw resourceError('MOCK_ITEM_FAILED', 'Simulated item failure');
        const response = await this.ports.encode(
          item.input,
          generated,
          `${operation.id}_${item.id}`,
        );
        const result = await response.json();
        if (operation.state !== 'pending') return;
        const bytes = new TextEncoder().encode(JSON.stringify(result)).length;
        if (this.store.bytes + bytes > this.store.limits.maxBytes)
          throw resourceError('MOCK_RESOURCE_LIMIT', 'Stored result exceeds resource budget', 413);
        operation.bytes += bytes;
        if (response.ok) item.result = result;
        else item.error = result;
      } catch (error) {
        item.error = {
          code: (error as any)?.code ?? 'MOCK_GENERATION',
          message: 'Item generation failed',
        };
      }
    }
  }
  private resultRows(operation: Operation): Wire[] {
    let rows = operation.items.map((item) => {
      const error = item.error ?? (!item.result ? { code: 'MOCK_CANCELLED' } : undefined);
      if (operation.kind === 'anthropic-batch')
        return {
          custom_id: item.id,
          result: error ? { type: 'errored', error } : { type: 'succeeded', message: item.result },
        };
      if (operation.kind === 'gemini-batch')
        return { key: item.id, ...(error ? { error } : { response: item.result }) };
      return {
        id: `${operation.id}_${item.id}`,
        custom_id: item.id,
        response: error ? null : { status_code: 200, body: item.result },
        error: error ?? null,
      };
    });
    for (const fault of operation.faults.filter((f) =>
      ['reverse-results', 'missing-item', 'duplicate-item'].includes(f.kind),
    )) {
      const index = fault.itemId
        ? rows.findIndex((r) => (r.custom_id ?? r.key) === fault.itemId)
        : 0;
      if (fault.kind === 'reverse-results') rows.reverse();
      else if (index >= 0 && fault.kind === 'missing-item') rows.splice(index, 1);
      else if (index >= 0) rows.push(rows[index]);
    }
    return rows;
  }
  private observe(operation: Operation) {
    if (
      operation.state !== 'pending' ||
      !operation.executionComplete ||
      this.store.now() < operation.ready
    )
      return;
    try {
      if (operation.kind === 'openai-batch' && !operation.finalized) {
        const rows = this.resultRows(operation);
        operation.outputFile = this.store.file(
          jsonl(rows.filter((r) => !r.error)),
          operation.scope,
        ).id;
        operation.errorFile = this.store.file(
          jsonl(rows.filter((r) => r.error)),
          operation.scope,
        ).id;
      }
      if (operation.kind === 'gemini-batch' && !operation.finalized)
        operation.outputFile = this.store.file(
          jsonl(this.resultRows(operation)),
          operation.scope,
        ).id;
      operation.finalized = true;
      this.store.transition(
        operation,
        operation.items.length === 1 &&
          !operation.kind.endsWith('-batch') &&
          operation.items[0].error
          ? 'failed'
          : 'completed',
      );
    } catch {
      if (operation.outputFile) this.store.files.delete(operation.outputFile);
      if (operation.errorFile) this.store.files.delete(operation.errorFile);
      operation.outputFile = undefined;
      operation.errorFile = undefined;
      this.store.transition(operation, 'failed');
    }
  }
  private view(operation: Operation): Wire {
    const status = operation.state === 'pending' ? 'in_progress' : operation.state;
    if (operation.kind === 'responses' || operation.kind === 'interactions') {
      const result = operation.state === 'completed' ? operation.items[0].result : undefined;
      return {
        ...result,
        id: operation.id,
        status: result?.status ?? status,
        model: operation.model,
        ...(operation.state === 'failed' ? { error: operation.items[0].error } : {}),
      };
    }
    if (operation.kind === 'anthropic-batch')
      return {
        id: operation.id,
        type: 'message_batch',
        processing_status: operation.state === 'pending' ? 'in_progress' : 'ended',
        request_counts: {
          processing: operation.state === 'pending' ? operation.items.length : 0,
          succeeded:
            operation.state === 'completed' ? operation.items.filter((i) => i.result).length : 0,
          errored: operation.items.filter((i) => i.error).length,
          canceled: operation.state === 'cancelled' ? operation.items.length : 0,
          expired: 0,
        },
        results_url: `/v1/messages/batches/${operation.id}/results`,
      };
    if (operation.kind === 'gemini-batch')
      return {
        name: operation.id,
        metadata: {
          state: {
            pending: 'JOB_STATE_RUNNING',
            completed: 'JOB_STATE_SUCCEEDED',
            cancelled: 'JOB_STATE_CANCELLED',
            failed: 'JOB_STATE_FAILED',
            expired: 'JOB_STATE_EXPIRED',
          }[operation.state],
        },
        done: operation.state !== 'pending',
        ...(operation.outputFile
          ? {
              response: {
                responsesFile: `files/${operation.outputFile}`,
                inlinedResponses: { inlinedResponses: this.resultRows(operation) },
              },
            }
          : {}),
      };
    return {
      id: operation.id,
      object: 'batch',
      status,
      input_file_id: operation.inputFile,
      output_file_id: operation.outputFile ?? null,
      error_file_id: operation.errorFile ?? null,
    };
  }
  private async files(request: Request, scope: string): Promise<Response | undefined> {
    const path = new URL(request.url).pathname;
    const match =
      /^\/(?:v1\/|v1beta\/|upload\/v1beta\/|download\/v1beta\/)?files(?:\/([^/:]+))?(\/content|:download)?$/.exec(
        path,
      );
    if (!match) return;
    const id = match[1];
    const command = request.headers.get('x-goog-upload-command');
    if (command === 'start' && !id && request.method === 'POST') {
      const metadata = await this.body(request);
      const file = this.store.file(
        '',
        scope,
        metadata.file?.display_name ?? metadata.file?.displayName ?? 'input.jsonl',
      );
      const upload = new URL(`/upload/v1beta/files/${file.id}`, request.url);
      return new Response(null, {
        headers: { 'x-goog-upload-url': upload.href, 'x-goog-upload-status': 'active' },
      });
    }
    if (id && command?.includes('finalize') && request.method === 'POST') {
      const file = this.store.get(this.store.files, id, scope);
      const text = new TextDecoder().decode(
        await readBytes(request.body, this.maxBodyBytes, request.signal),
      );
      const bytes = new TextEncoder().encode(text).length;
      if (this.store.bytes - file.bytes + bytes > this.store.limits.maxBytes)
        throw resourceError('MOCK_RESOURCE_LIMIT', 'File capacity exceeded', 413);
      file.text = text;
      file.bytes = bytes;
      return Response.json(
        { file: this.fileView(file) },
        { headers: { 'x-goog-upload-status': 'final' } },
      );
    }
    if (!id && request.method === 'POST') {
      let text: string;
      let filename = 'input.jsonl';
      if (request.headers.get('content-type')?.includes('multipart/form-data')) {
        const bytes = await readBytes(request.body, this.maxBodyBytes, request.signal);
        const form = await new Request(request.url, {
          method: 'POST',
          headers: request.headers,
          body: new Uint8Array(bytes).buffer,
        }).formData();
        const file = form.get('file');
        if (!file || typeof file === 'string')
          throw resourceError('MOCK_REQUEST', 'file form field required');
        text = await file.text();
        filename = file.name;
      } else
        text = new TextDecoder().decode(
          await readBytes(request.body, this.maxBodyBytes, request.signal),
        );
      const file = this.store.file(text, scope, filename);
      return Response.json({ ...this.fileView(file), file: this.fileView(file) });
    }
    if (!id && request.method === 'GET')
      return Response.json({
        object: 'list',
        data: [...this.store.files.values()]
          .filter((f) => f.scope === scope)
          .map((f) => this.fileView(f)),
      });
    if (!id) throw resourceError('MOCK_METHOD', 'Unsupported file action', 405);
    const file = this.store.get(this.store.files, id, scope);
    if (++file.reads > this.store.limits.maxReads)
      throw resourceError('MOCK_RESOURCE_LIMIT', 'File read count exceeded', 429);
    if (request.method === 'DELETE') {
      this.store.files.delete(id);
      return Response.json({ id, deleted: true, object: 'file' });
    }
    if (request.method !== 'GET') throw resourceError('MOCK_METHOD', 'Expected GET or DELETE', 405);
    return match[2]
      ? new Response(file.text, { headers: { 'content-type': 'application/jsonl' } })
      : Response.json(this.fileView(file));
  }
  private fileView(file: { id: string; bytes: number; filename: string }) {
    return {
      id: file.id,
      name: `files/${file.id}`,
      object: 'file',
      bytes: file.bytes,
      sizeBytes: String(file.bytes),
      filename: file.filename,
      purpose: 'batch',
      state: 'ACTIVE',
      mimeType: 'application/jsonl',
      uri: `mock://files/${file.id}`,
    };
  }
  async handle(request: Request): Promise<Response | undefined> {
    const url = new URL(request.url);
    const geminiCreate = /^\/(?:v1beta\/|v1\/)?models\/[^/]+:batchGenerateContent$/.test(
      url.pathname,
    );
    const route = lifecycleRoutes.find((r) => r.pattern.test(url.pathname));
    const fileRoute = /\/(?:files)(?:\/|$)/.test(url.pathname);
    if (!geminiCreate && !route && !fileRoute) return;
    // Ordinary generation endpoints remain owned by the generation catalog.
    let body: Wire | undefined;
    if (
      route &&
      ['responses', 'interactions'].includes(route.kind) &&
      !route.pattern.exec(url.pathname)?.[1] &&
      request.method === 'POST'
    ) {
      try {
        body = await this.body(request.clone());
      } catch (error) {
        request.signal.throwIfAborted();
        return errorResponse(error);
      }
      if (body.background !== true) return;
    }
    this.counters.httpActions++;
    try {
      request.signal.throwIfAborted();
      this.store.sweep();
      const scope = this.scope(request);
      if (request.body && request.method !== 'POST')
        await readBytes(request.body, this.maxBodyBytes, request.signal);
      if (fileRoute) return await this.files(request, scope);
      const kind: Kind = geminiCreate ? 'gemini-batch' : route!.kind;
      const match = route?.pattern.exec(url.pathname);
      let id = match?.[1];
      if (kind === 'gemini-batch' && id) id = `batches/${id}`;
      if (!id && request.method === 'POST')
        return await this.submit(kind, body ?? (await this.body(request)), request, scope);
      if (!id) throw resourceError('MOCK_METHOD', 'Unsupported operation action', 405);
      const operation = this.store.get(this.store.operations, id, scope);
      if (operation.kind !== kind)
        throw resourceError('MOCK_RESOURCE_NOT_FOUND', 'Operation not found', 404);
      const cancel = match?.[2]?.includes('cancel');
      if (cancel && request.method === 'POST') {
        await readBytes(request.body, this.maxBodyBytes, request.signal);
        this.store.get(this.store.operations, id, scope);
        this.observe(operation);
        this.store.transition(operation, 'cancelled');
        return Response.json(this.view(operation));
      }
      if (request.method !== 'GET' || cancel)
        throw resourceError('MOCK_METHOD', 'Unsupported operation method', 405);
      this.observe(operation);
      if (operation.state === 'expired')
        throw resourceError('MOCK_RESOURCE_EXPIRED', 'Resource expired', 410);
      if (match?.[2] === '/results') {
        if (operation.state === 'pending')
          throw resourceError('MOCK_NOT_READY', 'Results pending', 409);
        return new Response(jsonl(this.resultRows(operation)), {
          headers: { 'content-type': 'application/jsonl' },
        });
      }
      return Response.json(this.view(operation));
    } catch (error) {
      request.signal.throwIfAborted();
      if ((error as any)?.code === 'MOCK_NETWORK') throw error;
      return errorResponse(error);
    }
  }
}
