# @lp-labs/deprecation-tracker

Bounded process-local usage accounting for deprecated APIs, migration notices and removal
deadlines. Independently authored with zero runtime or peer dependencies.
Instrumentation is explicit: nothing intercepts calls or sends telemetry automatically.

## Install

```bash
npm install @lp-labs/deprecation-tracker
```

ES2022 ESM/CommonJS and TypeScript declarations.
CommonJS: `const { createDeprecations } = require('@lp-labs/deprecation-tracker')`.

## Quickstart

```js
import { createDeprecations } from '@lp-labs/deprecation-tracker';

const tracker = createDeprecations([
  {
    id: 'legacy-search',
    since: '2.0',
    message: 'Use searchV2 instead',
    replacement: 'searchV2',
    removeAfter: 2000,
  },
]);
tracker.record({ id: 'legacy-search', consumer: 'admin-ui', timestamp: 1000 });
tracker.record({ id: 'legacy-search', consumer: 'admin-ui', timestamp: 1500, count: 2 });
const report = tracker.report(2000);
if (report.definitions[0].status !== 'removal-due' || report.usage[0].count !== 3) {
  throw new Error('Incorrect deprecation accounting');
}
```

Use the same numeric millisecond time base for usage timestamps, removal deadlines and reports.
For real dates, use epoch milliseconds explicitly; tests may use deterministic relative times.

## Definitions and options

`createDeprecations(definitions: Iterable<Deprecation>, options?: DeprecationOptions): DeprecationTracker`

Each definition:

- `id`: unique nonempty string, maximum 1024 UTF-16 units.
- `since`: nonempty metadata string up to 128 units. **Opaque text**, not a SemVer comparator.
- `message`: nonempty string up to 4096 units.
- `replacement?`: nonempty string up to 1024 units.
- `removeAfter?`: finite numeric milliseconds; inclusive removal-due threshold.

Definitions are copied. Options are non-negative safe integer capacities:
`maxDefinitions = 10000`, `maxConsumers = 10000`, `maxPairs = 100000`.

## Usage and reports

`tracker.record(usage: Usage): void`

Usage is `{ id, consumer, timestamp, count? }`:

- `id` must name a registered definition.
- `consumer` is a nonempty string up to 1024 units.
- `timestamp` must be finite.
- `count = 1` is a positive safe integer.

For each definition-consumer pair, aggregate count, minimum `firstSeen` and maximum `lastSeen`.
Out-of-order timestamps are allowed. Counts and per-definition totals must remain safe integers;
overflow/capacity errors reject the observation without partially changing state.
Composite pair encoding avoids collisions from punctuation in IDs.

`tracker.report(now: number): DeprecationReport`

- `definitions`: lexically sorted rows
  `{ definition, status, totalUses, consumers }`, including unused definitions.
- `status`: `'removal-due'` when `now >= removeAfter`, otherwise `'deprecated'`.
- `consumers`: distinct consumer count **for that definition**.
- `usage`: sorted by ID then consumer, with `{ id, consumer, count, firstSeen, lastSeen }`.
- All report records are independent copies; changing one cannot mutate tracker state.

`tracker.clearUsage(): void` clears aggregates and consumer/pair capacity usage, retaining definitions.
Export/persist a report first if you need historical data.

## Customization and migration gates

Wrap deprecated application APIs and record their callers. Prefer low-cardinality application/team
identifiers, not email addresses or request IDs. Reports contain identifiers verbatim; protect them.
The tracker neither verifies identity nor authenticates telemetry.

```js
import { createDeprecations } from '@lp-labs/deprecation-tracker';

const tracker = createDeprecations([
  { id: 'old-format', since: 'v1', message: 'Switch to structured records', removeAfter: 100 },
]);
tracker.record({ id: 'old-format', consumer: 'migration-test', timestamp: 50 });
const blockers = tracker
  .report(100)
  .definitions.filter((row) => row.status === 'removal-due' && row.totalUses > 0);
if (blockers.length !== 1) throw new Error('Expected migration blocker');
tracker.clearUsage();
if (tracker.report(100).usage.length !== 0) throw new Error('Usage was not cleared');
```

Choose your own warning, CI or removal policy from reports. A removal-due status does not
automatically block calls or delete code. Reports reflect cumulative observations since creation
or the last clear, not a sliding recent-usage window.

## Errors, performance and limits

Unknown IDs, duplicate definitions, invalid labels/timestamps throw `TypeError`; invalid
capacities/counts and precision/capacity overflow throw `RangeError`. No telemetry is silently
dropped. Average recording is O(1) plus bounded composite-key construction. Reports cost
O(D log D + P log P), with O(D + P) additional storage; active state is O(D + C + P).

No AST scanning, automatic call-site discovery, version-range enforcement, durable storage,
distributed aggregation, browser transport, sampling, pruning or time-window analytics is included.
Zero observed use is not proof an API is safe to remove.

Exported types: `Deprecation`, `Usage`, `DeprecationOptions`, `UsageSummary`,
`DeprecationReport`, `DeprecationTracker`.

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
