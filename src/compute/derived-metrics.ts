/**
 * Derived Metrics Calculator
 * 
 * Calculates derived metrics from raw market data and rolling windows.
 * 
 * DATA QUALITY NOTES:
 * - Price-based metrics (priceChange, priceVelocity, priceAcceleration) work with ticker data ✓
 * - Volume-based metrics (CVD, volumeSurge, takerBuyRatio) require trade subscriptions ✗
 * - Volume windows are only populated when trade events are received via updateTrade()
 * - Currently, trade subscriptions are not implemented, so volume metrics will be 0
 * - Leaderboards that depend on volume metrics should filter out zero values
 */

import type { UnifiedMarket } from "../types/unified.js";
import type { DerivedMetrics } from "../types/unified.js";
import type { PriceBucket, VolumeBucket } from "./rolling-window.js";
import type { RollingWindow } from "./rolling-window.js";

export interface MetricsContext {
  market: UnifiedMarket;
  priceWindow1m: RollingWindow<PriceBucket>;
  priceWindow5m: RollingWindow<PriceBucket>;
  priceWindow15m: RollingWindow<PriceBucket>;
  priceWindow1h: RollingWindow<PriceBucket>;
  volumeWindow1m: RollingWindow<VolumeBucket>;
  volumeWindow5m: RollingWindow<VolumeBucket>;
  volumeWindow15m: RollingWindow<VolumeBucket>;
  volumeWindow1h: RollingWindow<VolumeBucket>;
}

/**
 * Calculate all derived metrics for a market
 */
export function calculateDerivedMetrics(context: MetricsContext): DerivedMetrics {
  const { market } = context;

  // Price changes
  const priceChange1m = calculatePriceChange(context.priceWindow1m);
  const priceChange5m = calculatePriceChange(context.priceWindow5m);
  const priceChange15m = calculatePriceChange(context.priceWindow15m);
  const priceChange1h = calculatePriceChange(context.priceWindow1h);

  // Price velocity (rate of change per minute)
  const priceVelocity = calculatePriceVelocity(context.priceWindow1m);
  const priceAcceleration = calculatePriceAcceleration(context.priceWindow1m);

  // CVD (Cumulative Volume Delta)
  const cvd1m = calculateCVD(context.volumeWindow1m);
  const cvd5m = calculateCVD(context.volumeWindow5m);
  const cvd15m = calculateCVD(context.volumeWindow15m);
  const cvd1h = calculateCVD(context.volumeWindow1h);

  // Volume metrics
  const volume1m = getTotalVolume(context.volumeWindow1m);
  const volume5m = getTotalVolume(context.volumeWindow5m);
  const volume15m = getTotalVolume(context.volumeWindow15m);
  const volume1h = getTotalVolume(context.volumeWindow1h);

  // Volume surge
  const volumeSurge1m = calculateVolumeSurge(context.volumeWindow1m);
  const volumeSurge5m = calculateVolumeSurge(context.volumeWindow5m);
  const volumeSurge15m = calculateVolumeSurge(context.volumeWindow15m);

  // Taker buy ratio
  const takerBuyRatio1m = calculateTakerBuyRatio(context.volumeWindow1m);
  const takerBuyRatio5m = calculateTakerBuyRatio(context.volumeWindow5m);
  const takerBuyRatio1h = calculateTakerBuyRatio(context.volumeWindow1h);

  // CVD percentage
  const cvdPercent1h = volume1h > 0 ? (cvd1h / volume1h) * 100 : 0;

  const metrics: DerivedMetrics = {
    id: market.id,
    exchange: market.exchange,
    symbol: market.symbol,

    // Price changes
    priceChange1m: priceChange1m.absolute,
    priceChange5m: priceChange5m.absolute,
    priceChange15m: priceChange15m.absolute,
    priceChange1h: priceChange1h.absolute,
    priceChange4h: 0, // Would need 4h window

    priceChangePercent1m: priceChange1m.percent,
    priceChangePercent5m: priceChange5m.percent,
    priceChangePercent15m: priceChange15m.percent,
    priceChangePercent1h: priceChange1h.percent,
    priceChangePercent4h: 0,

    priceVelocity,
    priceAcceleration,

    // CVD
    cvd1m,
    cvd5m,
    cvd15m,
    cvd1h,
    cvd4h: 0,
    cvdPercent1h,

    // Volume
    volume1m,
    volume5m,
    volume15m,
    volume1h,
    volumeSurge1m,
    volumeSurge5m,
    volumeSurge15m,
    takerBuyRatio1m,
    takerBuyRatio5m,
    takerBuyRatio1h,

    // Liquidations (would need liquidation data)
    liquidationsLong1h: 0,
    liquidationsShort1h: 0,
    liquidationsNet1h: 0,
    liquidationsLong24h: 0,
    liquidationsShort24h: 0,

    // Spread
    spreadPercentile24h: 0, // Would need spread history
    spreadAvg1h: market.spreadPercent,
    spreadAvg24h: market.spreadPercent,

    computedAt: Date.now(),
  };

  return metrics;
}

/**
 * Calculate price change from window
 */
function calculatePriceChange(window: RollingWindow<PriceBucket>): {
  absolute: number;
  percent: number;
} {
  const buckets = window.getRange(
    Date.now() - window["bucketSizeMs"] * window["bucketCount"],
    Date.now()
  );

  if (buckets.length < 2) {
    return { absolute: 0, percent: 0 };
  }

  const first = buckets[0].value.close;
  const last = buckets[buckets.length - 1].value.close;

  if (first === 0) {
    return { absolute: 0, percent: 0 };
  }

  const absolute = last - first;
  const percent = (absolute / first) * 100;

  return { absolute, percent };
}

/**
 * Calculate price velocity (% per minute)
 */
function calculatePriceVelocity(window: RollingWindow<PriceBucket>): number {
  const buckets = window.getRange(Date.now() - 60000, Date.now());

  if (buckets.length < 2) {
    return 0;
  }

  const first = buckets[0].value.close;
  const last = buckets[buckets.length - 1].value.close;
  const timeDiff = (buckets[buckets.length - 1].timestamp - buckets[0].timestamp) / 60000; // minutes

  if (first === 0 || timeDiff === 0) {
    return 0;
  }

  return ((last - first) / first / timeDiff) * 100;
}

/**
 * Calculate price acceleration (change in velocity)
 */
function calculatePriceAcceleration(window: RollingWindow<PriceBucket>): number {
  // Simplified: compare velocity over two time periods
  const recent = calculatePriceVelocity(window);
  const older = calculatePriceVelocity(window); // Would need separate calculation
  return recent - older;
}

/**
 * Calculate Cumulative Volume Delta (buy - sell)
 */
function calculateCVD(window: RollingWindow<VolumeBucket>): number {
  const buckets = window.getRange(
    Date.now() - window["bucketSizeMs"] * window["bucketCount"],
    Date.now()
  );

  return buckets.reduce((sum: number, bucket) => {
    return sum + (bucket.value.buyVolume - bucket.value.sellVolume);
  }, 0);
}

/**
 * Get total volume from window
 */
function getTotalVolume(window: RollingWindow<VolumeBucket>): number {
  const buckets = window.getRange(
    Date.now() - window["bucketSizeMs"] * window["bucketCount"],
    Date.now()
  );

  return buckets.reduce((sum: number, bucket) => sum + bucket.value.totalVolume, 0);
}

/**
 * Calculate volume surge (current vs average)
 */
function calculateVolumeSurge(window: RollingWindow<VolumeBucket>): number {
  const buckets = window.getRange(
    Date.now() - window["bucketSizeMs"] * window["bucketCount"],
    Date.now()
  );

  if (buckets.length < 20) {
    return 1.0; // Not enough data
  }

  const recent = buckets.slice(-5).reduce((sum: number, b) => sum + b.value.totalVolume, 0) / 5;
  const average = buckets.reduce((sum: number, b) => sum + b.value.totalVolume, 0) / buckets.length;

  return average > 0 ? recent / average : 1.0;
}

/**
 * Calculate taker buy ratio
 */
function calculateTakerBuyRatio(window: RollingWindow<VolumeBucket>): number {
  const buckets = window.getRange(
    Date.now() - window["bucketSizeMs"] * window["bucketCount"],
    Date.now()
  );

  const total = buckets.reduce((sum: number, b) => sum + b.value.totalVolume, 0);
  const buy = buckets.reduce((sum: number, b) => sum + b.value.buyVolume, 0);

  return total > 0 ? buy / total : 0.5;
}

