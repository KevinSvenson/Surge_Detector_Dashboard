/**
 * Cross-Exchange Aggregation
 * 
 * Aggregates same symbol across multiple exchanges.
 */

import type { UnifiedMarket } from "../types/unified.js";
import type { Exchange } from "../types/unified.js";

export interface AggregatedMarket {
  symbol: string;
  exchanges: Exchange[];
  markets: UnifiedMarket[];
  
  // Aggregated prices
  bestBid: number;
  bestBidExchange: Exchange;
  bestAsk: number;
  bestAskExchange: Exchange;
  
  // Price aggregation
  averagePrice: number;
  weightedAveragePrice: number; // Volume-weighted
  priceSpread: number; // Max - Min across exchanges
  
  // Volume aggregation
  totalVolume24h: number;
  totalOpenInterest: number;
  
  // Funding aggregation
  averageFundingRate: number;
  fundingSpread: number; // Max - Min
  
  // Arbitrage opportunity
  arbitrageOpportunity: {
    exists: boolean;
    buyExchange: Exchange;
    sellExchange: Exchange;
    profitPercent: number;
    buyPrice: number;
    sellPrice: number;
  };
  
  updatedAt: number;
}

/**
 * Aggregate markets by symbol across exchanges
 */
export function aggregateMarketsBySymbol(
  markets: UnifiedMarket[]
): Map<string, AggregatedMarket> {
  const bySymbol = new Map<string, UnifiedMarket[]>();

  // Group by normalized symbol
  for (const market of markets) {
    const existing = bySymbol.get(market.symbol) || [];
    existing.push(market);
    bySymbol.set(market.symbol, existing);
  }

  // Aggregate each symbol
  const aggregated = new Map<string, AggregatedMarket>();

  for (const [symbol, symbolMarkets] of bySymbol.entries()) {
    if (symbolMarkets.length < 2) {
      continue; // Need at least 2 exchanges
    }

    const aggregatedMarket = aggregateSymbolMarkets(symbol, symbolMarkets);
    aggregated.set(symbol, aggregatedMarket);
  }

  return aggregated;
}

/**
 * Aggregate markets for a single symbol
 */
function aggregateSymbolMarkets(
  symbol: string,
  markets: UnifiedMarket[]
): AggregatedMarket {
  const exchanges = markets.map((m) => m.exchange);

  // Find best bid/ask across exchanges
  let bestBid = 0;
  let bestBidExchange: Exchange = markets[0].exchange;
  let bestAsk = Infinity;
  let bestAskExchange: Exchange = markets[0].exchange;

  for (const market of markets) {
    if (market.bestBid > bestBid) {
      bestBid = market.bestBid;
      bestBidExchange = market.exchange;
    }
    if (market.bestAsk < bestAsk) {
      bestAsk = market.bestAsk;
      bestAskExchange = market.exchange;
    }
  }

  // Calculate averages
  const prices = markets.map((m) => m.lastPrice);
  const averagePrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;

  // Volume-weighted average
  const totalVolume = markets.reduce((sum, m) => sum + m.volume24hUsd, 0);
  const weightedAveragePrice =
    totalVolume > 0
      ? markets.reduce((sum, m) => sum + m.lastPrice * m.volume24hUsd, 0) /
        totalVolume
      : averagePrice;

  // Price spread
  const priceSpread = Math.max(...prices) - Math.min(...prices);

  // Volume aggregation
  const totalVolume24h = markets.reduce((sum, m) => sum + m.volume24hUsd, 0);
  const totalOpenInterest = markets.reduce(
    (sum, m) => sum + (m.openInterestUsd || 0),
    0
  );

  // Funding aggregation
  const fundingRates = markets
    .map((m) => m.fundingRateAnnualized)
    .filter((r): r is number => r !== null);
  const averageFundingRate =
    fundingRates.length > 0
      ? fundingRates.reduce((sum, r) => sum + r, 0) / fundingRates.length
      : 0;
  const fundingSpread =
    fundingRates.length > 0
      ? Math.max(...fundingRates) - Math.min(...fundingRates)
      : 0;

  // Arbitrage opportunity
  const arbitrageOpportunity = calculateArbitrage(
    bestBid,
    bestBidExchange,
    bestAsk,
    bestAskExchange
  );

  return {
    symbol,
    exchanges,
    markets,
    bestBid,
    bestBidExchange,
    bestAsk,
    bestAskExchange,
    averagePrice,
    weightedAveragePrice,
    priceSpread,
    totalVolume24h,
    totalOpenInterest,
    averageFundingRate,
    fundingSpread,
    arbitrageOpportunity,
    updatedAt: Date.now(),
  };
}

/**
 * Calculate arbitrage opportunity
 */
function calculateArbitrage(
  bestBid: number,
  bestBidExchange: Exchange,
  bestAsk: number,
  bestAskExchange: Exchange
): AggregatedMarket["arbitrageOpportunity"] {
  // Arbitrage exists if we can buy lower than we can sell
  if (bestBid > bestAsk && bestBidExchange !== bestAskExchange) {
    const profit = bestBid - bestAsk;
    const profitPercent = (profit / bestAsk) * 100;

    return {
      exists: true,
      buyExchange: bestAskExchange, // Buy at lowest ask
      sellExchange: bestBidExchange, // Sell at highest bid
      profitPercent,
      buyPrice: bestAsk,
      sellPrice: bestBid,
    };
  }

  return {
    exists: false,
    buyExchange: bestBidExchange,
    sellExchange: bestAskExchange,
    profitPercent: 0,
    buyPrice: bestAsk,
    sellPrice: bestBid,
  };
}

/**
 * Get arbitrage opportunities (sorted by profit)
 */
export function getArbitrageOpportunities(
  aggregated: Map<string, AggregatedMarket>
): AggregatedMarket[] {
  return Array.from(aggregated.values())
    .filter((m) => m.arbitrageOpportunity.exists)
    .sort(
      (a, b) =>
        b.arbitrageOpportunity.profitPercent -
        a.arbitrageOpportunity.profitPercent
    );
}

