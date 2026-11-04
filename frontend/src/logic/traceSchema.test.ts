import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';

/**
 * Trace v1 contract tests (Section 14 task 3 / Phase 6 B4).
 *
 * Every file in frontend/public/traces/*.json plus the offline timeout
 * fixture (tests/fixtures/timeout-trace.json, lives outside frontend/)
 * must validate *fully* against the frozen trace-v1 schema
 * (docs/contracts/trace-v1.schema.json) via ajv. ajv is a dev-only
 * dependency and is never imported by app code.
 *
 * The schema and the timeout fixture live outside frontend/, while this
 * test runs with cwd=frontend/. They are read via repo-root-relative
 * paths which tsx resolves correctly.
 */

const REPO_ROOT = path.join(process.cwd(), '..');
const SCHEMA_PATH = path.join(REPO_ROOT, 'docs', 'contracts', 'trace-v1.schema.json');
const TRACES_DIR = path.join(process.cwd(), 'public', 'traces');
const TIMEOUT_FIXTURE = path.join(REPO_ROOT, 'tests', 'fixtures', 'timeout-trace.json');

const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf-8'));

// strict:false keeps unknown-format keywords from failing compilation; the
// schema uses no "format" keywords, so validation covers every required
// field, type, and enum.
const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

const traceFiles = fs.existsSync(TRACES_DIR)
  ? fs.readdirSync(TRACES_DIR).filter((f) => f.endsWith('.json')).sort()
  : [];

function errorsOf(file: string, content: unknown): string {
  validate(content);
  return (ajv.errors ?? [])
    .map((e) => `${e.instancePath || '(root)'} ${e.message}`)
    .join('; ');
}

test('trace schema contract: every bundled trace validates fully against trace-v1.schema.json', () => {
  assert.ok(traceFiles.length > 0, 'No trace files found in public/traces/');

  for (const file of traceFiles) {
    const content = JSON.parse(fs.readFileSync(path.join(TRACES_DIR, file), 'utf-8'));
    assert.equal(
      validate(content),
      true,
      `${file}: schema violation(s): ${errorsOf(file, content)}`
    );
  }
});

test('trace schema contract: timeout fixture validates fully against trace-v1.schema.json', () => {
  assert.ok(fs.existsSync(TIMEOUT_FIXTURE), `Missing timeout fixture ${TIMEOUT_FIXTURE}`);
  const content = JSON.parse(fs.readFileSync(TIMEOUT_FIXTURE, 'utf-8'));
  assert.equal(
    validate(content),
    true,
    `timeout-trace.json: schema violation(s): ${errorsOf('timeout-trace.json', content)}`
  );
  assert.equal(content.result.status, 'timeout', 'timeout fixture must report timeout');
});
