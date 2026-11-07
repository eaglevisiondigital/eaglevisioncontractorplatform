import { expect, it } from 'vitest';
import sharp from 'sharp';
const verifier: {
  validateScreenshot: (b: Buffer) => Promise<{ width: number; height: number }>;
  validateBrowserReport: (
    r: unknown,
    file: string,
    head: string,
    ci?: boolean,
  ) => unknown;
} = await import(
  new URL('../scripts/check-v1-product-continuity.mjs', import.meta.url).href
);
const head = '1'.repeat(40),
  projects = ['desktop', 'tablet', 'mobile'];
function fixture(off = false) {
  const suites = [
    {
      file: 'v1-field-finance-continuity.spec.ts',
      specs: [] as Array<Record<string, unknown>>,
    },
  ];
  for (const projectName of projects) {
    const titles = off
      ? ['production keeps Field and Finance continuity controls OFF']
      : ['straight-edge', 'cunningham', 'roofing-example'].flatMap((brand) => [
          `ordinary Field void navigation retains exact job and destination focus / ${brand}`,
          `ordinary Finance material save retains exact time selection for fresh verification / ${brand}`,
        ]);
    for (const title of titles)
      suites[0].specs.push({
        title,
        ok: true,
        tests: [
          {
            projectName,
            status: 'expected',
            expectedStatus: 'passed',
            timeout:
              off || title.startsWith('ordinary Field ') ? 90000 : 150000,
            results: [{ status: 'passed', retry: 0, errors: [], duration: 1 }],
          },
        ],
      });
  }
  return {
    config: {
      workers: 1,
      projects: projects.map((name) => ({
        name,
        retries: 0,
        repeatEach: 1,
        timeout: 150000,
      })),
      metadata: { gitCommit: { hash: head }, ci: { commitHash: head } },
    },
    errors: [],
    stats: { unexpected: 0, flaky: 0, skipped: 0, expected: off ? 3 : 18 },
    suites,
  };
}
type Report = ReturnType<typeof fixture>;
const first = (r: Report) =>
  (r.suites[0].specs[0].tests as Array<Record<string, unknown>>)[0];
for (const off of [false, true])
  it(`complete exact ${off ? 'OFF3' : 'responsive18'} report is source evidence only`, () => {
    expect(
      verifier.validateBrowserReport(
        fixture(off),
        off ? 'off.json' : 'browser.json',
        head,
        true,
      ),
    ).toEqual({
      cases: off ? 3 : 18,
      report_git_identity: 'EXACT_HOSTED_CHECKOUT',
    });
  });
const mutations: Array<[string, (r: Report) => void]> = [
  [
    'missing case',
    (r) => {
      r.suites[0].specs.pop();
    },
  ],
  [
    'duplicate case',
    (r) => {
      r.suites[0].specs[1] = structuredClone(r.suites[0].specs[0]);
    },
  ],
  [
    'foreign brand',
    (r) => {
      r.suites[0].specs[0].title =
        'ordinary Field void navigation retains exact job and destination focus / another-company';
    },
  ],
  [
    'foreign path',
    (r) => {
      r.suites[0].file = 'other.spec.ts';
    },
  ],
  [
    'false spec ok',
    (r) => {
      r.suites[0].specs[0].ok = false;
    },
  ],
  [
    'skipped result',
    (r) => {
      first(r).status = 'skipped';
    },
  ],
  [
    'expected failure',
    (r) => {
      first(r).expectedStatus = 'failed';
    },
  ],
  [
    'raised Field budget',
    (r) => {
      first(r).timeout = 150000;
    },
  ],
  [
    'lowered Finance budget',
    (r) => {
      (
        r.suites[0].specs[1].tests as Array<Record<string, unknown>>
      )[0].timeout = 90000;
    },
  ],
  [
    'retry',
    (r) => {
      (first(r).results as Array<Record<string, unknown>>)[0].retry = 1;
    },
  ],
  [
    'multiple attempts',
    (r) => {
      (first(r).results as Array<Record<string, unknown>>).push({
        status: 'passed',
        retry: 1,
        errors: [],
        duration: 1,
      });
    },
  ],
  [
    'result error',
    (r) => {
      (first(r).results as Array<Record<string, unknown>>)[0].errors = [
        'failure',
      ];
    },
  ],
  [
    'duration beyond budget',
    (r) => {
      (first(r).results as Array<Record<string, unknown>>)[0].duration = 90001;
    },
  ],
  [
    'workers override',
    (r) => {
      r.config.workers = 2;
    },
  ],
  [
    'project retries',
    (r) => {
      r.config.projects[0].retries = 1;
    },
  ],
  [
    'summary failure',
    (r) => {
      r.stats.unexpected = 1;
    },
  ],
  [
    'Git identity mismatch',
    (r) => {
      r.config.metadata.gitCommit.hash = '2'.repeat(40);
    },
  ],
  [
    'CI identity mismatch',
    (r) => {
      r.config.metadata.ci.commitHash = '2'.repeat(40);
    },
  ],
];
for (const [name, mutate] of mutations)
  it(`denies ${name} without accepting inflated aggregate counts`, () => {
    const report = fixture();
    mutate(report);
    expect(() =>
      verifier.validateBrowserReport(report, 'browser.json', head, true),
    ).toThrow();
  });

const png = () =>
  sharp({ create: { width: 2, height: 3, channels: 3, background: '#123456' } })
    .png()
    .toBuffer();
it('fully decodes complete PNG dimensions', async () => {
  await expect(verifier.validateScreenshot(await png())).resolves.toEqual({
    width: 2,
    height: 3,
  });
});
it('denies a PNG header without any image', async () => {
  await expect(
    verifier.validateScreenshot(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  ).rejects.toThrow();
});
it('denies truncated PNG completion', async () => {
  const bytes = await png();
  await expect(
    verifier.validateScreenshot(bytes.subarray(0, -12)),
  ).rejects.toThrow();
});
it('denies corrupt PNG payload despite intact header and IEND', async () => {
  const bytes = await png();
  const index = bytes.indexOf(Buffer.from('IDAT'));
  expect(index).toBeGreaterThan(0);
  bytes[index + 4] ^= 255;
  await expect(verifier.validateScreenshot(bytes)).rejects.toThrow();
});

it('denies array-like browser attempts without a real results array', () => {
  const report = fixture(),
    test = first(report);
  test.results = { 0: (test.results as Array<unknown>)[0], length: 1 };
  expect(() =>
    verifier.validateBrowserReport(report, 'browser.json', head, true),
  ).toThrow();
});
