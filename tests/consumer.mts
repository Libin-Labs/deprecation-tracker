import { createDeprecations, type DeprecationReport } from '@lp-labs/deprecation-tracker';
const tracker = createDeprecations([{ id: 'old', since: '1', message: 'replace' }]);
tracker.record({ id: 'old', consumer: 'app', timestamp: 0 });
const report: DeprecationReport = tracker.report(100);
// @ts-expect-error usage timestamps must be explicit numbers.
tracker.record({ id: 'old', consumer: 'app', timestamp: 'now' });
void report;
