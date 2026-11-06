export interface Deprecation {
  id: string;
  since: string;
  replacement?: string;
  message: string;
  removeAfter?: number;
}
export interface Usage {
  id: string;
  consumer: string;
  timestamp: number;
  count?: number;
}
export interface DeprecationOptions {
  maxDefinitions?: number;
  maxConsumers?: number;
  maxPairs?: number;
}
export interface UsageSummary {
  id: string;
  consumer: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
}
export interface DeprecationReport {
  definitions: {
    definition: Deprecation;
    status: 'deprecated' | 'removal-due';
    totalUses: number;
    consumers: number;
  }[];
  usage: UsageSummary[];
}
export interface DeprecationTracker {
  record(usage: Usage): void;
  report(now: number): DeprecationReport;
  clearUsage(): void;
}
function label(value: string, maximum = 1024): void {
  if (typeof value !== 'string' || !value || value.length > maximum)
    throw new TypeError('Expected a nonempty bounded string.');
}
function cap(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError('Capacities must be non-negative safe integers.');
  return value;
}
export function createDeprecations(
  input: Iterable<Deprecation>,
  options: DeprecationOptions = {},
): DeprecationTracker {
  const maxDefinitions = cap(options.maxDefinitions ?? 10_000),
    maxConsumers = cap(options.maxConsumers ?? 10_000),
    maxPairs = cap(options.maxPairs ?? 100_000);
  if (input == null || typeof input[Symbol.iterator] !== 'function')
    throw new TypeError('Definitions must be iterable.');
  const definitions = new Map<string, Deprecation>();
  const usage = new Map<string, UsageSummary>(),
    consumers = new Set<string>(),
    totals = new Map<string, number>();
  for (const value of input) {
    if (definitions.size === maxDefinitions) throw new RangeError('Definition capacity exceeded.');
    label(value.id);
    label(value.since, 128);
    label(value.message, 4096);
    if (definitions.has(value.id)) throw new TypeError(`Duplicate deprecation: ${value.id}`);
    const definition: Deprecation = { id: value.id, since: value.since, message: value.message };
    if (value.replacement !== undefined) {
      label(value.replacement);
      definition.replacement = value.replacement;
    }
    if (value.removeAfter !== undefined) {
      if (!Number.isFinite(value.removeAfter))
        throw new TypeError('removeAfter must be finite milliseconds.');
      definition.removeAfter = value.removeAfter;
    }
    definitions.set(value.id, definition);
  }
  return {
    record(input) {
      if (!definitions.has(input.id)) throw new TypeError(`Unknown deprecation: ${input.id}`);
      label(input.consumer);
      if (!Number.isFinite(input.timestamp)) throw new TypeError('Usage timestamp must be finite.');
      const count = input.count ?? 1;
      if (!Number.isSafeInteger(count) || count < 1)
        throw new RangeError('Usage count must be a positive safe integer.');
      const key = JSON.stringify([input.id, input.consumer]),
        prior = usage.get(key);
      if (!prior && usage.size === maxPairs) throw new RangeError('Usage pair capacity exceeded.');
      if (!consumers.has(input.consumer) && consumers.size === maxConsumers)
        throw new RangeError('Consumer capacity exceeded.');
      const total = (totals.get(input.id) ?? 0) + count;
      if (!Number.isSafeInteger(total)) throw new RangeError('Usage count precision overflow.');
      usage.set(key, {
        id: input.id,
        consumer: input.consumer,
        count: (prior?.count ?? 0) + count,
        firstSeen: Math.min(prior?.firstSeen ?? input.timestamp, input.timestamp),
        lastSeen: Math.max(prior?.lastSeen ?? input.timestamp, input.timestamp),
      });
      totals.set(input.id, total);
      consumers.add(input.consumer);
    },
    report(now) {
      if (!Number.isFinite(now)) throw new TypeError('Report time must be finite.');
      const rows = [...usage.values()].sort((a, b) =>
        a.id < b.id
          ? -1
          : a.id > b.id
            ? 1
            : a.consumer < b.consumer
              ? -1
              : a.consumer > b.consumer
                ? 1
                : 0,
      );
      const counts = new Map<string, number>();
      for (const row of rows) counts.set(row.id, (counts.get(row.id) ?? 0) + 1);
      return {
        definitions: [...definitions.values()]
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
          .map((value) => ({
            definition: { ...value },
            status:
              value.removeAfter !== undefined && now >= value.removeAfter
                ? 'removal-due'
                : 'deprecated',
            totalUses: totals.get(value.id) ?? 0,
            consumers: counts.get(value.id) ?? 0,
          })),
        usage: rows.map((row) => ({ ...row })),
      };
    },
    clearUsage() {
      usage.clear();
      consumers.clear();
      totals.clear();
    },
  };
}
