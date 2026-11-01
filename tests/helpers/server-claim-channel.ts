import { Socket } from 'node:net';
import { createInterface } from 'node:readline';
import { parseCommandJSON } from './strict-command-json';
import { validateClaimRequest } from '../../server/property/command-authority';
/** Private inherited duplex pipe to the trusted TEST issuer; no listening socket. */
export class ServerClaimChannel {
  private readonly pipe: Socket;
  private pending: { resolve: () => void; reject: (e: Error) => void } | null =
    null;
  constructor() {
    this.pipe = new Socket({ fd: 3, readable: true, writable: true });
    createInterface({ input: this.pipe }).on('line', (line) => {
      const p = this.pending;
      this.pending = null;
      if (!p) return;
      try {
        if (Buffer.byteLength(line) > 1024) throw Error();
        const v = parseCommandJSON(Buffer.from(line)) as { status: string };
        if (v.status !== 'issued') throw Error();
        p.resolve();
      } catch {
        p.reject(Error('Trusted claim issuance unavailable.'));
      }
    });
    this.pipe.on('error', () => {
      this.pending?.reject(Error('Private issuer unavailable.'));
      this.pending = null;
    });
    this.pipe.on('close', () => {
      this.pending?.reject(Error('Private issuer closed.'));
      this.pending = null;
    });
  }
  request(value: unknown) {
    validateClaimRequest(value);
    if (this.pending)
      return Promise.reject(Error('One claim request at a time.'));
    const text = JSON.stringify(value);
    if (Buffer.byteLength(text) > 2097152)
      return Promise.reject(Error('Bounded claim request required.'));
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        reject(Error('Trusted claim deadline exceeded.'));
      }, 5000);
      this.pending = {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      };
      this.pipe.write(text + '\n');
    });
  }
  close() {
    this.pipe.destroy();
  }
}
