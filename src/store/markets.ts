/**
 * In-Memory Market Store
 * 
 * Stores and manages UnifiedMarket data.
 */

import type { UnifiedMarket, Exchange } from "../types/unified.js";
import type { MarketStore as IMarketStore } from "../types/internal.js";
import { logger } from "../utils/logger.js";

export class MarketStore implements IMarketStore {
  private markets: Map<string, UnifiedMarket> = new Map();

  /**
   * Get a market by ID.
   */
  get(id: string): UnifiedMarket | undefined {
    return this.markets.get(id);
  }

  /**
   * Get all markets.
   */
  getAll(): UnifiedMarket[] {
    return Array.from(this.markets.values());
  }

  /**
   * Get all markets for a specific exchange.
   */
  getAllByExchange(exchange: Exchange): UnifiedMarket[] {
    return Array.from(this.markets.values()).filter(
      (market) => market.exchange === exchange
    );
  }

  /**
   * Get all markets for a normalized symbol (across all exchanges).
   */
  getBySymbol(normalizedSymbol: string): UnifiedMarket[] {
    return Array.from(this.markets.values()).filter(
      (market) => market.symbol === normalizedSymbol
    );
  }

  /**
   * Update or insert a market.
   */
  set(market: UnifiedMarket): void {
    // Update data age
    const now = Date.now();
    market.dataAge = now - market.updatedAt;
    market.isFresh = market.dataAge < 5000; // < 5 seconds

    this.markets.set(market.id, market);
  }

  /**
   * Delete a market.
   */
  delete(id: string): void {
    this.markets.delete(id);
  }

  /**
   * Get the number of markets.
   */
  size(): number {
    return this.markets.size;
  }

  /**
   * Clear all markets.
   */
  clear(): void {
    this.markets.clear();
    logger.info("Market store cleared");
  }

  /**
   * Get statistics about the store.
   */
  getStats(): {
    totalMarkets: number;
    marketsByExchange: Record<Exchange, number>;
    staleMarkets: number; // Markets with dataAge > 5 seconds
  } {
    const markets = Array.from(this.markets.values());
    const marketsByExchange: Record<string, number> = {};

    for (const market of markets) {
      marketsByExchange[market.exchange] =
        (marketsByExchange[market.exchange] || 0) + 1;
    }

    const staleMarkets = markets.filter((m) => !m.isFresh).length;

    return {
      totalMarkets: markets.length,
      marketsByExchange: marketsByExchange as Record<Exchange, number>,
      staleMarkets,
    };
  }
}

