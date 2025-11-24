/**
 * Leaderboard Store
 * 
 * Manages sorted leaderboards for various metrics.
 */

import type { UnifiedMarket } from "../types/unified.js";
import type {
  Leaderboard,
  LeaderboardEntry,
  LeaderboardName,
} from "../types/internal.js";

export class LeaderboardStore {
  private leaderboards: Map<LeaderboardName, LeaderboardEntry[]> = new Map();

  /**
   * Update all leaderboards based on current market data.
   */
  update(markets: UnifiedMarket[]): void {
    // Update each leaderboard type
    this.updateGainers1h(markets);
    this.updateVolume24h(markets);
    this.updateFundingHighest(markets);
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
  // PRIVATE: LEADERBOARD UPDATERS
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Update gainers_1h leaderboard (sorted by 24h price change %).
   */
  private updateGainers1h(markets: UnifiedMarket[]): void {
    const entries: LeaderboardEntry[] = markets
      .filter((m) => m.priceChangePercent24h !== null && m.priceChangePercent24h !== undefined)
      .map((market) => ({
        id: market.id,
        exchange: market.exchange,
        symbol: market.symbol,
        value: market.priceChangePercent24h,
        rank: 0, // Will be set after sorting
        metadata: {
          priceChange24h: market.priceChange24h,
          lastPrice: market.lastPrice,
        },
      }))
      .sort((a, b) => (b.value || 0) - (a.value || 0)); // Descending

    // Assign ranks
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    this.leaderboards.set("gainers_1h", entries);
  }

  /**
   * Update volume_24h leaderboard (sorted by 24h volume in USD).
   */
  private updateVolume24h(markets: UnifiedMarket[]): void {
    const entries: LeaderboardEntry[] = markets
      .filter((m) => m.volume24hUsd > 0)
      .map((market) => ({
        id: market.id,
        exchange: market.exchange,
        symbol: market.symbol,
        value: market.volume24hUsd,
        rank: 0,
        metadata: {
          volume24h: market.volume24h,
          volume24hBase: market.volume24hBase,
          tradeCount24h: market.tradeCount24h,
        },
      }))
      .sort((a, b) => b.value - a.value); // Descending

    // Assign ranks
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    this.leaderboards.set("volume_24h", entries);
  }

  /**
   * Update funding_highest leaderboard (sorted by annualized funding rate).
   */
  private updateFundingHighest(markets: UnifiedMarket[]): void {
    const entries: LeaderboardEntry[] = markets
      .filter(
        (m) =>
          m.fundingRateAnnualized !== null &&
          m.fundingRateAnnualized !== undefined
      )
      .map((market) => ({
        id: market.id,
        exchange: market.exchange,
        symbol: market.symbol,
        value: market.fundingRateAnnualized!,
        rank: 0,
        metadata: {
          fundingRate: market.fundingRate,
          fundingRateAnnualized: market.fundingRateAnnualized,
          nextFundingTime: market.nextFundingTime,
        },
      }))
      .sort((a, b) => b.value - a.value); // Descending

    // Assign ranks
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    this.leaderboards.set("funding_highest", entries);
  }
}

