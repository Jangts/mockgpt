/** Node WebSocket shell; all model and protocol semantics live in the shared duplex engine. */
import { WebSocketServer, WebSocket } from 'ws';
import { createMockDuplex, type MockDuplexOptions, type RealtimeMock } from '../realtime/duplex.js';
import { integer, MockGPTError } from '../shared/utils.js';
export interface MockWebSocketServerOptions extends MockDuplexOptions {
  host?: string;
  port?: number;
  maxBufferedBytes?: number;
  maxInboundFrames?: number;
}
/** Listen on loopback by default. The returned close waits for sockets and listening handles. */
export async function createMockWebSocketServer(
  mock: RealtimeMock,
  options: MockWebSocketServerOptions,
) {
  const buffered = integer(options.maxBufferedBytes ?? 1_048_576, 'maxBufferedBytes', 1);
  const inbound = integer(options.maxInboundFrames ?? 64, 'maxInboundFrames', 1);
  const server = new WebSocketServer({
    host: options.host ?? '127.0.0.1',
    port: options.port ?? 0,
    maxPayload: options.maxFrameBytes ?? 1_048_576,
  });
  const connections = new Set<() => void>();
  server.on('connection', (socket) => {
    let duplex: ReturnType<typeof createMockDuplex>;
    try {
      duplex = createMockDuplex(mock, options);
    } catch {
      socket.close(1013, 'Connection limit');
      return;
    }
    let stopped = false;
    let queued = 0;
    let chain = Promise.resolve();
    const stop = () => {
      if (stopped) return;
      stopped = true;
      duplex.close();
      socket.terminate();
      connections.delete(stop);
    };
    connections.add(stop);
    socket.once('close', stop);
    socket.once('error', stop);
    socket.on('message', (data, isBinary) => {
      if (stopped) return;
      if (isBinary || ++queued > inbound) {
        stop();
        return;
      }
      chain = chain
        .then(async () => {
          if (stopped) return;
          try {
            await duplex.send(JSON.parse(data.toString()));
          } finally {
            queued--;
          }
        })
        .catch(stop);
    });
    void (async () => {
      try {
        for await (const frame of duplex.frames) {
          if (stopped) break;
          const body = JSON.stringify(frame);
          if (
            socket.readyState !== WebSocket.OPEN ||
            socket.bufferedAmount + Buffer.byteLength(body) > buffered
          )
            throw new MockGPTError(
              'MOCK_RESOURCE_LIMIT',
              'WebSocket outbound buffered bytes exceeded',
            );
          await new Promise<void>((resolve, reject) =>
            socket.send(body, (error) => (error ? reject(error) : resolve())),
          );
        }
      } catch {
        /* Socket closure is observable; private generated content is never logged. */
      } finally {
        stop();
      }
    })();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing WebSocket address');
  return {
    url: `ws://${options.host ?? '127.0.0.1'}:${address.port}`,
    server,
    async close() {
      for (const stop of connections) stop();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
