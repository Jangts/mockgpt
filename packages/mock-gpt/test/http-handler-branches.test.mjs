/**
 * Branch coverage for the Node request handler and server lifecycle.
 *
 * Uses hand-written `IncomingMessage`/`ServerResponse` doubles and a mocked `http.createServer` so
 * failure branches (backpressure, client disconnect, late errors, bind/close errors) can be hit
 * deterministically. `syncBuiltinESMExports` is called because the source under test imports these
 * bindings by name. Runs against the built output in `dist/`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { setImmediate as turn, setTimeout as pause } from 'node:timers/promises';
import { createMockHandler, createMockServer } from '../dist/esm/node.js';

class Incoming extends EventEmitter {
  // `list` and `ignored` cover array-valued headers (joined) and empty headers (skipped).
  headers = { host: 'localhost', list: ['a', 'b'], ignored: '' };
  socket = { localAddress: '127.0.0.1' };
  method = 'POST';
  url = '/chat/completions';
  complete = true;
  destroyed = false;
  chunks = [Buffer.from('{}')];
  async *iterator() {
    yield* this.chunks;
  }
  destroy() {
    this.destroyed = true;
  }
}
class Outgoing extends EventEmitter {
  headersSent = false;
  destroyed = false;
  writableFinished = false;
  chunks = [];
  headers = {};
  setHeader(name, value) {
    this.headers[name] = value;
  }
  writeHead(status, headers) {
    this.status = status;
    this.headersSent = true;
    Object.assign(this.headers, headers);
  }
  write(value) {
    this.chunks.push(value);
    if (this.backpressure) {
      queueMicrotask(() => this.emit('drain'));
      return false;
    }
    return true;
  }
  end() {
    this.writableFinished = true;
    this.emit('close');
  }
  destroy(error) {
    this.destroyed = true;
    this.error = error;
    this.emit('close');
  }
}
async function invoke(options, incoming = new Incoming(), outgoing = new Outgoing()) {
  createMockHandler(options)(incoming, outgoing);
  await turn();
  return { incoming, outgoing };
}
const options = { mock: { fetch: async () => Response.json({ ok: true }) } };
test('HTTP adapter handles allowed origins, preflight, headers, absent paths and bounded request bodies', async () => {
  for (const origin of ['https://localhost', 'https://allowed.example']) {
    const incoming = new Incoming();
    incoming.socket.encrypted = true;
    incoming.headers.origin = origin;
    const { outgoing } = await invoke(
      { ...options, allowedOrigins: ['https://allowed.example'] },
      incoming,
    );
    assert.equal(outgoing.status, 200);
    assert.equal(outgoing.headers['access-control-allow-origin'], origin);
  }
  const preflight = new Incoming();
  preflight.method = 'OPTIONS';
  assert.equal((await invoke(options, preflight)).outgoing.status, 204);
  for (const method of ['GET', 'HEAD', undefined]) {
    const incoming = new Incoming();
    incoming.method = method;
    incoming.url = undefined;
    incoming.chunks = [];
    const { outgoing } = await invoke(options, incoming);
    assert.equal(outgoing.status, method === undefined ? 500 : 200);
  }
  assert.equal((await invoke({ ...options, maxBodyBytes: 1 })).outgoing.status, 413);
  const outgoing = new Outgoing();
  outgoing.backpressure = true;
  assert.equal((await invoke(options, new Incoming(), outgoing)).outgoing.writableFinished, true);
});

test('HTTP adapter preserves terminal failures after headers, disconnects and response writer failures', async () => {
  for (const reason of [Error('body failed'), false]) {
    const outgoing = (
      await invoke({
        mock: {
          fetch: async () =>
            new Response(
              new ReadableStream({
                start(controller) {
                  controller.error(reason);
                },
              }),
            ),
        },
      })
    ).outgoing;
    assert.equal(outgoing.destroyed, true);
    assert.equal(outgoing.error, reason instanceof Error ? reason : undefined);
  }
  const bad = new Outgoing();
  bad.writeHead = () => {
    throw Error('closed writer');
  };
  await invoke(
    {
      mock: {
        fetch: async () => {
          throw Error('upstream');
        },
      },
    },
    new Incoming(),
    bad,
  );
  assert.equal(bad.destroyed, true);
  const incoming = new Incoming();
  incoming.complete = false;
  const outgoing = new Outgoing();
  createMockHandler({
    requestTimeoutMs: 1,
    mock: {
      fetch: async (request) => {
        request.signal.throwIfAborted();
        return new Promise((_resolve, reject) =>
          request.signal.addEventListener('abort', () => reject(request.signal.reason), {
            once: true,
          }),
        );
      },
    },
  })(incoming, outgoing);
  await pause(10);
  assert.equal(incoming.destroyed, true);
  assert.equal(outgoing.destroyed, true);
  // A disconnected native response cancels a currently pending model request.
  const disconnected = new Incoming(),
    response = new Outgoing();
  let signal;
  createMockHandler({
    requestTimeoutMs: 20,
    mock: {
      fetch: async (request) => {
        signal = request.signal;
        signal.throwIfAborted();
        return new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
        );
      },
    },
  })(disconnected, response);
  await turn();
  response.destroy();
  assert.equal(signal.aborted, true);
  await turn();
  assert.equal(disconnected.listenerCount('aborted'), 0);
  assert.equal(response.listenerCount('close'), 0);
});

test('a previously destroyed HTTP response cannot receive a late error body', async () => {
  const incoming = new Incoming(),
    outgoing = new Outgoing();
  await invoke(
    {
      mock: {
        fetch: async () => {
          outgoing.destroyed = true;
          throw Error('late failure');
        },
      },
    },
    incoming,
    outgoing,
  );
  assert.equal(outgoing.headersSent, false);
  assert.deepEqual(outgoing.chunks, []);
  assert.equal(incoming.listenerCount('aborted'), 0);
  assert.equal(outgoing.listenerCount('close'), 0);
});

test('TCP service lifecycle reports native listen, address and close failures without leaking state', async (t) => {
  const servers = [];
  class Server extends EventEmitter {
    listening = false;
    listen(_port, _host, callback) {
      if (this.listenError) throw this.listenError;
      if (this.asyncListenError) {
        queueMicrotask(() => this.emit('error', this.asyncListenError));
        return;
      }
      this.listening = true;
      queueMicrotask(callback);
    }
    address() {
      return this.result === undefined ? { address: '::1', family: 'IPv6', port: 1 } : this.result;
    }
    close(callback) {
      this.listening = false;
      queueMicrotask(() => callback(this.closeError));
    }
    closeAllConnections() {}
  }
  t.mock.method(http, 'createServer', () => {
    const server = new Server();
    servers.push(server);
    return server;
  });
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  const service = createMockServer(options);
  await service.close();
  assert.equal((await service.listen({ host: '0.0.0.0', port: 0 })).url, 'http://[::1]:1');
  await service.close();
  servers[0].listenError = Error('listen');
  await assert.rejects(service.listen({ port: 0 }), /listen/);
  servers[0].listenError = undefined;
  for (const result of [null, '/socket']) {
    servers[0].result = result;
    await assert.rejects(service.listen({ port: 0 }), /TCP address/);
    await service.close();
  }
  servers[0].result = undefined;
  await service.listen({ port: 0 });
  servers[0].closeError = Error('close');
  await assert.rejects(service.close(), /close/);
  servers[0].asyncListenError = Error('async listen');
  const starting = service.listen({ port: 0 }),
    closing = service.close();
  await assert.rejects(starting, /async listen/);
  await closing;
});
