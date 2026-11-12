/**
 * Type definitions for ema-timeout.
 *
 * `require('ema-timeout').create(...)` and
 * `import { create } from 'ema-timeout'` are both supported.
 */

export interface EmaOptions {
    /** Baseline / average response time in ms. Must be >= 0. Default 60. */
    Tavg: number;
    /** High-water mark / timeout ceiling in ms. Must be > Tavg. Default 250. */
    Thwm: number;
    /** Maximum elastic time in ms. Must be >= Thwm. Default 500. */
    Tmax: number;
    /** Smoothing window in samples. Must be >= 1. Default 80. */
    N: number;
}

export interface EmaSnapshot {
    options: EmaOptions;
    ema: number;
    samples: number;
}

export interface EmaTimeout {
    /** Frozen, validated configuration. Read-only. */
    readonly options: Readonly<EmaOptions>;
    /** Current exponential moving average of observed latency (ms). */
    readonly ema: number;
    /** Smoothing factor, 2 / (N + 1). Recomputed when configuration changes. */
    readonly r: number;
    /** Number of samples fed since creation / last reset. */
    readonly samples: number;

    /**
     * Feed a latency sample in milliseconds. The first sample seeds the EMA
     * directly, avoiding cold-start bias.
     * @throws {TypeError} if x is not a finite number
     * @throws {RangeError} if x is negative
     */
    update(elapsedMs: number): number;

    /** Recommended timeout in ms, clamped to [0, Tmax]. */
    get(): number;

    /** Clear the running average, or warm-start it with a known EMA value. */
    reset(initialEma?: number): void;

    /**
     * Partially update configuration. The merged configuration is validated
     * before it is applied.
     */
    configure(patch: Partial<EmaOptions>): Readonly<EmaOptions>;

    /** Serializable snapshot. */
    toJSON(): EmaSnapshot;
}

/** Default configuration: `{ Tavg: 60, Thwm: 250, Tmax: 500, N: 80 }`. */
export const DEFAULTS: Readonly<EmaOptions>;

/**
 * Validate a (partial) configuration. Throws `RangeError` / `TypeError` on
 * invalid values. Useful for validating user-supplied config up front.
 */
export function validateConfig(config: EmaOptions): void;

/**
 * Create an independent timeout calculator.
 *
 * @example
 * const timeout = create({ Tavg: 55, Thwm: 300, Tmax: 500, N: 90 }).get();
 */
export function create(options?: Partial<EmaOptions>): EmaTimeout;
