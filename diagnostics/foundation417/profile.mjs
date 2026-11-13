import assert from 'node:assert/strict';
/** Main-thread sampled time, not a sum of inclusive times or a hosted-cause claim. */
export function summarizeProfile(profile) {
  assert(profile && typeof profile === 'object');
  assert(Array.isArray(profile.nodes) && profile.nodes.length <= 100000);
  assert(
    Array.isArray(profile.samples) &&
      profile.samples.length > 0 &&
      profile.samples.length <= 500000,
  );
  assert(
    Array.isArray(profile.timeDeltas) &&
      profile.timeDeltas.length === profile.samples.length,
  );
  const nodes = new Map(),
    parent = new Map();
  for (const node of profile.nodes) {
    assert(Number.isSafeInteger(node.id) && !nodes.has(node.id));
    assert(
      typeof node.callFrame?.functionName === 'string' &&
        typeof node.callFrame?.url === 'string',
    );
    nodes.set(node.id, node);
  }
  for (const node of nodes.values())
    for (const child of node.children ?? []) {
      assert(nodes.has(child) && !parent.has(child));
      parent.set(child, node.id);
    }
  const label = (node) => {
    const url = node.callFrame.url,
      index = url.indexOf('/src/');
    const file =
      index >= 0
        ? url.slice(index + 1).split('?')[0]
        : url.startsWith('node:')
          ? url.split('?')[0]
          : '(tool-or-builtin)';
    const name = /^[\w.$<> ()-]{0,100}$/.test(node.callFrame.functionName)
      ? node.callFrame.functionName || '(anonymous)'
      : '(other)';
    return file + '::' + name;
  };
  const functions = new Map();
  let totalUs = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i],
      delta = profile.timeDeltas[i];
    assert(
      nodes.has(id) && Number.isSafeInteger(delta) && delta >= 0,
      JSON.stringify({ sample: i, node: id, known: nodes.has(id), delta }),
    );
    totalUs += delta;
    assert(
      Number.isSafeInteger(totalUs),
      'Bounded sampled interval total required',
    );
    let current = id;
    const seenIds = new Set(),
      seenLabels = new Set();
    while (current !== undefined) {
      assert(!seenIds.has(current), 'Acyclic profile ancestry required');
      seenIds.add(current);
      const name = label(nodes.get(current));
      const row = functions.get(name) ?? { name, selfUs: 0, inclusiveUs: 0 };
      if (current === id) row.selfUs += delta;
      if (!seenLabels.has(name)) row.inclusiveUs += delta;
      seenLabels.add(name);
      functions.set(name, row);
      current = parent.get(current);
    }
  }
  const rows = [...functions.values()].map((r) => ({
    name: r.name,
    selfMs: Math.round(r.selfUs / 10) / 100,
    inclusiveMs: Math.round(r.inclusiveUs / 10) / 100,
  }));
  return {
    samples: profile.samples.length,
    sampledTimeMs: Math.round(totalUs / 10) / 100,
    topSelf: rows.toSorted((a, b) => b.selfMs - a.selfMs).slice(0, 20),
    topInclusive: rows
      .toSorted((a, b) => b.inclusiveMs - a.inclusiveMs)
      .slice(0, 25),
    operating: rows
      .filter((r) =>
        r.name.startsWith('src/lib/workflows/operating-center-runtime.ts::'),
      )
      .toSorted((a, b) => b.inclusiveMs - a.inclusiveMs),
  };
}
