import { createHash } from 'node:crypto';

export function sha256Hex(data: Buffer | Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export async function sha256HexStream(
  stream: AsyncIterable<Uint8Array | Buffer>,
): Promise<{ hash: string; byteSize: number }> {
  const hash = createHash('sha256');
  let byteSize = 0;
  for await (const chunk of stream) {
    hash.update(chunk);
    byteSize += chunk.byteLength;
  }
  return { hash: hash.digest('hex'), byteSize };
}
