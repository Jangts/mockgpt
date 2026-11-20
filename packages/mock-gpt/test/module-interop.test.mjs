/**
 * Cross-module-system interoperability (ESM import plus CJS require).
 *
 * Both directions are exercised because `ResponseDescription` and `MockGPTError` are recognized by
 * a global symbol brand rather than by class identity, and a package can be loaded through either
 * build in the same process. Runs against the built output in `dist/`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as esm from '../dist/esm/index.js';
import { errorResponse as esmErrorResponse } from '../dist/esm/shared/utils.js';
const require = createRequire(import.meta.url);
const cjs = require('../dist/cjs/index.js');
const { errorResponse: cjsErrorResponse } = require('../dist/cjs/shared/utils.js');
const input = { model: 'demo', messages: [{ role: 'user', content: 'hello' }] };

for (const [name, runtime, helpers, encodeError] of [
  ['CJS + ESM', cjs, esm, cjsErrorResponse],
  ['ESM + CJS', esm, cjs, esmErrorResponse],
]) {
  test(`${name}: response descriptions survive literal, function and sequence boundaries`, async () => {
    const descriptions = [
      helpers.responses.text('hello'),
      helpers.responses.toolCalls([{ name: 'weather', arguments: { city: '武汉' } }]),
      helpers.responses.httpError(429),
      helpers.responses.reject('offline'),
    ];
    for (const description of descriptions) {
      assert.ok(description instanceof runtime.ResponseDescription);
      const literal = new runtime.MockGPT({ rules: [{ generator: description }] });
      const result = await literal.generate(input);
      assert.ok(result instanceof helpers.ResponseDescription);
      assert.notEqual(result, description);
      assert.equal(result.kind, description.kind);
    }
    const mock = new runtime.MockGPT({
      rules: [{ generator: helpers.generators.sequence(descriptions) }],
    });
    for (const description of descriptions)
      assert.equal((await mock.generate(input)).kind, description.kind);
    const ordinary = { kind: 'model', value: { content: 'plain JSON' } };
    assert.equal(ordinary instanceof runtime.ResponseDescription, false);
    assert.deepEqual(
      await new runtime.MockGPT({ rules: [{ generator: ordinary }] }).generate(input),
      ordinary,
    );
    class SpecificResponse extends runtime.ResponseDescription {}
    assert.equal(descriptions[0] instanceof SpecificResponse, false);
    assert.ok(new SpecificResponse('model', { content: 'hello' }) instanceof SpecificResponse);
  });
  test(`${name}: errors retain their code, status and details`, async () => {
    const error = new helpers.MockGPTError('MOCK_WEB_HTTP', 'upstream failure', 502, {
      upstreamStatus: 403,
    });
    assert.ok(error instanceof runtime.MockGPTError);
    const mock = new runtime.MockGPT({
      rules: [
        {
          generator: () => {
            throw error;
          },
        },
      ],
    });
    await assert.rejects(mock.generate(input), (thrown) => thrown === error);
    assert.equal(mock.records[0].errorCode, 'MOCK_WEB_HTTP');
    const response = encodeError(error);
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error.details.upstreamStatus, 403);
    assert.equal(new Error('ordinary') instanceof runtime.MockGPTError, false);
    class SpecificError extends runtime.MockGPTError {}
    assert.equal(error instanceof SpecificError, false);
    assert.ok(new SpecificError('SPECIFIC', 'failure') instanceof SpecificError);
  });
}
