/** Test-only stdio decoder. Reject ambiguous wire evidence before JSON normalization. */
export function parseCommandJSON(bytes: Uint8Array): unknown {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  let at = 0;
  const space = () => {
    while (/[\x20\t\r\n]/.test(text[at] ?? '') && at < text.length) at++;
  };
  const string = () => {
    const begin = at++;
    while (at < text.length) {
      if (text[at] === '\\') {
        at += 2;
        continue;
      }
      if (text[at++] === '"')
        return JSON.parse(text.slice(begin, at)) as string;
    }
    throw Error('Truncated command string.');
  };
  const value = (depth: number): void => {
    if (depth > 64) throw Error('Bounded command nesting required.');
    space();
    const token = text[at];
    if (token === '"') {
      string();
      return;
    }
    if (token === '{' || token === '[') {
      at++;
      space();
      const end = token === '{' ? '}' : ']';
      const keys = new Set<string>();
      if (text[at] === end) {
        at++;
        return;
      }
      for (;;) {
        space();
        if (token === '{') {
          if (text[at] !== '"') throw Error('Command key required.');
          const key = string();
          if (keys.has(key)) throw Error('Duplicate command member.');
          keys.add(key);
          space();
          if (text[at++] !== ':') throw Error('Command separator required.');
        }
        value(depth + 1);
        space();
        if (text[at] === end) {
          at++;
          return;
        }
        if (text[at++] !== ',') throw Error('Command separator required.');
      }
    }
    const literal =
      /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
        text.slice(at),
      );
    if (!literal) throw Error('Command JSON required.');
    at += literal[0].length;
  };
  value(0);
  space();
  if (at !== text.length) throw Error('Trailing command evidence.');
  return JSON.parse(text);
}
