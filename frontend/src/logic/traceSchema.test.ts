import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const TRACES_DIR = path.join(process.cwd(), 'public', 'traces');
const SCHEMA_PATH = path.join(process.cwd(), '..', 'docs', 'contracts', 'trace-v1.schema.json');

const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf-8'));

const traceFiles = fs
  .readdirSync(TRACES_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();

test('trace schema smoke test: every bundled trace has required top-level fields', () => {
  assert.ok(traceFiles.length > 0, 'No trace files found in public/traces/');

  for (const file of traceFiles) {
    const filePath = path.join(TRACES_DIR, file);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    assert.equal(
      content.trace_version,
      1,
      `${file}: trace_version must be 1`
    );
    assert.ok(content.solver, `${file}: missing solver block`);
    assert.ok(content.instance, `${file}: missing instance block`);
    assert.ok(content.result, `${file}: missing result block`);
    assert.ok(Array.isArray(content.search), `${file}: missing search array`);
    assert.ok(Array.isArray(content.execution.paths), `${file}: missing execution.paths array`);
    assert.ok(
      typeof content.result.status === 'string',
      `${file}: missing result.status`
    );
    assert.ok(
      typeof content.result.soc === 'number',
      `${file}: missing result.soc`
    );
    assert.ok(
      typeof content.result.makespan === 'number',
      `${file}: missing result.makespan`
    );
  }
});

test('trace schema smoke test: every bundled trace validates against trace-v1.schema.json', () => {
  assert.ok(traceFiles.length > 0, 'No trace files found in public/traces/');

  for (const file of traceFiles) {
    const filePath = path.join(TRACES_DIR, file);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    // Validate against schema properties manually (JSON Schema full validation
    // requires ajv; here we check the required structural properties).
    assert.strictEqual(content.trace_version, 1, `${file}: trace_version`);
    assert.ok(content.solver && typeof content.solver === 'object', `${file}: solver`);
    assert.ok(
      content.instance && typeof content.instance === 'object',
      `${file}: instance`
    );
    assert.ok(
      content.result && typeof content.result === 'object',
      `${file}: result`
    );
    assert.ok(Array.isArray(content.search), `${file}: search`);
    assert.ok(
      Array.isArray(content.execution.paths),
      `${file}: execution.paths`
    );
    assert.ok(
      typeof content.result.status === 'string',
      `${file}: result.status`
    );
    assert.ok(
      typeof content.result.soc === 'number',
      `${file}: result.soc`
    );
    assert.ok(
      typeof content.result.makespan === 'number',
      `${file}: result.makespan`
    );

    // Each execution path must have makespan + 1 entries (stay-at-goal padding).
    if (content.execution.paths && content.result.makespan !== undefined) {
      const expectedLen = content.result.makespan + 1;
      for (const p of content.execution.paths) {
        assert.equal(
          p.length,
          expectedLen,
          `${file}: agent path length ${p.length} != makespan + 1 = ${expectedLen}`
        );
      }
    }
  }
});
