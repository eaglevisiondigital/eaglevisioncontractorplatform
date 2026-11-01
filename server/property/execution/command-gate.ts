/** Serializes asynchronous credential handoffs with shutdown. No network or authority. */
export class P1CommandGate {
  private stopped = false;
  private pending?: Promise<void>;
  assertOpen() {
    if (this.stopped) throw Error('Controller shutdown has begun');
  }
  enter(): () => void {
    this.assertOpen();
    if (this.pending) throw Error('Controller command already running');
    let finish!: () => void;
    this.pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      this.pending = undefined;
      finish();
    };
  }
  /** Mark stopped synchronously; wait for late verified sessions to enter cleanup custody. */
  async stop() {
    this.stopped = true;
    await this.pending;
  }
}
