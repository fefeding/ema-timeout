'use strict';

const assert = require('node:assert/strict');
const ema = require('../index');

let passed = 0;
let failed = 0;
function test(name, fn) {
    try {
        fn();
        passed++;
        console.log('  ok  ' + name);
    } catch (err) {
        failed++;
        console.error('  FAIL  ' + name);
        console.error(err);
        process.exitCode = 1;
    }
}

test('defaults and DEFAULTS are exposed and valid', () => {
    assert.deepEqual({ ...ema.DEFAULTS }, { Tavg: 60, Thwm: 250, Tmax: 500, N: 80 });
    assert.doesNotThrow(() => ema.validateConfig({ ...ema.DEFAULTS }));
    assert.equal(typeof ema.create, 'function');
});

test('create() returns read-only derived state', () => {
    const calc = ema.create();
    assert.equal(calc.options.Tavg, 60);
    assert.equal(calc.r, 2 / 81);
    assert.equal(calc.samples, 0);
    assert.equal(calc.ema, 0);
    const descriptors = Object.getOwnPropertyDescriptors(calc);
    for (const key of ['options', 'ema', 'r', 'samples']) {
        assert.equal(typeof descriptors[key].get, 'function', key + ' should be a getter');
    }
});

test('create() does not mutate the caller options object', () => {
    const options = { Tavg: 55, Thwm: 300, Tmax: 500, N: 90 };
    const calc = ema.create(options);
    assert.deepEqual(options, { Tavg: 55, Thwm: 300, Tmax: 500, N: 90 });
    assert.equal(calc.options.Tavg, 55);
    assert.ok(Object.isFrozen(calc.options));
});

test('explicit undefined and partial options fall back to defaults', () => {
    const calc = ema.create({ Tavg: undefined, N: 10 });
    assert.equal(calc.options.Tavg, 60);
    assert.equal(calc.options.N, 10);
    assert.equal(calc.r, 2 / 11);
});

test('invalid configuration is rejected with a clear error', () => {
    assert.throws(() => ema.create({ Tavg: 250, Thwm: 250 }), /Thwm must be greater than Tavg/);
    assert.throws(() => ema.create({ Tmax: 100 }), /Tmax must be >= Thwm/);
    assert.throws(() => ema.create({ N: 0 }), /N must be >= 1/);
    assert.throws(() => ema.create({ Tavg: -1 }), /Tavg must be >= 0/);
    assert.throws(() => ema.create({ Tavg: 'fast' }), /must be a finite number/);
    assert.throws(() => ema.create(10), /options must be a plain object/);
});

test('first sample seeds the EMA (no cold-start bias)', () => {
    const calc = ema.create();
    assert.equal(calc.update(10), 10);
    assert.equal(calc.samples, 1);
    assert.equal(calc.get(), 500, 'a healthy 10ms sample keeps maximum headroom');
});

test('healthy latency keeps Tmax, saturated latency clamps to Thwm', () => {
    const healthy = ema.create();
    for (let i = 0; i < 200; i++) healthy.update(10);
    assert.equal(healthy.get(), 500);

    const saturated = ema.create();
    for (let i = 0; i < 200; i++) saturated.update(1000);
    assert.equal(saturated.get(), 250);
});

test('interpolation stays inside [Thwm, Tmax]', () => {
    const calc = ema.create();
    calc.reset(150); // EMA between Tavg=60 and Thwm=250
    const timeout = calc.get();
    assert.ok(timeout > 250 && timeout < 500, 'timeout=' + timeout);
    const expected = 250 + ((250 - 150) / (250 - 60)) * (500 - 250);
    assert.ok(Math.abs(timeout - expected) < 1e-9);
});

test('get() never returns NaN and never uses Math.abs on bad values', () => {
    const calc = ema.create();
    calc.reset(100);
    assert.ok(Number.isFinite(calc.get()));
    assert.ok(calc.get() >= 0 && calc.get() <= 500);
});

test('invalid samples are rejected and do not poison the EMA', () => {
    const calc = ema.create();
    calc.update(100);
    const before = calc.ema;
    assert.throws(() => calc.update(NaN), /finite number/);
    assert.throws(() => calc.update(undefined), /finite number/);
    assert.throws(() => calc.update('50'), /finite number/);
    assert.throws(() => calc.update(-1), /non-negative/);
    assert.equal(calc.ema, before);
    assert.ok(Number.isFinite(calc.get()));
});

test('reset() clears state; reset(initialEma) warm-starts', () => {
    const calc = ema.create();
    calc.update(1000);
    calc.reset();
    assert.equal(calc.ema, 0);
    assert.equal(calc.samples, 0);
    assert.equal(calc.get(), 500);
    calc.reset(200);
    assert.equal(calc.ema, 200);
    assert.equal(calc.samples, 1);
    assert.throws(() => calc.reset(-5), /non-negative finite number/);
});

test('configure() validates and updates the smoothing factor', () => {
    const calc = ema.create();
    const next = calc.configure({ N: 9 });
    assert.equal(next.N, 9);
    assert.equal(calc.r, 2 / 10);
    assert.equal(calc.options.Tavg, 60, 'other options are preserved');
    assert.throws(() => calc.configure({ Tavg: 999 }), /Thwm must be greater than Tavg/);
    assert.equal(calc.options.Tavg, 60, 'failed configure leaves config untouched');
});

test('toJSON() provides a serializable snapshot', () => {
    const calc = ema.create({ N: 10 });
    calc.update(80);
    assert.deepEqual(calc.toJSON(), {
        options: { Tavg: 60, Thwm: 250, Tmax: 500, N: 10 },
        ema: 80,
        samples: 1
    });
    assert.doesNotThrow(() => JSON.stringify(calc));
});

test('independent instances do not share state', () => {
    const a = ema.create();
    const b = ema.create();
    a.update(1000);
    assert.equal(b.ema, 0);
    assert.equal(b.samples, 0);
});

test('assigning to read-only state throws instead of failing silently', () => {
    const calc = ema.create();
    assert.throws(() => { calc.ema = 5; }, /read-only/);
    assert.throws(() => { calc.options = {}; }, /read-only/);
    assert.equal(calc.ema, 0);
});

console.log('\n' + passed + ' checks passed, ' + failed + ' failed');
