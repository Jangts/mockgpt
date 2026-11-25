/** Bind the same JSON duplex to a host-provided data channel. No SDP or media is simulated. */
import { createMockDuplex, type RealtimeMock, type MockDuplexOptions } from './duplex.js';
import { integer } from '../shared/utils.js';
export interface MockDataChannel {
  readonly bufferedAmount: number;
  readonly readyState: string;
  send(data: string): void;
  close(): void;
  addEventListener(type: string, listener: (event: any) => void): void;
  removeEventListener(type: string, listener: (event: any) => void): void;
}
export function bindMockDataChannel(
  mock: RealtimeMock,
  channel: MockDataChannel,
  options: MockDuplexOptions & { maxBufferedBytes?: number; maxInboundFrames?: number },
) {
  const limit = integer(options.maxBufferedBytes ?? 1_048_576, 'maxBufferedBytes', 1);
  const inbound = integer(options.maxInboundFrames ?? 64, 'maxInboundFrames', 1);
  const duplex = createMockDuplex(mock, options);
  let ended = false,
    pending = 0;
  let chain = Promise.resolve();
  const close = () => {
    if (ended) return;
    ended = true;
    duplex.close();
    channel.removeEventListener('message', message);
    channel.removeEventListener('close', close);
    channel.removeEventListener('error', close);
    channel.close();
  };
  const message = (event: any) => {
    if (ended) return;
    if (typeof event.data !== 'string' || ++pending > inbound) {
      close();
      return;
    }
    chain = chain
      .then(async () => {
        if (ended) return;
        try {
          await duplex.send(JSON.parse(event.data));
        } finally {
          pending--;
        }
      })
      .catch(close);
  };
  channel.addEventListener('message', message);
  channel.addEventListener('close', close);
  channel.addEventListener('error', close);
  void (async () => {
    try {
      for await (const frame of duplex.frames) {
        const data = JSON.stringify(frame);
        if (
          channel.readyState !== 'open' ||
          channel.bufferedAmount + new TextEncoder().encode(data).length > limit
        )
          break;
        channel.send(data);
      }
    } finally {
      close();
    }
  })().catch(close);
  return { duplex, close };
}
