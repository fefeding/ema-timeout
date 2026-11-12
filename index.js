'use strict';

/**
 * ema-timeout
 *
 * Adaptive request timeout based on an Exponential Moving Average (EMA) of
 * observed response times. The healthier the average, the more headroom a
 * single slow request gets; the worse the average, the sooner it fails.
 *
 * Constraints: Tmax >= Thwm > Tavg >= 0 and N >= 1.
 */

const DEFAULTS = Object.freeze({ Tavg: 60, Thwm: 250, Tmax: 500, N: 80 });

function readNumber(value, name, fallback) {
    if (value == null) return fallback;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError('ema-timeout: ' + name + ' must be a finite number');
    }
    return value;
}

function buildConfig(source) {
    const config = Object.freeze({
        Tavg: readNumber(source.Tavg, 'Tavg', DEFAULTS.Tavg),
        Thwm: readNumber(source.Thwm, 'Thwm', DEFAULTS.Thwm),
        Tmax: readNumber(source.Tmax, 'Tmax', DEFAULTS.Tmax),
        N: readNumber(source.N, 'N', DEFAULTS.N)
    });
    validateConfig(config);
    return config;
}

function validateConfig(config) {
    if (config.Tavg < 0) throw new RangeError('ema-timeout: Tavg must be >= 0');
    if (config.Thwm <= config.Tavg) {
        throw new RangeError('ema-timeout: Thwm must be greater than Tavg so the interpolation interval is valid');
    }
    if (config.Tmax < config.Thwm) {
        throw new RangeError('ema-timeout: Tmax must be >= Thwm so a healthy service gets more headroom');
    }
    if (config.N < 1) {
        throw new RangeError('ema-timeout: N must be >= 1 (smoothing factor is 2 / (N + 1))');
    }
}

/**
 * Create an independent timeout calculator.
 *
 * The returned object exposes read-only state (`options`, `ema`, `r`,
 * `samples`) so callers cannot corrupt the running average. Use `reset()` or
 * `configure()` to change it deliberately.
 *
 * @param {object} [options] partial { Tavg, Thwm, Tmax, N }
 * @returns {object} calculator
 */
function create(options) {
    if (options != null && (typeof options !== 'object' || Array.isArray(options))) {
        throw new TypeError('ema-timeout: options must be a plain object');
    }
    let config = buildConfig(options || {});

    let ema = 0;
    let samples = 0;
    let seeded = false;

    const instance = {
        /**
         * Feed the elapsed time of the latest request, in milliseconds.
         * The first sample seeds the EMA directly (no cold-start bias).
         * @param {number} x non-negative finite latency in ms
         * @returns {number} the updated EMA
         */
        update(x) {
            if (typeof x !== 'number' || !Number.isFinite(x)) {
                throw new TypeError('ema-timeout: update(x) requires a finite number');
            }
            if (x < 0) {
                throw new RangeError('ema-timeout: update(x) requires a non-negative latency');
            }
            if (!seeded) {
                ema = x;
                seeded = true;
                samples = 1;
                return ema;
            }
            const r = 2 / (config.N + 1);
            ema = x * r + ema * (1 - r);
            samples++;
            return ema;
        },

        /** @returns {number} recommended timeout in ms, clamped to [0, Tmax] */
        get() {
            const { Tavg, Thwm, Tmax } = config;
            let tdto;
            if (ema <= Tavg) {
                tdto = Tmax;
            } else if (ema >= Thwm) {
                tdto = Thwm;
            } else {
                const p = (Thwm - ema) / (Thwm - Tavg);
                tdto = Thwm + p * (Tmax - Thwm);
            }
            if (!Number.isFinite(tdto)) return Tmax;
            // Explicit clamp instead of Math.abs: never hide a bad value.
            return Math.min(Tmax, Math.max(0, tdto));
        },

        /**
         * Clear the running average. Pass an initial EMA to warm-start a new
         * calculator from a known latency.
         * @param {number} [initialEma]
         */
        reset(initialEma) {
            if (initialEma == null) {
                ema = 0;
                samples = 0;
                seeded = false;
                return;
            }
            if (typeof initialEma !== 'number' || !Number.isFinite(initialEma) || initialEma < 0) {
                throw new RangeError('ema-timeout: reset(initialEma) requires a non-negative finite number');
            }
            ema = initialEma;
            samples = 1;
            seeded = true;
        },

        /**
         * Update configuration in place. Validates the merged result first and
         * recomputes the smoothing factor on the next update.
         * @param {object} patch partial { Tavg, Thwm, Tmax, N }
         * @returns {object} the new frozen configuration
         */
        configure(patch) {
            if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
                throw new TypeError('ema-timeout: configure(patch) requires a plain object');
            }
            const next = buildConfig({
                Tavg: patch.Tavg == null ? config.Tavg : patch.Tavg,
                Thwm: patch.Thwm == null ? config.Thwm : patch.Thwm,
                Tmax: patch.Tmax == null ? config.Tmax : patch.Tmax,
                N: patch.N == null ? config.N : patch.N
            });
            config = next;
            return config;
        },

        /** Serializable snapshot for persistence / observability. */
        toJSON() {
            return { options: { ...config }, ema, samples };
        }
    };

    // A setter that throws makes an accidental write fail loudly instead of
    // being silently ignored in non-strict consumer code.
    const readOnly = (name, get) => ({
        get,
        set() {
            throw new TypeError('ema-timeout: ' + name + ' is read-only; use reset() or configure()');
        },
        enumerable: true
    });
    Object.defineProperties(instance, {
        options: readOnly('options', () => config),
        ema: readOnly('ema', () => ema),
        r: readOnly('r', () => 2 / (config.N + 1)),
        samples: readOnly('samples', () => samples)
    });

    return instance;
}

exports.create = create;
exports.DEFAULTS = DEFAULTS;
exports.validateConfig = validateConfig;
