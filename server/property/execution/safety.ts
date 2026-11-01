export interface CleanupObservation {
  approvedActiveFeatures: number;
  unexpectedActiveFeatures: number;
  sessions: number;
  customerMappings: number;
  reportLeases: number;
  activePlatformGrants: number;
  releaseGrants: number;
  providerWorkloads: number;
}
export interface CleanupPorts {
  deactivate(): Promise<void>;
  signOutAll(): Promise<void>;
  observe(): Promise<CleanupObservation>;
}
export type CleanupResult = {
  status: 'VERIFIED' | 'CONTAINMENT_REQUIRED';
  deactivation: 'CONFIRMED' | 'UNKNOWN';
  sessions: 'CONFIRMED' | 'UNKNOWN';
  observation: CleanupObservation | null;
};
/** Own process owns this clock/ports. No automatic retry, even after transport failure. */
export class P1Safety {
  private started = false;
  private ended = false;
  private wallDeadline = 0;
  private monotonicDeadline = 0;
  private operatorUntil = 0;
  private pulseUntil = 0;
  private result?: Promise<CleanupResult>;
  private activation?: Promise<void>;
  private activationConfirmed = true;
  constructor(
    private ports: CleanupPorts,
    private wall = Date.now,
    private mono = () => performance.now(),
  ) {}
  arm() {
    if (this.started || this.ended) throw Error('Safety window cannot reopen');
    this.started = true;
    // Begin cleanup60 seconds early; leave time for bounded network/SQL operations.
    this.wallDeadline = this.wall() + 1740000;
    this.monotonicDeadline = this.mono() + 1740000;
    this.operatorUntil = this.mono() + 60000;
    this.pulseUntil = this.mono() + 5000;
  }
  async activate(run: () => Promise<void>) {
    this.arm();
    this.activationConfirmed = false;
    this.activation = run();
    await this.activation;
    this.activationConfirmed = true;
    this.check();
  }
  heartbeat() {
    this.check();
    this.pulseUntil = this.mono() + 5000;
  }
  supervise() {
    this.check();
    this.operatorUntil = this.mono() + 60000;
  }
  check() {
    if (
      !this.started ||
      this.ended ||
      this.wall() >= this.wallDeadline ||
      this.mono() >= this.monotonicDeadline ||
      this.mono() >= this.operatorUntil ||
      this.mono() >= this.pulseUntil
    )
      throw Error('Safety window closed');
  }
  async tick() {
    try {
      this.check();
    } catch {
      if (this.started) return this.close();
    }
  }
  close(): Promise<CleanupResult> {
    this.ended = true;
    this.result ??= (async () => {
      try {
        await this.activation;
      } catch {
        /* UNKNOWN activation still requires exact containment. */
      }
      let deactivation: CleanupResult['deactivation'] = 'UNKNOWN',
        sessions: CleanupResult['sessions'] = 'UNKNOWN';
      // Session cleanup must run even if feature deactivation is blocked or uncertain.
      const r = await Promise.allSettled([
        this.ports.deactivate(),
        this.ports.signOutAll(),
      ]);
      if (r[0].status === 'fulfilled') deactivation = 'CONFIRMED';
      if (r[1].status === 'fulfilled') sessions = 'CONFIRMED';
      let observation: CleanupObservation | null = null;
      try {
        observation = await this.ports.observe();
      } catch {
        /* No fabricated clean result. */
      }
      const expected = [
        'approvedActiveFeatures',
        'unexpectedActiveFeatures',
        'sessions',
        'customerMappings',
        'reportLeases',
        'activePlatformGrants',
        'releaseGrants',
        'providerWorkloads',
      ];
      const clean =
        observation &&
        Object.keys(observation).length === expected.length &&
        expected.every((k) => observation[k as keyof CleanupObservation] === 0);
      return {
        status:
          clean &&
          this.activationConfirmed &&
          deactivation === 'CONFIRMED' &&
          sessions === 'CONFIRMED'
            ? 'VERIFIED'
            : 'CONTAINMENT_REQUIRED',
        deactivation,
        sessions,
        observation,
      };
    })();
    return this.result;
  }
}
