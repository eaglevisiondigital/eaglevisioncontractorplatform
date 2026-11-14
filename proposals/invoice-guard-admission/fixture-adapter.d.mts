import { readFileSync } from 'node:fs';
export function createHistoricalRead(
  read?: typeof readFileSync,
  options?: { includeSql?: boolean },
): typeof readFileSync;
