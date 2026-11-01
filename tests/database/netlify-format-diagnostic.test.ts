import { readFileSync } from 'node:fs';
import { format } from 'prettier';
import { it } from 'vitest';

it('prints canonical formatted test for review', async () => {
  const value = readFileSync('tests/netlify-read-only-evidence.test.ts', 'utf8');
  const result = await format(value, {
    parser: 'typescript',
    singleQuote: true,
    trailingComma: 'all',
  });
  console.log('BEGIN_NETLIFY_FORMAT');
  console.log(result);
  console.log('END_NETLIFY_FORMAT');
});
