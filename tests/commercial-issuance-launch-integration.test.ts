import { expect, it } from 'vitest';
import {
  readFileSync,
  lstatSync,
  writeFileSync,
  existsSync,
  renameSync,
  symlinkSync,
  rmSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
interface Row {
  path: string;
  status: 'A' | 'M';
  beforeSha256: string | null;
  afterSha256: string;
}
interface Context {
  directory: string;
  tree: string;
  verify(): { tree: string; tracked: number };
}
interface Ports {
  read?: typeof readFileSync;
  stat?: typeof lstatSync;
  metadata?: (command: string, ...args: string[]) => Buffer;
}
const q = (await import(
  pathToFileURL(
    resolve('proposals/commercial-issuance-launch-integration/qualify.mjs'),
  ).href
)) as {
  inspectIssuanceIntegration(ports?: Ports): {
    files: number;
    added: number;
    modified: number;
    unchangedBaseEntries: number;
    protectedIntegrationAuthorized: boolean;
    patchSha256: string;
  };
  withDisposableIssuanceIntegration<T>(
    run: (context: Context) => Promise<T> | T,
    ports?: Ports,
  ): Promise<T>;
};
const dir = 'proposals/commercial-issuance-launch-integration/';
const evidence = JSON.parse(readFileSync(dir + 'evidence.json', 'utf8')) as {
  files: Row[];
  patchSha256: string;
};
const hash = (value: Buffer | string) =>
  createHash('sha256').update(value).digest('hex');
const changedRead = (path: string) =>
  ((p: Parameters<typeof readFileSync>[0], options?: unknown) => {
    const bytes = readFileSync(p);
    const b =
      String(p) === path
        ? Buffer.concat([bytes, Buffer.from('\nUNREVIEWED')])
        : bytes;
    return options ? b.toString(options as BufferEncoding) : b;
  }) as typeof readFileSync;
it('binds the exact reviewed issuance lineage without admitting it', () => {
  expect(q.inspectIssuanceIntegration()).toMatchObject({
    files: 40,
    added: 28,
    modified: 12,
    unchangedBaseEntries: 2398,
    protectedIntegrationAuthorized: false,
    patchSha256:
      '56b27b8c3dc7510ddab41e47a4e7ad8ba1ad37d785052957bdde33186eeffa1f',
  });
});
it.each([dir + 'evidence.json', dir + 'integration.patch'])(
  'denies unsealed %s before metadata or execution',
  (path) => {
    let called = false;
    expect(() =>
      q.inspectIssuanceIntegration({
        read: changedRead(path),
        metadata: () => {
          called = true;
          throw Error('must not execute');
        },
      }),
    ).toThrow();
    expect(called).toBe(false);
  },
);
it('denies coordinated patch and manifest checksum rebinding', () => {
  const patch = Buffer.concat([
    readFileSync(dir + 'integration.patch'),
    Buffer.from('\nUNKNOWN'),
  ]);
  const json = Buffer.from(
    JSON.stringify({ ...evidence, patchSha256: hash(patch) }),
  );
  const read = ((p: Parameters<typeof readFileSync>[0]) =>
    String(p) === dir + 'integration.patch'
      ? patch
      : String(p) === dir + 'evidence.json'
        ? json
        : readFileSync(p)) as typeof readFileSync;
  expect(() => q.inspectIssuanceIntegration({ read })).toThrow();
});
it('rejects false commit/tree identity', () =>
  expect(() =>
    q.inspectIssuanceIntegration({
      metadata: () => Buffer.from('0'.repeat(40)),
    }),
  ).toThrow());
it('rejects a forged complete tree list even with the expected tree identifier', () => {
  const metadata = (command: string, ...args: string[]) => {
    if (command === 'rev-parse')
      return Buffer.from(
        args[0].startsWith('7f464')
          ? 'edd0f3ff75eb7b584dab80ddd64dc3e54fc7b630'
          : '66261e5ce8bca0542bd5a2053fb2f3033d461f0e',
      );
    return Buffer.from('100644 blob ' + '0'.repeat(40) + '\tREADME.md\0');
  };
  expect(() => q.inspectIssuanceIntegration({ metadata })).toThrow();
});
it.each([
  'server/invoices/commercial-drafts.proposed.sql',
  'server/invoices/commercial-draft-client.ts',
  'server/invoices/commercial-caller-connection.ts',
  'server/customer/broker-auth.ts',
  'server/payments/sandbox.ts',
  'server/payments/refunds.ts',
  'server/payments/response-json.ts',
  'scripts/check-cycle17-integrity.mjs',
  'scripts/check-cycle22.mjs',
  'scripts/check-cycle24.mjs',
  'scripts/invoice-caller-source-admission.mjs',
  'docs/LAUNCH_INVOICE_PAYMENT_COMPOSITION.json',
  'docs/FEATURE_SOURCE_INVENTORY.json',
])('rejects a current launch-source substitution in %s', (path) => {
  expect(() =>
    q.inspectIssuanceIntegration({ read: changedRead(path) }),
  ).toThrow();
});
it('rejects a preexisting added target instead of overwriting it', () => {
  const path = evidence.files.find((r) => r.status === 'A')!.path;
  const stat = ((p: Parameters<typeof lstatSync>[0]) =>
    String(p) === path
      ? lstatSync('README.md')
      : lstatSync(p)) as typeof lstatSync;
  // Its parent may not exist yet, so expose regular ancestor directories only.
  const prefixes = new Set(
    path
      .split('/')
      .slice(0, -1)
      .map((_, i) =>
        path
          .split('/')
          .slice(0, i + 1)
          .join('/'),
      ),
  );
  const complete = ((p: Parameters<typeof lstatSync>[0]) =>
    prefixes.has(String(p))
      ? lstatSync('proposals')
      : stat(p)) as typeof lstatSync;
  expect(() => q.inspectIssuanceIntegration({ stat: complete })).toThrow();
});
it('rejects symlink ancestors and executable-mode substitution', () => {
  for (const mode of ['ancestor', 'mode']) {
    const stat = ((p: Parameters<typeof lstatSync>[0]) =>
      mode === 'ancestor' && String(p) === 'server'
        ? { isSymbolicLink: () => true }
        : mode === 'mode' && String(p) === 'README.md'
          ? {
              ...lstatSync(p),
              mode: 0o100755,
              isSymbolicLink: () => false,
              isFile: () => true,
            }
          : lstatSync(p)) as typeof lstatSync;
    expect(() => q.inspectIssuanceIntegration({ stat })).toThrow();
  }
});
it('rechecks all current source after metadata and packet reads', () => {
  let count = 0;
  let withdrawn = false;
  const read = ((p: Parameters<typeof readFileSync>[0]) => {
    if (String(p) === dir + 'integration.patch' && ++count === 2)
      withdrawn = true;
    const b = readFileSync(p);
    return withdrawn && String(p) === 'README.md'
      ? Buffer.concat([b, Buffer.from('\nWITHDRAWN')])
      : b;
  }) as typeof readFileSync;
  expect(() => q.inspectIssuanceIntegration({ read })).toThrow();
  expect(withdrawn).toBe(true);
});
it('applies only in a disposable tree byte-identical to the sealed proposed composition and cleans up', async () => {
  let path = '';
  const result = await q.withDisposableIssuanceIntegration((stage) => {
    path = stage.directory;
    expect(
      hash(
        readFileSync(path + '/server/invoices/commercial-drafts.proposed.sql'),
      ),
    ).toBe('e1c504f9a7077caa92c375c378fb370155478be9cf077e66bf58932ae0895a3c');
    return stage.verify();
  });
  expect(result).toMatchObject({
    tree: 'f255ae9f0665d55fee94387340d84032f1fa25b8',
    tracked: 2438,
  });
  expect(existsSync(path)).toBe(false);
  expect(q.inspectIssuanceIntegration().protectedIntegrationAuthorized).toBe(
    false,
  );
});
it('denies staged mutation and never leaves a misleading accepted tree', async () => {
  let path = '';
  await expect(
    q.withDisposableIssuanceIntegration((stage) => {
      path = stage.directory;
      writeFileSync(path + '/server/payments/sandbox.ts', 'UNREVIEWED');
      return 'not accepted';
    }),
  ).rejects.toThrow();
  expect(existsSync(path)).toBe(false);
});
it('denies launch-source withdrawal while an awaited qualification is running', async () => {
  let withdrawn = false;
  const read = ((p: Parameters<typeof readFileSync>[0]) => {
    const b = readFileSync(p);
    return withdrawn && String(p) === 'README.md'
      ? Buffer.concat([b, Buffer.from('\nWITHDRAWN')])
      : b;
  }) as typeof readFileSync;
  await expect(
    q.withDisposableIssuanceIntegration(
      async () => {
        await Promise.resolve();
        withdrawn = true;
      },
      { read },
    ),
  ).rejects.toThrow();
});
it('propagates an uncertain test failure without retry and removes its disposable checkout', async () => {
  let calls = 0,
    path = '';
  await expect(
    q.withDisposableIssuanceIntegration((stage) => {
      calls++;
      path = stage.directory;
      throw Error('original qualification uncertain');
    }),
  ).rejects.toThrow('original qualification uncertain');
  expect(calls).toBe(1);
  expect(existsSync(path)).toBe(false);
});
it('denies ignored extra environment/source inputs instead of hiding them', async () => {
  await expect(
    q.withDisposableIssuanceIntegration((stage) => {
      writeFileSync(stage.directory + '/.env.local', 'UNREVIEWED=1\n');
    }),
  ).rejects.toThrow();
});
it('does not inherit tar extraction options from the caller environment', async () => {
  const previous = process.env.TAR_OPTIONS;
  process.env.TAR_OPTIONS = '--an-invalid-inherited-extraction-option';
  try {
    await expect(
      q.withDisposableIssuanceIntegration((stage) => stage.verify()),
    ).resolves.toMatchObject({ tracked: 2438 });
  } finally {
    if (previous === undefined) delete process.env.TAR_OPTIONS;
    else process.env.TAR_OPTIONS = previous;
  }
});
it('rejects altered Git control files before any clean filter can execute', async () => {
  let marker = '';
  await expect(
    q.withDisposableIssuanceIntegration((stage) => {
      marker = stage.directory + '-filter-marker';
      writeFileSync(
        stage.directory + '/.git/info/attributes',
        '* filter=boundaryprobe\n',
      );
      const config = readFileSync(stage.directory + '/.git/config', 'utf8');
      writeFileSync(
        stage.directory + '/.git/config',
        config +
          '\n[filter "boundaryprobe"]\n clean = "touch ' +
          marker +
          '; cat"\n',
      );
      // Keep exact source bytes while changing stat freshness for a potential diff.
      const path = stage.directory + '/README.md';
      const bytes = readFileSync(path);
      writeFileSync(path, bytes);
    }),
  ).rejects.toThrow();
  expect(existsSync(marker)).toBe(false);
});

it('rejects a symlink substituted for the isolated source ancestor', async () => {
  let path = '',
    mutated = false;
  await expect(
    q.withDisposableIssuanceIntegration((stage) => {
      path = stage.directory;
      renameSync(path, path + '-original');
      symlinkSync(path + '-original', path, 'dir');
      mutated = true;
    }),
  ).rejects.toThrow();
  expect(mutated).toBe(true);
  expect(existsSync(path)).toBe(false);
});
it('rejects a replaced private root and reports incomplete cleanup', async () => {
  let root = '',
    moved = '';
  try {
    await expect(
      q.withDisposableIssuanceIntegration((stage) => {
        root = dirname(stage.directory);
        moved = root + '-original';
        renameSync(root, moved);
        symlinkSync(moved, root, 'dir');
      }),
    ).rejects.toThrow('cleanup remains unresolved');
    expect(existsSync(root)).toBe(false);
    expect(existsSync(moved)).toBe(true);
  } finally {
    if (root) rmSync(root, { recursive: true, force: true });
    if (moved) rmSync(moved, { recursive: true, force: true });
  }
});
it('qualifies only the complete proposed legacy pair and retains the original guard proof', async () => {
  await q.withDisposableIssuanceIntegration(async (stage) => {
    const prefix = stage.directory + '/';
    const bytes = readFileSync(
      prefix + 'proposals/invoice-guard-admission/qualify.mjs',
    );
    const legacy = (await import(
      'data:text/javascript;base64,' + bytes.toString('base64')
    )) as {
      qualifyInvoiceGuardProposal(p: {
        read: typeof readFileSync;
        stat: typeof lstatSync;
      }): Promise<{ canonicalPhase: string; admissionAuthorized: boolean }>;
    };
    const read = ((
      path: Parameters<typeof readFileSync>[0],
      encoding?: BufferEncoding,
    ) => {
      const b = readFileSync(prefix + String(path));
      return encoding ? b.toString(encoding) : b;
    }) as typeof readFileSync;
    const stat = ((path: Parameters<typeof lstatSync>[0]) =>
      lstatSync(prefix + String(path))) as typeof lstatSync;
    const positive = await legacy.qualifyInvoiceGuardProposal({ read, stat });
    expect(positive.canonicalPhase).toBe('after');
    expect(positive.admissionAuthorized).toBe(false);
    const pair = [
      'proposals/payment-launch-integration/legacy-invoice-fixture.mjs',
      'tests/launch-caller-payment-integration.test.ts',
    ];
    for (const target of pair) {
      const mixed = ((
        path: Parameters<typeof readFileSync>[0],
        encoding?: BufferEncoding,
      ) =>
        String(path) === target
          ? readFileSync(target, encoding as never)
          : read(path, encoding as never)) as typeof readFileSync;
      await expect(
        legacy.qualifyInvoiceGuardProposal({ read: mixed, stat }),
      ).rejects.toThrow();
    }
    let evidenceReads = 0;
    const withdrawn = ((
      path: Parameters<typeof readFileSync>[0],
      encoding?: BufferEncoding,
    ) => {
      if (String(path) === 'proposals/invoice-guard-admission/evidence.json')
        evidenceReads++;
      return evidenceReads > 1 && pair.includes(String(path))
        ? readFileSync(String(path), encoding as never)
        : read(path, encoding as never);
    }) as typeof readFileSync;
    await expect(
      legacy.qualifyInvoiceGuardProposal({ read: withdrawn, stat }),
    ).rejects.toThrow();
  });
});
it.each([
  'legacy-fixture/source-author.json',
  'legacy-fixture/source-author.patch',
  'legacy-fixture/payload/proposals/invoice-guard-admission/qualify.mjs',
])('rejects unreviewed compatibility package %s before evaluation', (path) => {
  expect(() =>
    q.inspectIssuanceIntegration({ read: changedRead(dir + path) }),
  ).toThrow();
});
it('denies source withdrawal from the final compatibility-payload read', () => {
  let count = 0,
    withdrawn = false;
  const target =
    dir +
    'legacy-fixture/payload/proposals/invoice-guard-admission/qualify.mjs';
  const read = ((p: Parameters<typeof readFileSync>[0]) => {
    if (String(p) === target && ++count === 3) withdrawn = true;
    const b = readFileSync(p);
    return withdrawn && String(p) === 'README.md'
      ? Buffer.concat([b, Buffer.from('\nWITHDRAWN')])
      : b;
  }) as typeof readFileSync;
  expect(() => q.inspectIssuanceIntegration({ read })).toThrow();
  expect(withdrawn).toBe(true);
});
it('does not turn a thrown undefined test outcome into acceptance', async () => {
  let calls = 0;
  await expect(
    q.withDisposableIssuanceIntegration(() => {
      calls++;
      throw undefined;
    }),
  ).rejects.toBeUndefined();
  expect(calls).toBe(1);
});
