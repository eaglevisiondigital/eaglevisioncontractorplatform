// Offline qualification only. Canonical files remain untouched.
import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { devNull } from 'node:os';

const directory = 'proposals/invoice-guard-admission';
const parent = '5f0f17dc9766411b260d5b53fd2db5a925adc80f';
const tree = '868059f16ec4431ee8c8381ddf63fb5ffb1ed9bd';
const evidenceHash =
  'e23de825623031192e5aff45a66c01860211e48f26e5c703cd0cc96375f5d8e5';
const patchHash =
  '2fc927fa37cb8da1ba4eccc8a4ea225ed847e07eadea496130ad61e6c09596cf';
const helperPath = 'scripts/invoice-caller-source-admission.mjs';
const helperHash =
  '1d3438c34656e732c0352dab02477ea449ed4e4abd92714156c3ec62ff75e70a';
// Finite retained-launch compatibility. Original histories and proposal seals stay unchanged.
const retainedLaunch = Object.freeze({
  'proposals/payment-launch-integration/legacy-invoice-fixture.mjs': {
    before: '2e1cb96bb8c124d4ec11a053582bbcc27a259311ef7d1d09ef486448c53d51c2',
    after: '9520858626dde02883b5755e3681d1a3ba35f00f9a57eb55fe1f613a8befbe06',
  },
  'tests/launch-caller-payment-integration.test.ts': {
    before: 'e9efe20d12c69c4c9c17b4027e88b34f72589e834e5975169e4062a20912379c',
    after: 'f9289b166c0170072446aa35e261f2108fa3f62602dd6f4e34ccf952195949ab',
  },
});
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = () => {
  throw Error('Exact sealed invoice guard proposal required');
};
const gitEnvironment = Object.freeze({
  PATH: process.env.PATH,
  LC_ALL: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_SYSTEM: devNull,
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_COUNT: '0',
  GIT_ATTR_NOSYSTEM: '1',
  GIT_ALLOW_PROTOCOL: '',
  GIT_NO_LAZY_FETCH: '1',
  GIT_TERMINAL_PROMPT: '0',
  GIT_OPTIONAL_LOCKS: '0',
});
function git(...args) {
  return execFileSync(
    'git',
    [
      '--no-replace-objects',
      '--no-pager',
      '-c',
      'core.hooksPath=' + devNull,
      '-c',
      'core.fsmonitor=false',
      '-c',
      'credential.helper=',
      ...args,
    ],
    { env: gitEnvironment, stdio: ['ignore', 'pipe', 'pipe'] },
  );
}
let immutableFrame;
function baseline() {
  if (!immutableFrame) {
    if (
      git('rev-parse', parent + '^{tree}')
        .toString()
        .trim() !== tree
    )
      fail();
    immutableFrame = git('ls-tree', '-rz', parent)
      .toString()
      .split('\0')
      .filter(Boolean)
      .map((row) => {
        const [meta, path] = row.split('\t');
        const [mode, type, oid] = meta.split(' ');
        if (!['100644', '100755'].includes(mode) || type !== 'blob') fail();
        return Object.freeze({ mode, oid, path });
      });
    if (immutableFrame.length !== 2421) fail();
    Object.freeze(immutableFrame);
  }
  return immutableFrame;
}
function regular(path, mode, stat) {
  let prefix = '';
  for (const part of path.split('/')) {
    prefix = prefix ? prefix + '/' + part : part;
    const info = stat(prefix);
    if (info.isSymbolicLink()) fail();
    if (prefix !== path && !info.isDirectory()) fail();
  }
  const info = stat(path);
  if (!info.isFile() || (info.mode & 0o777) !== mode) fail();
}
function checked(path, hash, read, stat) {
  regular(path, 0o644, stat);
  const bytes = Buffer.from(read(path));
  if (digest(bytes) !== hash) fail();
  regular(path, 0o644, stat);
  return bytes;
}
function inspect({ read, stat }) {
  const evidence = JSON.parse(
    checked(directory + '/evidence.json', evidenceHash, read, stat),
  );
  checked(directory + '/admission.patch', patchHash, read, stat);
  if (
    evidence.parent !== parent ||
    evidence.patchSha256 !== patchHash ||
    evidence.files.length !== 10 ||
    evidence.admissionAuthorized !== false
  )
    fail();
  const payloads = new Map();
  for (const row of evidence.files) {
    if (row.mode !== '100644' || payloads.has(row.path)) fail();
    payloads.set(
      row.path,
      checked(directory + '/payload/' + row.path, row.after, read, stat),
    );
  }
  if (digest(payloads.get(helperPath)) !== helperHash) fail();
  for (const row of evidence.fixtureFiles)
    checked(row.path, row.sha256, read, stat);
  const targets = new Map(evidence.files.map((row) => [row.path, row]));
  const phases = new Set();
  const retainedPhases = new Set();
  for (const row of baseline()) {
    regular(row.path, row.mode === '100644' ? 0o644 : 0o755, stat);
    const bytes = Buffer.from(read(row.path));
    const target = targets.get(row.path);
    if (target) {
      const hash = digest(bytes);
      if (hash === target.before) phases.add('before');
      else if (hash === target.after) phases.add('after');
      else fail();
    } else if (Object.hasOwn(retainedLaunch, row.path)) {
      const pin = retainedLaunch[row.path],
        hash = digest(bytes);
      if (hash === pin.before) retainedPhases.add('original');
      else if (hash === pin.after) retainedPhases.add('proposed');
      else fail();
    } else {
      const oid = createHash('sha1')
        .update(Buffer.from('blob ' + bytes.length + '\0'))
        .update(bytes)
        .digest('hex');
      if (oid !== row.oid) fail();
    }
    regular(row.path, row.mode === '100644' ? 0o644 : 0o755, stat);
  }
  if (
    phases.size !== 1 ||
    retainedPhases.size !== 1 ||
    (retainedPhases.has('proposed') && phases.has('before'))
  )
    fail();
  return {
    payloads,
    phase: [...phases][0],
    retainedPhase: [...retainedPhases][0],
  };
}
const key = (path) =>
  relative(
    process.cwd(),
    path instanceof URL ? fileURLToPath(path) : resolve(String(path)),
  );

async function qualifyLegacyInvoiceGuardProposal({
  read = readFileSync,
  stat = lstatSync,
} = {}) {
  const captured = inspect({ read, stat });
  const bytes = Buffer.from(captured.payloads.get(helperPath));
  const helper = await import(
    'data:text/javascript;base64,' + bytes.toString('base64')
  );
  const inspectCaptured = () => {
    const current = inspect({ read, stat });
    if (
      current.phase !== captured.phase ||
      current.retainedPhase !== captured.retainedPhase
    )
      fail();
    return current;
  };
  // Import is an await boundary. Source and packet reads stay fresh.
  inspectCaptured();
  const readCurrent = (path, encoding) => {
    const bytes = captured.payloads.get(key(path));
    if (!bytes) return read(path, encoding);
    return encoding
      ? bytes.toString(
          typeof encoding === 'string' ? encoding : encoding.encoding,
        )
      : Buffer.from(bytes);
  };
  const check = () => {
    inspectCaptured();
    const result = helper.verifyInvoiceGuardFrame({ readCurrent, stat });
    // The helper performs further current/history reads. Recheck the full frame.
    inspectCaptured();
    return result;
  };
  check();
  return Object.freeze({
    classification: 'UNAPPLIED_OFFLINE_QUALIFICATION_ONLY',
    parent,
    canonicalPhase: captured.phase,
    helper,
    readCurrent,
    stat,
    check,
    admissionAuthorized: false,
    sqlInstallation: 'NOT_RUN',
  });
}

// Existing historical proposal remains a historical view, never current admission.
const successorPins = Object.freeze({
  'scripts/invoice-caller-source-admission.mjs': {
    commit: '3b52b8706bf83eefc0712ec83fca8dda57e76a37',
    before: '1d3438c34656e732c0352dab02477ea449ed4e4abd92714156c3ec62ff75e70a',
    after: 'cf28a441f146c5e4d398eb0ea0b78a999dd0f744e19424c46f3e95de74229438',
  },
  'proposals/invoice-guard-admission/fixture-adapter.mjs': {
    commit: '3b52b8706bf83eefc0712ec83fca8dda57e76a37',
    before: '6c6a5758d3a3219b4fac88e5dbbeb2e24f6182bf73c8eba3f7bc5c44c8cd61bc',
    after: 'f12618162eb8bb0e7d74e4f41e1b9b1c7375788834cb98991d7fbca77741ece9',
  },
  'tests/invoice-caller-migration-source.test.ts': {
    commit: '3b52b8706bf83eefc0712ec83fca8dda57e76a37',
    before: '866339cc0e394971886ff6c8d9007ac485642d089bf07e28b812cc884d2b0c8a',
    after: 'e476ba2e126b8a56dfed5eeca839d081d3193df7feced08cf1540d5916b05fa8',
  },
  'proposals/invoice-caller-reconciliation/qualify.mjs': {
    commit: '3b52b8706bf83eefc0712ec83fca8dda57e76a37',
    before: '96ed1c379bc2ad3c6f03f1f54b1a66933d486b3793c688913bc9ea26074d27a7',
    after: 'fd1f640afb20c5b933d0a5ec6b5607a1732b830211b1b1b7de4eb0719ef03b9c',
  },
  'proposals/invoice-checker-qualification/baseline.mjs': {
    commit: '3b52b8706bf83eefc0712ec83fca8dda57e76a37',
    before: '949edd4dce7557f8c9829494579ae9e0babd572441e710fb3940479d41a04a25',
    after: '3057cd8b268f24a29dd3a1ec83006254774e26393da1c551845d02ecf4c099b5',
  },
  'proposals/invoice-caller-transition/qualify.mjs': {
    commit: '3b52b8706bf83eefc0712ec83fca8dda57e76a37',
    before: '361b24b71ca03b54e86d521bde76f5e95be53125c84ffcfb881548b732ab2645',
    after: 'fa38a34b7ac3d70a8ec0a3fce9af703fea6d3cb0bf68c589e88dcdb532b2ac57',
  },
  'tests/commercial-invoice-author-checkpoint.test.ts': {
    commit: '3b52b8706bf83eefc0712ec83fca8dda57e76a37',
    before: '9519540efd5c531c3d79fc101d48e139c26de8240121a16ce9a13e66f04473ab',
    after: '56bc23def7acf53501b3af4cdc599f98de601a5d6e95dda47d583bd0e8400c73',
  },
  'proposals/invoice-caller-admission/qualify.mjs': {
    commit: '3b52b8706bf83eefc0712ec83fca8dda57e76a37',
    before: '8137978d6b2d2f8e91a864db2d6b61ae0a0391faeea38f25c63db19abb8c4629',
    after: '5d8521ae472a2983fb2b450c3ca138811b2f04d7e4c61e4e32772d68c069457d',
  },
  'tests/invoice-caller-admission-proposal.test.ts': {
    commit: '3b52b8706bf83eefc0712ec83fca8dda57e76a37',
    before: '1cbcc2051c20a2287d93e6f148f41f62c8f3c60ec13557f6d0be8cd895f2a11a',
    after: '1dd283a94bd4a374d058db2cf0225d691be6e5b3180e033b5ef6c47feb3e57a2',
  },
  'tests/invoice-checker-qualification-baseline.test.ts': {
    commit: '3b52b8706bf83eefc0712ec83fca8dda57e76a37',
    before: '9b2ef5e2dfcd99c218a249bc6cdbc7f30dfb24521ad23478ed7c72f15f2d7341',
    after: '620713f79f664b3af0ed0dcb93473e3d939e034e202fcfcb50bb31221b1424b7',
  },
  'tests/launch-invoice-payment-source.test.ts': {
    commit: '3b52b8706bf83eefc0712ec83fca8dda57e76a37',
    before: 'ada16b37c940f58473b5449bf53317ca1bff81abfb3e3125dece0447b2814862',
    after: '98af655cb91e0bf68a926730bdc192ef9d6cef0c5379498bbd83ef0c06d10aa4',
  },
  'proposals/commercial-invoice-issuance/presentation.ts': {
    commit: 'afb028058b479d1ab17a9e516d1460cb1c4de4f3',
    before: 'a181a67faf3f8b3264b5cd00478b38c5a3c9d67c2b7f2463d6d81c01bf477981',
    after: 'a63a605af3b1e03a0169828340f4938a50031a6f131404054da60e2db610ea6b',
  },
});

let successorProjection;
export async function qualifyInvoiceGuardProposal({
  read = readFileSync,
  stat = lstatSync,
} = {}) {
  const currentHelper = 'scripts/invoice-caller-source-admission.mjs';
  const bytes = checked(
    currentHelper,
    'cf28a441f146c5e4d398eb0ea0b78a999dd0f744e19424c46f3e95de74229438',
    read,
    stat,
  );
  const current = await import(
    'data:text/javascript;base64,' + bytes.toString('base64')
  );
  const checkCurrent = (legacyError = false) => {
    try {
      checked(
        currentHelper,
        'cf28a441f146c5e4d398eb0ea0b78a999dd0f744e19424c46f3e95de74229438',
        read,
        stat,
      );
      current.verifyInvoiceGuardFrame({ readCurrent: read, stat });
    } catch (error) {
      if (legacyError) fail();
      throw error;
    }
  };
  checkCurrent(true);
  if (!successorProjection) {
    const map = new Map();
    for (const [path, pin] of Object.entries(successorPins)) {
      const original = git('show', pin.commit + ':' + path);
      if (digest(original) !== pin.before) fail();
      map.set(path, original);
    }
    successorProjection = map;
  }
  const historicalRead = (path, encoding) => {
    const actual = read(path, encoding),
      p = key(path),
      historical = successorProjection.get(p);
    if (!historical) return actual;
    if (digest(Buffer.from(actual)) !== successorPins[p].after) fail();
    return encoding
      ? historical.toString(
          typeof encoding === 'string' ? encoding : encoding.encoding,
        )
      : Buffer.from(historical);
  };
  const legacy = await qualifyLegacyInvoiceGuardProposal({
    read: historicalRead,
    stat,
  });
  checkCurrent(true);
  const checkedCall = (fn, args) => {
    checkCurrent();
    const result = fn(...args);
    checkCurrent();
    return result;
  };
  const helper = Object.freeze({
    verifyInvoiceGuardFrame: (...args) =>
      checkedCall(legacy.helper.verifyInvoiceGuardFrame, args),
    admitInvoiceCallerSource: (...args) =>
      checkedCall(legacy.helper.admitInvoiceCallerSource, args),
    createGuardHistoricalRead: (...args) => {
      const historical = checkedCall(
        legacy.helper.createGuardHistoricalRead,
        args,
      );
      return (...readArgs) => checkedCall(historical, readArgs);
    },
  });
  return Object.freeze({
    ...legacy,
    helper,
    check: () => checkedCall(legacy.check, []),
  });
}
