/**
 * Internal types used for data processing, storage, and computation.
 * These are not part of the public API but are essential for the system.
 */

import type { UnifiedMarket, UnifiedTrade, UnifiedOrderBook, UnifiedLiquidation } from "./unified.js";
import type { Exchange } from "./unified.js";

// ══════════════════════════════════════════════════════════════════════
// ROLLING WINDOW DATA STRUCTURES
// ══════════════════════════════════════════════════════════════════════

export interface TradeBucket {
  buyVolume: number;
  sellVolume: number;
  count: number;
  timestamp: number;
}

export interface PriceBucket {
  open: number;
  high: number;
  low: number;
  close: number;
  timestamp: number;
}

export interface LiquidationBucket {
  longUsd: number;
  shortUsd: number;
  timestamp: number;
}

export interface SpreadBucket {
  spreadPercent: number;
  timestamp: number;
}

/**
 * Per-symbol rolling data structure.
 */
export interface SymbolRollingData {
  // Trade data for CVD calculation
  trades: TradeBucket[];
  
  // Price data for velocity/change calculation
  prices: PriceBucket[];
  
  // Liquidation data
  liquidations: LiquidationBucket[];
  
  // Spread data for percentile calculation
  spreads: SpreadBucket[];
  
  // Last update timestamp
  lastUpdate: number;
}

// ══════════════════════════════════════════════════════════════════════
// LEADERBOARD TYPES
// ══════════════════════════════════════════════════════════════════════

export type LeaderboardName =
  // Price movement
  | "gainers_1h" | "losers_1h" | "momentum_highest" | "momentum_lowest"
  // Volume
  | "volume_24h" | "volume_surge" | "activity_highest"
  // Funding
  | "funding_highest" | "funding_lowest" | "funding_extreme"
  // Open interest
  | "oi_highest"
  // Liquidity
  | "spread_tightest" | "spread_widest"
  // Volatility
  | "volatility_highest" | "volatility_lowest"
  // Signals
  | "pumping" | "dumping"
  // Legacy (keep for compatibility)
  | "gainers_5m" | "gainers_15m" | "gainers_24h"
  | "losers_5m" | "losers_15m" | "losers_24h"
  | "volume_surge_1m" | "volume_surge_5m" | "volume_surge_15m"
  | "cvd_positive_1h" | "cvd_negative_1h"
  | "depth_highest" | "oi_change_1h"
  | "liquidations_long_1h" | "liquidations_short_1h"
  | "momentum_score" | "pump_score" | "activity_score"
  | "liquidation_risk" | "whale_positions";

export interface LeaderboardEntry {
  id: string;              // UnifiedMarket.id
  exchange: Exchange;
  symbol: string;
  value: number;           // The value being sorted on
  rank: number;            // Current rank (1-based)
  metadata?: Record<string, unknown>;
}

export interface Leaderboard {
  name: LeaderboardName;
  entries: LeaderboardEntry[];
  updatedAt: number;
  totalCount: number;
}

// ══════════════════════════════════════════════════════════════════════
// STORE INTERFACES
// ══════════════════════════════════════════════════════════════════════

export interface MarketStore {
  get(id: string): UnifiedMarket | undefined;
  getAll(): UnifiedMarket[];
  getAllByExchange(exchange: Exchange): UnifiedMarket[];
  set(market: UnifiedMarket): void;
  delete(id: string): void;
  size(): number;
}

export interface OrderBookStore {
  get(id: string): UnifiedOrderBook | undefined;
  set(book: UnifiedOrderBook): void;
  delete(id: string): void;
}

export interface TradeStore {
  add(trade: UnifiedTrade): void;
  getRecent(symbol: string, since: number): UnifiedTrade[];
  getRecentByExchange(exchange: Exchange, since: number): UnifiedTrade[];
}

export interface LiquidationStore {
  add(liquidation: UnifiedLiquidation): void;
  getRecent(symbol: string, since: number): UnifiedLiquidation[];
  getRecentByExchange(exchange: Exchange, since: number): UnifiedLiquidation[];
}

// ══════════════════════════════════════════════════════════════════════
// COMPUTATION TYPES
// ══════════════════════════════════════════════════════════════════════

export interface ComputationContext {
  market: UnifiedMarket;
  trades: UnifiedTrade[];
  liquidations: UnifiedLiquidation[];
  orderBook?: UnifiedOrderBook;
  rollingData: SymbolRollingData;
}

