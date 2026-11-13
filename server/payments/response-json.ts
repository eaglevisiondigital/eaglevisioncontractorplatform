/** Strict wire decoding, adapted from the existing test-only command decoder.
 * No response normalization or provider-state authority is added here. */
export function decodePaymentResponse(
  bytes: Uint8Array,
): Record<string, unknown> {
  if (
    !(bytes instanceof Uint8Array) ||
    !bytes.byteLength ||
    bytes.byteLength > 65536
  )
    throw Error('Bounded payment response required');
  // The decoder also preserves the existing single leading UTF8 BOM tolerance.
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
    throw Error('Truncated payment response string');
  };
  const value = (depth: number): void => {
    if (depth > 64) throw Error('Bounded payment response nesting required');
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
          if (text[at] !== '"') throw Error('Payment response key required');
          const key = string();
          if (keys.has(key)) throw Error('Duplicate payment response member');
          keys.add(key);
          space();
          if (text[at++] !== ':')
            throw Error('Payment response separator required');
        }
        value(depth + 1);
        space();
        if (text[at] === end) {
          at++;
          return;
        }
        if (text[at++] !== ',')
          throw Error('Payment response separator required');
      }
    }
    const literal =
      /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
        text.slice(at),
      );
    if (!literal) throw Error('Payment response JSON required');
    at += literal[0].length;
  };
  value(0);
  space();
  if (at !== text.length) throw Error('Trailing payment response evidence');
  const decoded: unknown = JSON.parse(text);
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded))
    throw Error('Payment response object required');
  return decoded as Record<string, unknown>;
}
