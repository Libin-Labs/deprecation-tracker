import { createDeprecations } from '@lp-labs/deprecation-tracker';
const count: number = createDeprecations([]).report(0).usage.length;
void count;
