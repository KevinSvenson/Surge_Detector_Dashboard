/**
 * Enhanced Leaderboard Store
 * 
 * Manages 16+ leaderboard types with derived metrics support.
 */

import type { UnifiedMarket } from "../types/unified.js";
import type { DerivedMetrics } from "../types/unified.js";
import type {
  Leaderboard,
  LeaderboardEntry,
  LeaderboardName,
} from "../types/internal.js";

export class EnhancedLeaderboardStore {
  private leaderboards: Map<LeaderboardName, LeaderboardEntry[]> = new Map();

  /**
   * Update all leaderboards based on current market data and metrics.
   */
  update(markets: UnifiedMarket[], metrics: Map<string, DerivedMetrics>): void {

    // Price leaderboards
    this.updateGainers1h(markets);
    this.updateLosers1h(markets);
    this.updateMomentumHighest(markets, metrics);
    this.updateMomentumLowest(markets, metrics);

    // Volume leaderboards
    this.updateVolume24h(markets);
    this.updateVolumeSurge(markets, metrics);
    this.updateActivityHighest(markets, metrics);

    // Funding leaderboards
    this.updateFundingHighest(markets);
    this.updateFundingLowest(markets);
    this.updateFundingExtreme(markets);

    // OI leaderboards
    this.updateOIHighest(markets);

    // Liquidity leaderboards
    this.updateSpreadTightest(markets);
    this.updateSpreadWidest(markets);

    // Volatility leaderboards
    this.updateVolatilityHighest(markets, metrics);
    this.updateVolatilityLowest(markets, metrics);

    // Signal leaderboards
    this.updatePumping(markets, metrics);
    this.updateDumping(markets, metrics);
  }

  /**
   * Get a leaderboard by name.
   */
  get(name: LeaderboardName, limit: number = 100): LeaderboardEntry[] {
    const entries = this.leaderboards.get(name) || [];
    return entries.slice(0, limit);
  }

  /**
   * Get full leaderboard with metadata.
   */
  getLeaderboard(name: LeaderboardName, limit: number = 100): Leaderboard {
    const entries = this.get(name, limit);
    const allEntries = this.leaderboards.get(name) || [];

    return {
      name,
      entries,
      updatedAt: Date.now(),
      totalCount: allEntries.length,
    };
  }

  /**
   * Get all available leaderboard names.
   */
  getAvailableLeaderboards(): LeaderboardName[] {
    return Array.from(this.leaderboards.keys());
  }

  // ══════════════════════════════════════════════════════════════════════
  // PRICE LEADERBOARDS
  // ══════════════════════════════════════════════════════════════════════

  private updateGainers1h(markets: UnifiedMarket[]): void {
    const entries = this.createEntries(
      markets.filter((m) => (m.priceChangePercent24h || 0) > 0),
      (m) => m.priceChangePercent24h || 0,
      (a, b) => b.value - a.value
    );
    this.leaderboards.set("gainers_1h", entries);
  }

  private updateLosers1h(markets: UnifiedMarket[]): void {
    const entries = this.createEntries(
      markets.filter((m) => (m.priceChangePercent24h || 0) < 0),
      (m) => Math.abs(m.priceChangePercent24h || 0),
      (a, b) => b.value - a.value
    );
    this.leaderboards.set("losers_1h", entries);
  }

  private updateMomentumHighest(
    markets: UnifiedMarket[],
    metrics: Map<string, DerivedMetrics>
  ): void {
    const entries = this.createEntriesWithMetrics(
      markets,
      metrics,
      (m) => m.priceVelocity || 0,
      (a, b) => b.value - a.value
    );
    this.leaderboards.set("momentum_highest", entries);
  }

  private updateMomentumLowest(
    markets: UnifiedMarket[],
    metrics: Map<string, DerivedMetrics>
  ): void {
    const entries = this.createEntriesWithMetrics(
      markets,
      metrics,
      (m) => m.priceVelocity || 0,
      (a, b) => a.value - b.value
    );
    this.leaderboards.set("momentum_lowest", entries);
  }

  // ══════════════════════════════════════════════════════════════════════
  // VOLUME LEADERBOARDS
  // ══════════════════════════════════════════════════════════════════════

  private updateVolume24h(markets: UnifiedMarket[]): void {
    const entries = this.createEntries(
      markets.filter((m) => m.volume24hUsd > 0),
      (m) => m.volume24hUsd,
      (a, b) => b.value - a.value
    );
    this.leaderboards.set("volume_24h", entries);
  }

  private updateVolumeSurge(
    markets: UnifiedMarket[],
    metrics: Map<string, DerivedMetrics>
  ): void {
    const entries = this.createEntriesWithMetrics(
      markets,
      metrics,
      (m) => m.volumeSurge15m || 1.0,
      (a, b) => b.value - a.value
    );
    this.leaderboards.set("volume_surge", entries);
  }

  private updateActivityHighest(
    markets: UnifiedMarket[],
    metrics: Map<string, DerivedMetrics>
  ): void {
    // Activity = volume * price change magnitude
    const entries = this.createEntriesWithMetrics(
      markets,
      metrics,
      (m) => (m.volume1h || 0) * Math.abs(m.priceChangePercent1h || 0),
      (a, b) => b.value - a.value
    );
    this.leaderboards.set("activity_highest", entries);
  }

  // ══════════════════════════════════════════════════════════════════════
  // FUNDING LEADERBOARDS
  // ══════════════════════════════════════════════════════════════════════

  private updateFundingHighest(markets: UnifiedMarket[]): void {
    const entries = this.createEntries(
      markets.filter((m) => m.fundingRateAnnualized !== null),
      (m) => m.fundingRateAnnualized || 0,
      (a, b) => b.value - a.value
    );
    this.leaderboards.set("funding_highest", entries);
  }

  private updateFundingLowest(markets: UnifiedMarket[]): void {
    const entries = this.createEntries(
      markets.filter((m) => m.fundingRateAnnualized !== null),
      (m) => m.fundingRateAnnualized || 0,
      (a, b) => a.value - b.value
    );
    this.leaderboards.set("funding_lowest", entries);
  }

  private updateFundingExtreme(markets: UnifiedMarket[]): void {
    const entries = this.createEntries(
      markets.filter((m) => m.fundingRateAnnualized !== null),
      (m) => Math.abs(m.fundingRateAnnualized || 0),
      (a, b) => b.value - a.value
    );
    this.leaderboards.set("funding_extreme", entries);
  }

  // ══════════════════════════════════════════════════════════════════════
  // OI LEADERBOARDS
  // ══════════════════════════════════════════════════════════════════════

  private updateOIHighest(markets: UnifiedMarket[]): void {
    const entries = this.createEntries(
      markets.filter((m) => m.openInterestUsd !== null && m.openInterestUsd! > 0),
      (m) => m.openInterestUsd || 0,
      (a, b) => b.value - a.value
    );
    this.leaderboards.set("oi_highest", entries);
  }

  // ══════════════════════════════════════════════════════════════════════
  // LIQUIDITY LEADERBOARDS
  // ══════════════════════════════════════════════════════════════════════

  private updateSpreadTightest(markets: UnifiedMarket[]): void {
    const entries = this.createEntries(
      markets.filter((m) => m.spreadPercent > 0),
      (m) => m.spreadPercent,
      (a, b) => a.value - b.value // Ascending (lower is better)
    );
    this.leaderboards.set("spread_tightest", entries);
  }

  private updateSpreadWidest(markets: UnifiedMarket[]): void {
    const entries = this.createEntries(
      markets.filter((m) => m.spreadPercent > 0),
      (m) => m.spreadPercent,
      (a, b) => b.value - a.value // Descending (higher is wider)
    );
    this.leaderboards.set("spread_widest", entries);
  }

  // ══════════════════════════════════════════════════════════════════════
  // VOLATILITY LEADERBOARDS
  // ══════════════════════════════════════════════════════════════════════

  private updateVolatilityHighest(
    markets: UnifiedMarket[],
    metrics: Map<string, DerivedMetrics>
  ): void {
    // Volatility = price velocity magnitude
    const entries = this.createEntriesWithMetrics(
      markets,
      metrics,
      (m) => Math.abs(m.priceVelocity || 0),
      (a, b) => b.value - a.value
    );
    this.leaderboards.set("volatility_highest", entries);
  }

  private updateVolatilityLowest(
    markets: UnifiedMarket[],
    metrics: Map<string, DerivedMetrics>
  ): void {
    const entries = this.createEntriesWithMetrics(
      markets,
      metrics,
      (m) => Math.abs(m.priceVelocity || 0),
      (a, b) => a.value - b.value
    );
    this.leaderboards.set("volatility_lowest", entries);
  }

  // ══════════════════════════════════════════════════════════════════════
  // SIGNAL LEADERBOARDS
  // ══════════════════════════════════════════════════════════════════════

  private updatePumping(
    markets: UnifiedMarket[],
    metrics: Map<string, DerivedMetrics>
  ): void {
    // Pumping = high price change + high volume surge + positive CVD
    const entries = this.createEntriesWithMetrics(
      markets,
      metrics,
      (m) => {
        const priceChange = m.priceChangePercent1h || 0;
        const volumeSurge = m.volumeSurge15m || 1.0;
        const cvd = m.cvd1h || 0;
        return priceChange > 0 && volumeSurge > 1.5 && cvd > 0
          ? priceChange * volumeSurge
          : 0;
      },
      (a, b) => b.value - a.value
    );
    this.leaderboards.set("pumping", entries);
  }

  private updateDumping(
    markets: UnifiedMarket[],
    metrics: Map<string, DerivedMetrics>
  ): void {
    // Dumping = negative price change + high volume surge + negative CVD
    const entries = this.createEntriesWithMetrics(
      markets,
      metrics,
      (m) => {
        const priceChange = m.priceChangePercent1h || 0;
        const volumeSurge = m.volumeSurge15m || 1.0;
        const cvd = m.cvd1h || 0;
        return priceChange < 0 && volumeSurge > 1.5 && cvd < 0
          ? Math.abs(priceChange) * volumeSurge
          : 0;
      },
      (a, b) => b.value - a.value
    );
    this.leaderboards.set("dumping", entries);
  }

  // ══════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ══════════════════════════════════════════════════════════════════════

  private createEntries(
    markets: UnifiedMarket[],
    getValue: (market: UnifiedMarket) => number,
    sortFn: (a: LeaderboardEntry, b: LeaderboardEntry) => number
  ): LeaderboardEntry[] {
    const entries: LeaderboardEntry[] = markets
      .map((market) => ({
        id: market.id,
        exchange: market.exchange,
        symbol: market.symbol,
        value: getValue(market),
        rank: 0,
        metadata: {
          lastPrice: market.lastPrice,
          volume24h: market.volume24hUsd,
        },
      }))
      .sort(sortFn);

    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    return entries;
  }

  private createEntriesWithMetrics(
    markets: UnifiedMarket[],
    metrics: Map<string, DerivedMetrics>,
    getValue: (metrics: DerivedMetrics) => number,
    sortFn: (a: LeaderboardEntry, b: LeaderboardEntry) => number
  ): LeaderboardEntry[] {
    const entries: LeaderboardEntry[] = markets
      .map((market) => {
        const metric = metrics.get(market.id);
        if (!metric) {
          return null;
        }

        return {
          id: market.id,
          exchange: market.exchange,
          symbol: market.symbol,
          value: getValue(metric),
          rank: 0,
          metadata: {
            lastPrice: market.lastPrice,
            metric: metric,
          },
        } as LeaderboardEntry;
      })
      .filter((e): e is LeaderboardEntry => e !== null)
      .sort(sortFn);

    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    return entries;
  }
}

