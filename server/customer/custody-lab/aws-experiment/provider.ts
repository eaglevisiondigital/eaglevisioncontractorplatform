/** Pure bounded normalization for a separately approved SDK shim. No client or credential loader. */
export function observedAbsence(operation: string, error: unknown) {
  const e = error as {
    name?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  const status = e?.$metadata?.httpStatusCode;
  if (
    operation === 'DescribeTable' &&
    e.name === 'ResourceNotFoundException' &&
    status === 400
  )
    return { ErrorCode: e.name, HttpStatus: 400 };
  if (
    operation === 'ListObjectVersions' &&
    e.name === 'NoSuchBucket' &&
    status === 404
  )
    return { ErrorCode: e.name, HttpStatus: 404 };
  // HeadBucket's generic 404/403 is never proof of deletion or ownership.
  throw Error('Provider absence UNKNOWN');
}
export async function boundedUtf8Body(
  body: AsyncIterable<Uint8Array> & { destroy?: () => void },
  maxBytes: number,
) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > 65536)
    throw Error('Body limit');
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    for await (const chunk of body) {
      if (!(chunk instanceof Uint8Array)) throw Error('Byte stream required');
      bytes += chunk.byteLength;
      if (bytes > maxBytes) throw Error('Body limit');
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks),
      text = buffer.toString('utf8');
    if (!Buffer.from(text).equals(buffer)) throw Error('UTF8 required');
    return text;
  } catch {
    body.destroy?.();
    throw Error('Evidence body UNKNOWN/over limit');
  }
}
