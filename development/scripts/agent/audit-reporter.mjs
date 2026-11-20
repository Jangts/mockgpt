import { inspect } from 'node:util';

/** Keep test output concise; c8 writes the machine-readable coverage separately. */
export default async function* report(events) {
  for await (const { type, data } of events) {
    if (type === 'test:fail') yield `FAIL ${data.name}\n${inspect(data.details?.error, { depth: 5 })}\n`;
    if (type === 'test:summary' && data.file === undefined) yield `Tests: ${data.counts.tests}, passed: ${data.counts.passed}, failed: ${data.counts.failed}, skipped: ${data.counts.skipped}\n`;
    if (type === 'test:stderr') yield data.message;
  }
}
