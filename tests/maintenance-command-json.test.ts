import { expect, it } from 'vitest';
import { parseCommandJSON } from './helpers/strict-command-json';
const parse = (s: string) => parseCommandJSON(Buffer.from(s));
it.each([
  '{"operation":"issue","operation":"execute"}',
  '{"command":{"id":1,"\\u0069d":2}}',
  '{"a":[{"x":1,"x":2}]}',
  '{"x":1,}',
  '[1,]',
  '{"a":',
  'null true',
  '{"x":01}',
  '{"x":NaN}',
  '{"x":"unterminated}',
  '{"x":"\\uZZZZ"}',
  '['.repeat(66) + '0' + ']'.repeat(66),
])('rejects malformed, duplicate or unbounded JSON evidence: %s', (s) =>
  expect(() => parse(s)).toThrow(),
);
it('rejects invalid UTF8 instead of normalizing wire evidence', () =>
  expect(() =>
    parseCommandJSON(Buffer.from([123, 34, 120, 34, 58, 34, 255, 34, 125])),
  ).toThrow());
it.each([
  '{"a":[1,true,null,"x"],"b":{"c":-1.2e3}}',
  '{"x":"\\"/\\u0061","y":"é"}',
  ' [ ] \r\n',
  '{"__proto__":{"a":1},"constructor":"literal"}',
])('preserves valid exact JSON: %s', (s) =>
  expect(parse(s)).toEqual(JSON.parse(s)),
);
