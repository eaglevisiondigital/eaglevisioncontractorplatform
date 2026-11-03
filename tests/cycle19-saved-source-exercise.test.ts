import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import {
  readSavedSourceExercise,
  inspectSavedSourceExercise,
  executeSavedSourceExercise,
  savedSourceExercises,
  type SavedSourceExercise,
} from '../src/lib/workflows/saved-revision-exercise';
beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    all = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = all.entries[0],
    sources = { ...all, entries: [entry] },
    job = entry.target.job_id!;
  return { gate, all, entry, sources, job };
}
async function opened(brand = 0) {
  const f = await fixture(brand);
  return {
    ...f,
    view: await readSavedSourceExercise(f.sources, f.job, f.gate),
  };
}
async function fresh(f: Awaited<ReturnType<typeof fixture>>) {
  return readSavedSourceExercise({ ...f.sources }, f.job, f.gate);
}
for (const kind of savedSourceExercises)
  it.each([0, 1, 2])(
    'brand %i actual ' +
      kind +
      ' exercise saves only its bounded canonical records',
    async (brand) => {
      const f = await opened(brand);
      if (kind === 'time-correction') {
        await executeSavedSourceExercise(f.view, 'time-record', true);
        f.view = await fresh(f);
      }
      const property = f.sources.property.read(f.sources.company.id),
        source = f.sources.estimates.readSyntheticPrototypeSources(
          f.entry.target,
        ),
        originals = JSON.stringify(property.reports),
        other = await f.sources.estimates.jobs(f.sources.company.id),
        release = f.entry.release.read('staff'),
        commands = vi.spyOn(f.entry.release, 'command'),
        ledger = vi.spyOn(f.sources.estimates, 'approveJob');
      const result = await executeSavedSourceExercise(f.view, kind, true);
      expect(result).toEqual({
        status: 'SYNTHETIC_SOURCE_SAVED',
        kind,
        job_id: f.job,
        operational_ready: false,
      });
      expect(inspectSavedSourceExercise(f.view).done).toContain(kind);
      expect(inspectSavedSourceExercise(f.view).replay).toBe('FORBIDDEN');
      const now = f.sources.property.read(f.sources.company.id),
        canonical = f.sources.estimates.readSyntheticPrototypeSources(
          f.entry.target,
        );
      if (kind === 'visit-draft')
        expect(
          now.visits.find((v) => v.id === f.entry.scheduled_visit_id)!.revision,
        ).toBe(
          property.visits.find((v) => v.id === f.entry.scheduled_visit_id)!
            .revision + 1,
        );
      if (kind === 'plan-revision')
        expect(now.plans.find((p) => p.id === f.entry.plan_id)!.revision).toBe(
          property.plans.find((p) => p.id === f.entry.plan_id)!.revision + 1,
        );
      if (kind === 'report-revision') {
        const next = now.reports.at(-1)!;
        expect(next.visit_id).toBe(f.entry.visit_id);
        expect(next.version).toBe(2);
        expect(next.id).not.toBe(f.entry.report_id);
        expect(JSON.stringify(now.reports.slice(0, -1))).toBe(originals);
      } else expect(JSON.stringify(now.reports)).toBe(originals);
      if (kind === 'time-record' || kind === 'time-correction') {
        const time = canonical.workforce.entries.at(-1)!;
        expect(time.submitted).toBe(true);
        expect(time.worker_id).toBe(f.entry.worker_id);
        expect(
          canonical.workforce.reviews.filter((r) => r.entry_id === time.id),
        ).toEqual([
          {
            entry_id: time.id,
            decision: 'approved',
            reason:
              'Explicit disposable synthetic review; unposted labor, no payroll or payment execution.',
          },
        ]);
        if (kind === 'time-correction')
          expect(time.corrects_id).toBe(source.workforce.entries.at(-1)!.id);
        expect(canonical.job).toEqual(source.job);
      }
      if (kind === 'material-review') {
        const expense = canonical.job!.expenses.at(-1)!,
          review = canonical.job!.events.at(-1)!;
        expect(expense.kind).toBe('commitment');
        expect(expense.amount_minor).toBe(2500);
        expect(review.submission_id).toBe(expense.id);
        expect(review.decision).toBe('approved');
        expect(canonical.job!.lock_revision).toBe(
          source.job!.lock_revision + 1,
        );
      }
      expect(
        (await f.sources.estimates.jobs(f.sources.company.id)).filter(
          (j) => j.id !== f.job,
        ),
      ).toEqual(other.filter((j) => j.id !== f.job));
      expect(f.entry.release.read('staff')).toEqual(release);
      expect(commands).not.toHaveBeenCalled();
      expect(ledger).not.toHaveBeenCalled();
      const next = await fresh(f),
        ids = vi.spyOn(crypto, 'randomUUID');
      await expect(
        executeSavedSourceExercise(next, kind, true),
      ).rejects.toThrow(/attempted|replay/);
      expect(ids).not.toHaveBeenCalled();
    },
  );
it('read and inspection expose only bounded IDs/revision and have no canonical effects', async () => {
  const f = await fixture(),
    before = f.sources.property.read(f.sources.company.id),
    writes = [
      vi.spyOn(f.sources.estimates, 'recordTime'),
      vi.spyOn(f.sources.estimates, 'submitExpense'),
      vi.spyOn(f.sources.property, 'saveVisit'),
    ];
  const view = await readSavedSourceExercise(f.sources, f.job, f.gate);
  expect(Object.keys(view.evidence).sort()).toEqual([
    'job_id',
    'job_revision',
    'plan_id',
    'visit_id',
  ]);
  expect(inspectSavedSourceExercise(view).state).toBe('REVIEW_ONLY');
  expect(JSON.stringify(view)).not.toMatch(
    /PRIVATE|rates|supplier|amount_minor|internal_notes/,
  );
  expect(f.sources.property.read(f.sources.company.id)).toEqual(before);
  writes.forEach((w) => expect(w).not.toHaveBeenCalled());
});
it('unconfirmed or forged selections never invoke an original command', async () => {
  const f = await opened(),
    write = vi.spyOn(f.sources.property, 'saveVisit');
  await expect(
    executeSavedSourceExercise(f.view, 'visit-draft', false),
  ).rejects.toThrow();
  await expect(
    executeSavedSourceExercise({ ...f.view }, 'visit-draft', true),
  ).rejects.toThrow();
  await expect(
    executeSavedSourceExercise(f.view, 'unknown' as SavedSourceExercise, true),
  ).rejects.toThrow();
  expect(write).not.toHaveBeenCalled();
});
it('stale pre-dispatch CAS denies without consuming a clean future exercise', async () => {
  const f = await opened(),
    plan = f.sources.property
      .read(f.sources.company.id)
      .plans.find((p) => p.id === f.entry.plan_id)!;
  f.sources.property.savePlan(f.sources.company.id, {
    ...plan,
    name: 'Explicit separately saved plan name',
  });
  const write = vi.spyOn(f.sources.property, 'saveVisit');
  await expect(
    executeSavedSourceExercise(f.view, 'visit-draft', true),
  ).rejects.toThrow();
  expect(write).not.toHaveBeenCalled();
  expect(
    (await executeSavedSourceExercise(await fresh(f), 'visit-draft', true))
      .status,
  ).toBe('SYNTHETIC_SOURCE_SAVED');
});
it('time correction requires existing approved exact time and creates no replacement source on absence', async () => {
  const f = await opened(),
    write = vi.spyOn(f.sources.estimates, 'recordTime');
  await expect(
    executeSavedSourceExercise(f.view, 'time-correction', true),
  ).rejects.toThrow(/approved time/);
  expect(write).not.toHaveBeenCalled();
});
it.each([0, 1, 2])(
  'brand %i fresh-wrapper concurrency retains the first canonical PENDING claim',
  async (brand) => {
    const f = await opened(brand),
      original = f.sources.estimates.recordTime.bind(f.sources.estimates);
    let release!: () => void;
    const wait = new Promise<void>((r) => (release = r)),
      write = vi
        .spyOn(f.sources.estimates, 'recordTime')
        .mockImplementation(async (...args) => {
          await wait;
          return original(...args);
        });
    const first = executeSavedSourceExercise(f.view, 'time-record', true),
      second = await fresh(f);
    expect(inspectSavedSourceExercise(second).state).toBe('PENDING');
    await expect(
      executeSavedSourceExercise(second, 'plan-revision', true),
    ).rejects.toThrow(/attempted|UNKNOWN/);
    expect(inspectSavedSourceExercise(second).state).toBe('PENDING');
    expect(write).toHaveBeenCalledTimes(1);
    release();
    await expect(first).resolves.toMatchObject({
      status: 'SYNTHETIC_SOURCE_SAVED',
    });
    expect(inspectSavedSourceExercise(await fresh(f)).done).toContain(
      'time-record',
    );
  },
);
it.each([0, 1, 2])(
  'brand %i invoked lost ACK is UNKNOWN across wrappers and different exercise kinds',
  async (brand) => {
    const f = await opened(brand),
      original = f.sources.estimates.recordTime.bind(f.sources.estimates),
      write = vi
        .spyOn(f.sources.estimates, 'recordTime')
        .mockImplementation(async (...args) => {
          await original(...args);
          throw Error('ACK lost');
        });
    await expect(
      executeSavedSourceExercise(f.view, 'time-record', true),
    ).rejects.toThrow(/ACK lost/);
    const next = await fresh(f);
    expect(inspectSavedSourceExercise(next).state).toBe('UNKNOWN');
    await expect(
      executeSavedSourceExercise(next, 'plan-revision', true),
    ).rejects.toThrow(/UNKNOWN/);
    expect(write).toHaveBeenCalledTimes(1);
  },
);
it.each(['time', 'material'] as const)(
  'invalid %s saved ID acknowledgment holds UNKNOWN before review',
  async (kind) => {
    const f = await opened(),
      review =
        kind === 'time'
          ? vi.spyOn(f.sources.estimates, 'submitTime')
          : vi.spyOn(f.sources.estimates, 'reviewExpense');
    if (kind === 'time') {
      const original = f.sources.estimates.recordTime.bind(f.sources.estimates);
      vi.spyOn(f.sources.estimates, 'recordTime').mockImplementation(
        async (...args) => {
          await original(...args);
          return { id: crypto.randomUUID() };
        },
      );
    } else {
      const original = f.sources.estimates.submitExpense.bind(
        f.sources.estimates,
      );
      vi.spyOn(f.sources.estimates, 'submitExpense').mockImplementation(
        async (...args) => {
          await original(...args);
          return undefined as never;
        },
      );
    }
    await expect(
      executeSavedSourceExercise(
        f.view,
        kind === 'time' ? 'time-record' : 'material-review',
        true,
      ),
    ).rejects.toThrow(/UUID/);
    expect(review).not.toHaveBeenCalled();
    expect(inspectSavedSourceExercise(await fresh(f)).state).toBe('UNKNOWN');
  },
);
it.each(['submitTime', 'reviewTime', 'reviewExpense'] as const)(
  '%s no-op ACK cannot claim exact saved/reviewed success',
  async (method) => {
    const f = await opened();
    vi.spyOn(f.sources.estimates, method).mockResolvedValue(undefined);
    await expect(
      executeSavedSourceExercise(
        f.view,
        method === 'reviewExpense' ? 'material-review' : 'time-record',
        true,
      ),
    ).rejects.toThrow(/acknowledgment/);
    expect(inspectSavedSourceExercise(await fresh(f)).state).toBe('UNKNOWN');
  },
);
it.each(['saveVisit', 'savePlan'] as const)(
  '%s no-op ACK is terminal UNKNOWN rather than synthetic success',
  async (method) => {
    const f = await opened();
    vi.spyOn(f.sources.property, method).mockReturnValue(undefined);
    await expect(
      executeSavedSourceExercise(
        f.view,
        method === 'saveVisit' ? 'visit-draft' : 'plan-revision',
        true,
      ),
    ).rejects.toThrow(/acknowledgment/);
    expect(inspectSavedSourceExercise(await fresh(f)).state).toBe('UNKNOWN');
  },
);
it.each([0, 1, 2])(
  'brand %i revoked staff after saved command cannot review or replay after restoration',
  async (brand) => {
    const f = await opened(brand),
      original = f.sources.estimates.recordTime.bind(f.sources.estimates),
      members = f.sources.operations.syntheticMemberships.bind(
        f.sources.operations,
      ),
      review = vi.spyOn(f.sources.estimates, 'submitTime');
    let revoke: ReturnType<typeof vi.spyOn> | undefined;
    vi.spyOn(f.sources.estimates, 'recordTime').mockImplementation(
      async (...args) => {
        const id = await original(...args);
        revoke = vi
          .spyOn(f.sources.operations, 'syntheticMemberships')
          .mockImplementation((org) =>
            members(org).map((m) =>
              m.user_id === f.entry.target.actor_id
                ? { ...m, active: false }
                : m,
            ),
          );
        return id;
      },
    );
    await expect(
      executeSavedSourceExercise(f.view, 'time-record', true),
    ).rejects.toThrow();
    expect(review).not.toHaveBeenCalled();
    revoke!.mockRestore();
    const next = await fresh(f);
    expect(inspectSavedSourceExercise(next).state).toBe('UNKNOWN');
    await expect(
      executeSavedSourceExercise(next, 'plan-revision', true),
    ).rejects.toThrow(/UNKNOWN/);
  },
);
it('job CAS drift inside an invoked command is held UNKNOWN before material review', async () => {
  const f = await opened(),
    original = f.sources.estimates.submitExpense.bind(f.sources.estimates),
    review = vi.spyOn(f.sources.estimates, 'reviewExpense');
  vi.spyOn(f.sources.estimates, 'submitExpense').mockImplementation(
    async (...args) => {
      const id = await original(...args),
        job = f.sources.estimates.syntheticJob(f.sources.company.id, f.job)!;
      await f.sources.estimates.projection(f.sources.company.id, job, {
        ...job.projection,
        overrun_bps: 1100,
      });
      return id;
    },
  );
  await expect(
    executeSavedSourceExercise(f.view, 'material-review', true),
  ).rejects.toThrow(/acknowledgment/);
  expect(review).not.toHaveBeenCalled();
  expect(inspectSavedSourceExercise(await fresh(f)).state).toBe('UNKNOWN');
});
it('OFF withdrawal after invoked saved command prevents continuation and preserves UNKNOWN', async () => {
  const f = await opened(),
    original = f.sources.estimates.recordTime.bind(f.sources.estimates),
    review = vi.spyOn(f.sources.estimates, 'submitTime');
  vi.spyOn(f.sources.estimates, 'recordTime').mockImplementation(
    async (...args) => {
      const id = await original(...args);
      f.gate.enabled = false;
      return id;
    },
  );
  await expect(
    executeSavedSourceExercise(f.view, 'time-record', true),
  ).rejects.toThrow(/OFF/);
  expect(review).not.toHaveBeenCalled();
  f.gate.enabled = true;
  expect(inspectSavedSourceExercise(await fresh(f)).state).toBe('UNKNOWN');
});
it.each(['void-promise', 'publish-promise', 'publish-thenable'] as const)(
  'unexpected %s rejection is consumed and never continued',
  async (kind) => {
    const f = await opened(),
      submit = vi.spyOn(f.sources.property, 'submit');
    if (kind === 'void-promise')
      vi.spyOn(f.sources.property, 'saveVisit').mockReturnValue(
        Promise.reject(Error('unexpected sync ACK')) as never,
      );
    else
      vi.spyOn(f.sources.property, 'publish').mockReturnValue(
        (kind === 'publish-promise'
          ? Promise.reject(Error('unexpected publication ACK'))
          : {
              then(_yes: unknown, no: (e: Error) => void) {
                no(Error('unexpected thenable'));
              },
            }) as never,
      );
    await expect(
      executeSavedSourceExercise(
        f.view,
        kind === 'void-promise' ? 'visit-draft' : 'report-revision',
        true,
      ),
    ).rejects.toThrow(/acknowledgment/);
    await Promise.resolve();
    await Promise.resolve();
    if (kind === 'void-promise') expect(submit).not.toHaveBeenCalled();
  },
);
it('unexpected reviewed ACK fails closed even after an actual review', async () => {
  const f = await opened(),
    original = f.sources.estimates.reviewTime.bind(f.sources.estimates);
  vi.spyOn(f.sources.estimates, 'reviewTime').mockImplementation(
    async (...args) => {
      await original(...args);
      return true as never;
    },
  );
  await expect(
    executeSavedSourceExercise(f.view, 'time-record', true),
  ).rejects.toThrow(/void acknowledgment/);
  expect(inspectSavedSourceExercise(await fresh(f)).state).toBe('UNKNOWN');
});
it('a partial original publication failure has no automatic repair or replay', async () => {
  const f = await opened(),
    save = vi.spyOn(f.sources.property, 'saveVisit').mockImplementation(() => {
      throw Error('save lost');
    }),
    revise = vi.spyOn(f.sources.property, 'revise');
  await expect(
    executeSavedSourceExercise(f.view, 'report-revision', true),
  ).rejects.toThrow(/save lost/);
  expect(revise).toHaveBeenCalledTimes(1);
  expect(
    f.sources.property
      .read(f.sources.company.id)
      .visits.find((v) => v.id === f.entry.visit_id)!.status,
  ).toBe('draft');
  save.mockRestore();
  let visit = f.sources.property
    .read(f.sources.company.id)
    .visits.find((v) => v.id === f.entry.visit_id)!;
  f.sources.property.submit(f.sources.company.id, visit);
  visit = f.sources.property
    .read(f.sources.company.id)
    .visits.find((v) => v.id === visit.id)!;
  f.sources.property.publish(f.sources.company.id, visit);
  const restored = await fresh(f);
  expect(inspectSavedSourceExercise(restored).state).toBe('UNKNOWN');
  await expect(
    executeSavedSourceExercise(restored, 'report-revision', true),
  ).rejects.toThrow(/UNKNOWN/);
  expect(revise).toHaveBeenCalledTimes(1);
});
it.each(['off', 'https', 'host', 'production'] as const)(
  '%s denies before source getters or canonical commands',
  async (kind) => {
    if (kind === 'https')
      vi.stubGlobal('window', {
        location: { hostname: '127.0.0.1', protocol: 'https:' },
      });
    if (kind === 'host')
      vi.stubGlobal('window', {
        location: { hostname: 'example.invalid', protocol: 'http:' },
      });
    if (kind === 'production') vi.stubEnv('DEV', false);
    const getter = vi.fn(),
      sources = Object.defineProperty({}, 'operations', {
        get: getter,
      }) as OperatingSources;
    await expect(
      readSavedSourceExercise(sources, 'x', {
        enabled: kind !== 'off',
        confirmed: true,
      }),
    ).rejects.toThrow(/OFF/);
    expect(getter).not.toHaveBeenCalled();
  },
);
it('wrong company or property rejects without command fallback', async () => {
  const f = await opened(),
    write = vi.spyOn(f.sources.property, 'saveVisit');
  f.entry.target.location_id = f.all.entries[1].target.location_id;
  await expect(
    executeSavedSourceExercise(f.view, 'visit-draft', true),
  ).rejects.toThrow();
  expect(write).not.toHaveBeenCalled();
  await expect(
    readSavedSourceExercise(
      { ...f.sources, company: sampleCompanies[1] },
      f.job,
      f.gate,
    ),
  ).rejects.toThrow();
});
