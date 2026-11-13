// Offline differential proof only; never an application or authority adapter.
import assert from 'node:assert/strict';
import ts from 'typescript';
function compile(source) {
  const output = ts.transpileModule(source + '\nreturn dataSignature;', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(output)();
}
export function compareSignatures(original, proposed) {
  const old = compile(original),
    next = compile(proposed);
  let passed = 0;
  const results = [];
  function check(name, factory) {
    const run = (fn) => {
      const log = [];
      const value = factory(log);
      try {
        return { ok: true, value: fn(value), log };
      } catch (e) {
        return { ok: false, error: e.message, log };
      }
    };
    const a = run(old),
      b = run(next);
    assert.equal(b.ok, a.ok, name + ' acceptance');
    if (a.ok) assert.equal(b.value, a.value, name + ' signature');
    assert.deepEqual(b.log, a.log, name + ' side effects');
    results.push({
      name,
      status: 'PASS',
      accepted: a.ok,
      ...(!a.ok ? { oldError: a.error, newError: b.error } : {}),
    });
    passed++;
  }
  const cases = [
    null,
    undefined,
    true,
    false,
    0,
    -0,
    Number.MAX_SAFE_INTEGER,
    1e100,
    NaN,
    Infinity,
    1n,
    Symbol('x'),
    () => 0,
    'a\u0000\ud800雪',
    [],
    [undefined, null, 1],
    { b: undefined, a: 'quote"\\' },
    Object.assign(Object.create(null), { x: 1 }),
    JSON.parse('{"__proto__":{"x":1},"constructor":2}'),
  ];
  cases.forEach((v, i) => check('primitive/plain ' + i, () => v));
  check('getter never invoked', (log) =>
    Object.defineProperty({}, 'x', {
      enumerable: true,
      get() {
        log.push('GET');
        return 1;
      },
    }),
  );
  check('array index getter never invoked', (log) =>
    Object.defineProperty([0], '0', {
      get() {
        log.push('GET');
        return 1;
      },
    }),
  );
  check('toJSON never invoked', (log) => ({
    toJSON() {
      log.push('TOJSON');
      return 1;
    },
  }));
  check('valueOf never invoked', (log) => ({
    valueOf() {
      log.push('VALUEOF');
      return 1;
    },
  }));
  check('inherited custom prototype', () => Object.create({ x: 1 }));
  check('date rejected', () => new Date(0));
  check('sparse rejected', () => Array(2));
  check('array custom rejected', () => Object.assign([1], { extra: 2 }));
  check('nonenumerable data retained', () =>
    Object.defineProperty({}, 'x', { value: 2 }),
  );
  check('symbols rejected', () => ({ [Symbol('x')]: 1 }));
  check('cycle rejected', () => {
    const v = {};
    v.self = v;
    return v;
  });
  check('shared acyclic allowed', () => {
    const v = { a: 1 };
    return { x: v, y: v };
  });
  for (const array of [false, true])
    for (const mode of [
      'stable',
      'reorder',
      'remove',
      'add',
      'throwDescriptor',
      'throwKeys',
      'revoke',
    ])
      check('proxy ' + array + ' ' + mode, (log) => {
        const target = array ? [1, 2] : { a: 1, b: 2 };
        let keysCalls = 0;
        let revoke;
        const handler = {
          getPrototypeOf(t) {
            log.push('proto');
            return Reflect.getPrototypeOf(t);
          },
          ownKeys(t) {
            log.push('keys');
            keysCalls++;
            const keys = Reflect.ownKeys(t);
            if (mode === 'throwKeys') throw Error('keys failed');
            if (mode === 'reorder' && keysCalls === 2)
              return [...keys].reverse();
            if (mode === 'remove' && keysCalls === 2 && !array)
              return keys.slice(0, 1);
            if (mode === 'add' && keysCalls === 2 && !array)
              return [...keys, 'newKey'];
            return keys;
          },
          getOwnPropertyDescriptor(t, k) {
            log.push('desc:' + String(k));
            if (mode === 'throwDescriptor') throw Error('descriptor failed');
            const d = Reflect.getOwnPropertyDescriptor(t, k);
            if (mode === 'revoke' && k === (array ? '1' : 'b')) revoke();
            return d;
          },
          get(t, k, r) {
            log.push('get:' + String(k));
            return Reflect.get(t, k, r);
          },
        };
        const p = Proxy.revocable(target, handler);
        revoke = p.revoke;
        return p.proxy;
      });
  let seed = 90437;
  const rnd = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  function random(depth = 0) {
    const n = Math.floor(rnd() * (depth > 3 ? 6 : 8));
    switch (n) {
      case 0:
        return undefined;
      case 1:
        return null;
      case 2:
        return rnd() > 0.5;
      case 3:
        return rnd() * 1e12;
      case 4:
        return ['x', '__proto__', '\u0000', 'a"\\雪'][Math.floor(rnd() * 4)];
      case 5:
        return -0;
      case 6:
        return Array.from({ length: Math.floor(rnd() * 7) }, () =>
          random(depth + 1),
        );
      default: {
        const o = Object.create(rnd() > 0.5 ? null : Object.prototype);
        for (let i = 0; i < Math.floor(rnd() * 8); i++)
          Object.defineProperty(
            o,
            ['a', 'b', '0', '02', '__proto__', 'constructor', '☃'][i],
            {
              value: random(depth + 1),
              enumerable: rnd() > 0.5,
              configurable: true,
            },
          );
        return o;
      }
    }
  }
  for (let i = 0; i < 3000; i++) {
    const v = random();
    check('generated ' + i, () => v);
  }
  const mutable = { x: 1 };
  assert.equal(next(mutable), old(mutable));
  mutable.x = 2;
  assert.equal(next(mutable), old(mutable));
  assert.notEqual(next(mutable), '{"x":1}');
  return {
    passed,
    mutationFreshness: 'PASS',
    knownErrorClassDifferences: results
      .filter((x) => x.oldError !== x.newError)
      .map(({ name, oldError, newError }) => ({ name, oldError, newError })),
  };
}
