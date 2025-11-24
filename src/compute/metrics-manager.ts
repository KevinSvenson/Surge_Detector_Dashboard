/**
 * Metrics Manager
 * 
 * Manages derived metrics computation and storage.
 */

import type { UnifiedMarket, UnifiedTrade } from "../types/unified.js";
import type { DerivedMetrics } from "../types/unified.js";
import { calculateDerivedMetrics, type MetricsContext } from "./derived-metrics.js";
import {
  createPriceWindow,
  createVolumeWindow,
  type PriceBucket,
  type VolumeBucket,
} from "./rolling-window.js";
import { getConfig } from "../utils/config.js";
import { logger } from "../utils/logger.js";

export class MetricsManager {
  private metrics: Map<string, DerivedMetrics> = new Map();
  private contexts: Map<string, MetricsContext> = new Map();
  private computeInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize metrics context for a market
   */
  initializeMarket(market: UnifiedMarket): void {
    const context: MetricsContext = {
      market,
      priceWindow1m: createPriceWindow(1000, 60), // 1 minute
      priceWindow5m: createPriceWindow(1000, 300), // 5 minutes
      priceWindow15m: createPriceWindow(1000, 900), // 15 minutes
      priceWindow1h: createPriceWindow(1000, 3600), // 1 hour
      volumeWindow1m: createVolumeWindow(1000, 60),
      volumeWindow5m: createVolumeWindow(1000, 300),
      volumeWindow15m: createVolumeWindow(1000, 900),
      volumeWindow1h: createVolumeWindow(1000, 3600),
    };

    this.contexts.set(market.id, context);
  }

  /**
   * Update market data in rolling windows
   */
  updateMarket(market: UnifiedMarket): void {
    const context = this.contexts.get(market.id);
    if (!context) {
      this.initializeMarket(market);
      return;
    }

    // Update price windows
    const priceBucket: PriceBucket = {
      open: market.lastPrice,
      high: market.lastPrice,
      low: market.lastPrice,
      close: market.lastPrice,
      volume: 0,
    };

    context.priceWindow1m.add(priceBucket);
    context.priceWindow5m.add(priceBucket);
    context.priceWindow15m.add(priceBucket);
    context.priceWindow1h.add(priceBucket);

    // Update context market reference
    context.market = market;
  }

  /**
   * Update trade data in rolling windows
   */
  updateTrade(trade: UnifiedTrade): void {
    const context = this.contexts.get(trade.id.split(":")[0] + ":" + trade.symbol);
    if (!context) {
      return;
    }

    const volumeBucket: VolumeBucket = {
      buyVolume: trade.side === "buy" ? trade.quoteQuantity : 0,
      sellVolume: trade.side === "sell" ? trade.quoteQuantity : 0,
      totalVolume: trade.quoteQuantity,
      tradeCount: 1,
    };

    context.volumeWindow1m.add(volumeBucket);
    context.volumeWindow5m.add(volumeBucket);
    context.volumeWindow15m.add(volumeBucket);
    context.volumeWindow1h.add(volumeBucket);
  }

  /**
   * Compute all metrics
   */
  computeAll(): void {
    const startTime = Date.now();

    for (const [id, context] of this.contexts.entries()) {
      try {
        const metrics = calculateDerivedMetrics(context);
        this.metrics.set(id, metrics);
      } catch (error) {
        logger.error("Failed to compute metrics", error as Error, { marketId: id });
      }
    }

    const duration = Date.now() - startTime;
    logger.debug("Computed metrics", {
      count: this.metrics.size,
      durationMs: duration,
    });
  }

  /**
   * Get metrics for a market
   */
  get(marketId: string): DerivedMetrics | undefined {
    return this.metrics.get(marketId);
  }

  /**
   * Get all metrics
   */
  getAll(): Map<string, DerivedMetrics> {
    return new Map(this.metrics);
  }

  /**
   * Start periodic computation
   */
  start(): void {
    const config = getConfig();
    const intervalMs = config.compute.derivedMetricsIntervalMs;

    // Compute immediately
    this.computeAll();

    // Then compute periodically
    this.computeInterval = setInterval(() => {
      this.computeAll();
    }, intervalMs);

    logger.info("Metrics computation started", { intervalMs });
  }

  /**
   * Stop periodic computation
   */
  stop(): void {
    if (this.computeInterval) {
      clearInterval(this.computeInterval);
      this.computeInterval = null;
    }
  }
}

