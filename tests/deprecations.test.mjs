import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createDeprecations } from '../dist/esm/index.js';
const definition = (id = 'old') => ({
  id,
  since: '1.0',
  message: 'Use new API',
  replacement: 'new',
  removeAfter: 100,
});
test('usage aggregates counts and first/last timestamps per consumer and definition', () => {
  const tracker = createDeprecations([definition()]);
  tracker.record({ id: 'old', consumer: 'app', timestamp: 20 });
  tracker.record({ id: 'old', consumer: 'app', timestamp: 10, count: 3 });
  tracker.record({ id: 'old', consumer: 'other', timestamp: 30, count: 2 });
  const report = tracker.report(99);
  assert.equal(report.definitions[0].totalUses, 6);
  assert.equal(report.definitions[0].consumers, 2);
  assert.deepEqual(report.usage[0], {
    id: 'old',
    consumer: 'app',
    count: 4,
    firstSeen: 10,
    lastSeen: 20,
  });
  assert.equal(report.definitions[0].status, 'deprecated');
});
test('removal due is inclusive and definitions without deadlines remain deprecated', () => {
  const tracker = createDeprecations([
    definition(),
    { id: 'later', since: '2', message: 'replace' },
  ]);
  assert.equal(
    tracker.report(100).definitions.find((row) => row.definition.id === 'old').status,
    'removal-due',
  );
  assert.equal(
    tracker.report(99999).definitions.find((row) => row.definition.id === 'later').status,
    'deprecated',
  );
});
test('unused definitions remain visible and clearUsage preserves definitions', () => {
  const tracker = createDeprecations([definition()]);
  assert.equal(tracker.report(0).definitions[0].totalUses, 0);
  tracker.record({ id: 'old', consumer: 'app', timestamp: 0 });
  tracker.clearUsage();
  assert.equal(tracker.report(0).definitions.length, 1);
  assert.deepEqual(tracker.report(0).usage, []);
});
test('pair identities use collision-safe encodings and reports are sorted', () => {
  const tracker = createDeprecations([definition('a,b'), definition('a')]);
  tracker.record({ id: 'a,b', consumer: 'c', timestamp: 0 });
  tracker.record({ id: 'a', consumer: 'b,c', timestamp: 0 });
  assert.equal(tracker.report(0).usage.length, 2);
  assert.deepEqual(
    tracker.report(0).definitions.map((row) => row.definition.id),
    ['a', 'a,b'],
  );
});
test('consumer/pair capacities reject without partial count changes', () => {
  const tracker = createDeprecations([definition(), definition('other')], {
    maxConsumers: 1,
    maxPairs: 1,
  });
  tracker.record({ id: 'old', consumer: 'a', timestamp: 0 });
  assert.throws(() => tracker.record({ id: 'old', consumer: 'b', timestamp: 0 }), RangeError);
  assert.throws(() => tracker.record({ id: 'other', consumer: 'a', timestamp: 0 }), RangeError);
  assert.equal(
    tracker.report(0).definitions.find((row) => row.definition.id === 'old').totalUses,
    1,
  );
});
test('count precision overflow is atomic', () => {
  const tracker = createDeprecations([definition()]);
  tracker.record({ id: 'old', consumer: 'a', timestamp: 0, count: Number.MAX_SAFE_INTEGER });
  assert.throws(() => tracker.record({ id: 'old', consumer: 'a', timestamp: 1 }), RangeError);
  assert.equal(tracker.report(0).usage[0].lastSeen, 0);
  assert.equal(tracker.report(0).usage[0].count, Number.MAX_SAFE_INTEGER);
});
test('definitions, usage inputs and report objects are independent', () => {
  const input = definition(),
    tracker = createDeprecations([input]);
  input.message = 'changed';
  const usage = { id: 'old', consumer: 'a', timestamp: 10 };
  tracker.record(usage);
  usage.consumer = 'changed';
  const report = tracker.report(0);
  report.definitions[0].definition.message = 'mutated';
  report.usage[0].count = 999;
  assert.equal(tracker.report(0).definitions[0].definition.message, 'Use new API');
  assert.equal(tracker.report(0).usage[0].count, 1);
});
test('invalid definitions, usage and report times fail explicitly', () => {
  assert.throws(() => createDeprecations([definition(), definition()]), TypeError);
  assert.throws(() => createDeprecations([definition()], { maxDefinitions: 0 }), RangeError);
  const tracker = createDeprecations([definition()]);
  assert.throws(() => tracker.record({ id: 'missing', consumer: 'a', timestamp: 0 }), TypeError);
  for (const count of [0, -1, 1.5, Infinity, NaN])
    assert.throws(
      () => tracker.record({ id: 'old', consumer: 'a', timestamp: 0, count }),
      RangeError,
    );
  assert.throws(() => tracker.report(NaN), TypeError);
  assert.deepEqual(tracker.report(0).usage, []);
});
test('generated observations account exactly for all recorded calls', () => {
  const tracker = createDeprecations([definition()]);
  for (let i = 0; i < 1000; i++)
    tracker.record({ id: 'old', consumer: `app-${i % 7}`, timestamp: i, count: 2 });
  const report = tracker.report(0);
  assert.equal(report.definitions[0].totalUses, 2000);
  assert.equal(report.definitions[0].consumers, 7);
  assert.equal(
    report.usage.reduce((sum, row) => sum + row.count, 0),
    2000,
  );
});
test('CommonJS tracks explicit consumer usage', () => {
  const api = createRequire(import.meta.url)('../dist/cjs/index.js'),
    tracker = api.createDeprecations([definition()]);
  assert.equal(tracker.report(100).definitions[0].status, 'removal-due');
});
