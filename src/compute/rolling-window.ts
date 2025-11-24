/**
 * Rolling Window (Ring Buffer) for Time-Series Data
 * 
 * Efficient ring buffer implementation for storing time-series data
 * with automatic bucket management and aggregation.
 */

export interface Bucket<T> {
  timestamp: number;
  value: T;
}

export class RollingWindow<T> {
  private buckets: Array<Bucket<T> | null>;
  private bucketSizeMs: number;
  private bucketCount: number;
  private currentIndex: number;
  private lastBucketTime: number;
  private defaultValue: () => T;
  private aggregator: (a: T, b: T) => T;

  constructor(
    bucketSizeMs: number,
    bucketCount: number,
    defaultValue: () => T,
    aggregator: (a: T, b: T) => T
  ) {
    this.bucketSizeMs = bucketSizeMs;
    this.bucketCount = bucketCount;
    this.defaultValue = defaultValue;
    this.aggregator = aggregator;
    this.buckets = Array(bucketCount).fill(null);
    this.currentIndex = 0;
    this.lastBucketTime = Date.now();
  }

  /**
   * Add data to the current bucket
   */
  add(value: T, timestamp: number = Date.now()): void {
    this.advanceToTime(timestamp);
    this.mergeToBucket(this.currentIndex, value);
  }

  /**
   * Get aggregate over last N buckets
   */
  aggregate(bucketCount: number): T {
    const result = this.defaultValue();
    const now = Date.now();
    const cutoff = now - (bucketCount * this.bucketSizeMs);

    for (let i = 0; i < this.buckets.length; i++) {
      const bucket = this.buckets[i];
      if (bucket && bucket.timestamp >= cutoff) {
        return this.aggregator(result, bucket.value);
      }
    }

    return result;
  }

  /**
   * Get all buckets within time range
   */
  getRange(startTime: number, endTime: number): Array<Bucket<T>> {
    const result: Array<Bucket<T>> = [];

    for (const bucket of this.buckets) {
      if (bucket && bucket.timestamp >= startTime && bucket.timestamp <= endTime) {
        result.push(bucket);
      }
    }

    return result.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Clear all buckets
   */
  clear(): void {
    this.buckets = Array(this.bucketCount).fill(null);
    this.currentIndex = 0;
    this.lastBucketTime = Date.now();
  }


  /**
   * Advance time and clear old buckets
   */
  private advanceToTime(timestamp: number): void {
    const elapsed = timestamp - this.lastBucketTime;
    const bucketsToAdvance = Math.floor(elapsed / this.bucketSizeMs);

    if (bucketsToAdvance > 0) {
      // Clear buckets we're skipping
      for (let i = 1; i < Math.min(bucketsToAdvance, this.bucketCount); i++) {
        const idx = (this.currentIndex + i) % this.bucketCount;
        this.buckets[idx] = null;
      }

      this.currentIndex = (this.currentIndex + bucketsToAdvance) % this.bucketCount;
      this.lastBucketTime += bucketsToAdvance * this.bucketSizeMs;
    }
  }

  /**
   * Merge value into bucket
   */
  private mergeToBucket(index: number, value: T): void {
    const bucket = this.buckets[index];
    const now = Date.now();

    if (!bucket || bucket.timestamp < now - this.bucketSizeMs) {
      // Create new bucket
      this.buckets[index] = {
        timestamp: now,
        value: value,
      };
    } else {
      // Merge with existing bucket
      this.buckets[index] = {
        timestamp: bucket.timestamp,
        value: this.aggregator(bucket.value, value),
      };
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
// SPECIALIZED ROLLING WINDOWS
// ══════════════════════════════════════════════════════════════════════

export interface PriceBucket {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface VolumeBucket {
  buyVolume: number;
  sellVolume: number;
  totalVolume: number;
  tradeCount: number;
}

/**
 * Create a rolling window for price data
 */
export function createPriceWindow(
  bucketSizeMs: number,
  bucketCount: number
): RollingWindow<PriceBucket> {
  return new RollingWindow<PriceBucket>(
    bucketSizeMs,
    bucketCount,
    () => ({ open: 0, high: 0, low: Infinity, close: 0, volume: 0 }),
    (a, b) => ({
      open: a.open || b.open,
      high: Math.max(a.high, b.high),
      low: Math.min(a.low, b.low),
      close: b.close || a.close,
      volume: a.volume + b.volume,
    })
  );
}

/**
 * Create a rolling window for volume data
 */
export function createVolumeWindow(
  bucketSizeMs: number,
  bucketCount: number
): RollingWindow<VolumeBucket> {
  return new RollingWindow<VolumeBucket>(
    bucketSizeMs,
    bucketCount,
    () => ({ buyVolume: 0, sellVolume: 0, totalVolume: 0, tradeCount: 0 }),
    (a, b) => ({
      buyVolume: a.buyVolume + b.buyVolume,
      sellVolume: a.sellVolume + b.sellVolume,
      totalVolume: a.totalVolume + b.totalVolume,
      tradeCount: a.tradeCount + b.tradeCount,
    })
  );
}

