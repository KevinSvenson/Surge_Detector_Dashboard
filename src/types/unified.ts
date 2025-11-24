/**
 * Unified data schemas for the crypto dashboard backend.
 * 
 * All exchange-specific data MUST be transformed into these unified schemas
 * before storage or processing. No exchange-specific fields should leak into
 * the core data store.
 */

// ══════════════════════════════════════════════════════════════════════
// EXCHANGE TYPES
// ══════════════════════════════════════════════════════════════════════

export type Exchange = "binance" | "bybit" | "okx" | "hyperliquid" | "kraken" | "gateio";

export type MarketType = "perpetual" | "quarterly" | "spot";

export type TradeSide = "buy" | "sell";

export type PositionSide = "long" | "short";

export type RiskLevel = "low" | "medium" | "high" | "critical";

// ══════════════════════════════════════════════════════════════════════
// SCHEMA 1: UNIFIED MARKET (TICKER) DATA
// ══════════════════════════════════════════════════════════════════════

/**
 * Unified market data for a single trading pair on a single exchange.
 * This is the primary real-time data structure.
 */
export interface UnifiedMarket {
  // ══════════════════════════════════════════════════════════════════════
  // IDENTIFIERS
  // ══════════════════════════════════════════════════════════════════════
  
  /** Unique identifier: "{exchange}:{normalizedSymbol}" e.g., "binance:BTC-USDT-PERP" */
  id: string;
  
  /** Source exchange */
  exchange: Exchange;
  
  /** Normalized symbol format: "{BASE}-{QUOTE}-{TYPE}" */
  symbol: string;
  
  /** Base asset (e.g., "BTC") */
  baseAsset: string;
  
  /** Quote asset (e.g., "USDT", "USD") */
  quoteAsset: string;
  
  /** Market type */
  marketType: MarketType;
  
  /** Exchange's native symbol (for API calls) */
  exchangeSymbol: string;

  // ══════════════════════════════════════════════════════════════════════
  // PRICE DATA
  // ══════════════════════════════════════════════════════════════════════
  
  /** Last traded price */
  lastPrice: number;
  
  /** Mark price (for perpetuals) */
  markPrice: number | null;
  
  /** Index price (for perpetuals) */
  indexPrice: number | null;
  
  /** Best bid price */
  bestBid: number;
  
  /** Best bid quantity */
  bestBidQty: number;
  
  /** Best ask price */
  bestAsk: number;
  
  /** Best ask quantity */
  bestAskQty: number;
  
  /** Mid price: (bestBid + bestAsk) / 2 */
  midPrice: number;
  
  /** Spread in absolute terms */
  spreadAbsolute: number;
  
  /** Spread as percentage of mid price */
  spreadPercent: number;

  // ══════════════════════════════════════════════════════════════════════
  // FUNDING (Perpetuals Only)
  // ══════════════════════════════════════════════════════════════════════
  
  /** Current funding rate (e.g., 0.0001 = 0.01%) */
  fundingRate: number | null;
  
  /** Predicted/indicative next funding rate */
  fundingRateNext: number | null;
  
  /** Annualized funding rate: fundingRate * intervalsPerYear * 100 */
  fundingRateAnnualized: number | null;
  
  /** Unix timestamp (ms) of next funding */
  nextFundingTime: number | null;
  
  /** Milliseconds until next funding */
  timeToFunding: number | null;
  
  /** Funding interval in hours (typically 8) */
  fundingIntervalHours: number | null;

  // ══════════════════════════════════════════════════════════════════════
  // VOLUME & OPEN INTEREST
  // ══════════════════════════════════════════════════════════════════════
  
  /** 24h volume in quote currency */
  volume24h: number;
  
  /** 24h volume in base currency */
  volume24hBase: number;
  
  /** 24h volume in USD (normalized) */
  volume24hUsd: number;
  
  /** Number of trades in 24h (if available) */
  tradeCount24h: number | null;
  
  /** Open interest in contracts */
  openInterest: number | null;
  
  /** Open interest in USD */
  openInterestUsd: number | null;

  // ══════════════════════════════════════════════════════════════════════
  // 24H STATISTICS
  // ══════════════════════════════════════════════════════════════════════
  
  /** 24h high price */
  high24h: number;
  
  /** 24h low price */
  low24h: number;
  
  /** Price 24h ago (open) */
  open24h: number;
  
  /** Absolute price change in 24h */
  priceChange24h: number;
  
  /** Percentage price change in 24h */
  priceChangePercent24h: number;

  // ══════════════════════════════════════════════════════════════════════
  // METADATA
  // ══════════════════════════════════════════════════════════════════════
  
  /** Timestamp of last update (local) */
  updatedAt: number;
  
  /** Data staleness in milliseconds */
  dataAge: number;
  
  /** Is data considered fresh? (< 5 seconds old) */
  isFresh: boolean;
  
  /** Data quality flags */
  flags: {
    hasRealTimeOI: boolean;      // OI from WebSocket vs REST
    hasFullLiquidations: boolean; // Full liq data vs sampled
    hasFunding: boolean;
  };
}

// ══════════════════════════════════════════════════════════════════════
// SCHEMA 2: ORDER BOOK DATA
// ══════════════════════════════════════════════════════════════════════

/**
 * Unified order book snapshot with computed depth metrics.
 */
export interface UnifiedOrderBook {
  // Identifiers
  id: string;           // Same as UnifiedMarket.id
  exchange: Exchange;
  symbol: string;
  
  // Raw book data (top N levels)
  bids: PriceLevel[];   // Sorted descending by price
  asks: PriceLevel[];   // Sorted ascending by price
  
  // Book metadata
  lastUpdateId: number | string;
  timestamp: number;
  
  // Computed depth metrics (USD within X% of mid)
  depthBid: DepthMetrics;
  depthAsk: DepthMetrics;
  
  // Imbalance: (bidDepth - askDepth) / (bidDepth + askDepth) at each level
  imbalance: {
    top5: number;       // -1 to 1, positive = bid heavy
    top10: number;
    top20: number;
  };
  
  // Liquidity score (0-100)
  liquidityScore: number;
}

export interface PriceLevel {
  price: number;
  quantity: number;
  quantityUsd: number;  // Computed: quantity * price
}

export interface DepthMetrics {
  pct05: number;   // USD within 0.5% of mid
  pct1: number;    // USD within 1%
  pct2: number;    // USD within 2%
  pct5: number;    // USD within 5%
  pct10: number;   // USD within 10%
}

// ══════════════════════════════════════════════════════════════════════
// SCHEMA 3: TRADE DATA
// ══════════════════════════════════════════════════════════════════════

/**
 * Unified trade event for CVD and volume calculations.
 */
export interface UnifiedTrade {
  id: string;               // Unique trade ID
  exchange: Exchange;
  symbol: string;
  
  price: number;
  quantity: number;
  quoteQuantity: number;    // price * quantity
  
  side: TradeSide;          // Taker side (aggressor)
  timestamp: number;
  
  // For whale detection
  isLargeTrade: boolean;    // > threshold USD value
}

// ══════════════════════════════════════════════════════════════════════
// SCHEMA 4: LIQUIDATION DATA
// ══════════════════════════════════════════════════════════════════════

/**
 * Unified liquidation event.
 * Note: CEX data is often incomplete (1/sec limit).
 * Hyperliquid provides complete data.
 */
export interface UnifiedLiquidation {
  id: string;
  exchange: Exchange;
  symbol: string;
  
  side: PositionSide;       // Which side got liquidated
  price: number;
  quantity: number;
  quoteQuantity: number;
  
  timestamp: number;
  
  // Data quality indicator
  isComplete: boolean;      // true for Hyperliquid, false for most CEXs
}

// ══════════════════════════════════════════════════════════════════════
// SCHEMA 5: POSITION DATA (Hyperliquid-Specific, Aggregatable)
// ══════════════════════════════════════════════════════════════════════

/**
 * Individual position from Hyperliquid.
 * This data is ONLY available from Hyperliquid due to on-chain transparency.
 */
export interface HyperliquidPosition {
  // Position identifiers
  address: string;          // Wallet address
  coin: string;             // e.g., "BTC", "ETH"
  
  // Position details
  side: PositionSide;
  size: number;             // Absolute size in base currency
  sizeUsd: number;          // Position value in USD
  
  entryPrice: number;
  currentPrice: number;
  liquidationPrice: number;
  
  leverage: number;
  marginUsed: number;
  unrealizedPnl: number;
  
  // Liquidation risk metrics
  distanceToLiqPercent: number;  // % price move to liquidation
  isAtRisk: boolean;             // < 5% from liquidation
  
  // Metadata
  updatedAt: number;
}

/**
 * Aggregated liquidation cluster data.
 * Computed from scanning multiple Hyperliquid positions.
 */
export interface LiquidationCluster {
  coin: string;
  priceLevel: number;       // Rounded price level
  
  // Volume at this level
  longLiquidationUsd: number;
  shortLiquidationUsd: number;
  totalLiquidationUsd: number;
  
  // Position count
  longPositionCount: number;
  shortPositionCount: number;
  
  // Distance from current price
  distanceFromCurrentPercent: number;
  
  // Risk assessment
  riskLevel: RiskLevel;
}

// ══════════════════════════════════════════════════════════════════════
// SCHEMA 6: DERIVED METRICS
// ══════════════════════════════════════════════════════════════════════

/**
 * Computed metrics from raw data.
 * Updated on configurable intervals (e.g., every 100ms batch).
 */
export interface DerivedMetrics {
  id: string;               // Same as UnifiedMarket.id
  exchange: Exchange;
  symbol: string;
  
  // ══════════════════════════════════════════════════════════════════════
  // PRICE CHANGE (Rolling Windows)
  // ══════════════════════════════════════════════════════════════════════
  
  priceChange1m: number;
  priceChange5m: number;
  priceChange15m: number;
  priceChange1h: number;
  priceChange4h: number;
  
  priceChangePercent1m: number;
  priceChangePercent5m: number;
  priceChangePercent15m: number;
  priceChangePercent1h: number;
  priceChangePercent4h: number;
  
  // Price velocity (% per minute, smoothed)
  priceVelocity: number;
  priceAcceleration: number;

  // ══════════════════════════════════════════════════════════════════════
  // CUMULATIVE VOLUME DELTA (Buy Volume - Sell Volume)
  // ══════════════════════════════════════════════════════════════════════
  
  cvd1m: number;
  cvd5m: number;
  cvd15m: number;
  cvd1h: number;
  cvd4h: number;
  
  // CVD as percentage of total volume
  cvdPercent1h: number;

  // ══════════════════════════════════════════════════════════════════════
  // VOLUME ANALYSIS
  // ══════════════════════════════════════════════════════════════════════
  
  // Volume in current period
  volume1m: number;
  volume5m: number;
  volume15m: number;
  volume1h: number;
  
  // Volume surge (current / 20-period average)
  volumeSurge1m: number;
  volumeSurge5m: number;
  volumeSurge15m: number;
  
  // Taker buy ratio (buyVolume / totalVolume)
  takerBuyRatio1m: number;
  takerBuyRatio5m: number;
  takerBuyRatio1h: number;

  // ══════════════════════════════════════════════════════════════════════
  // LIQUIDATIONS (Where Available)
  // ══════════════════════════════════════════════════════════════════════
  
  liquidationsLong1h: number;    // USD
  liquidationsShort1h: number;
  liquidationsNet1h: number;     // long - short
  
  liquidationsLong24h: number;
  liquidationsShort24h: number;

  // ══════════════════════════════════════════════════════════════════════
  // SPREAD ANALYSIS
  // ══════════════════════════════════════════════════════════════════════
  
  // Current spread percentile vs 24h distribution (0-100)
  spreadPercentile24h: number;
  
  // Average spread over periods
  spreadAvg1h: number;
  spreadAvg24h: number;

  // ══════════════════════════════════════════════════════════════════════
  // TIMESTAMPS
  // ══════════════════════════════════════════════════════════════════════
  
  computedAt: number;
}

// ══════════════════════════════════════════════════════════════════════
// SCHEMA 7: COMPOSITE SCORES
// ══════════════════════════════════════════════════════════════════════

/**
 * High-level scores combining multiple metrics.
 * Used for quick screening and leaderboards.
 */
export interface CompositeScores {
  id: string;
  exchange: Exchange;
  symbol: string;
  
  // Momentum Score (0-100)
  // Factors: short-term price change, volume surge, CVD direction
  momentumScore: number;
  
  // Pump Detection Score (0-100)
  // Factors: rapid price increase, volume spike, relative to typical activity
  pumpScore: number;
  
  // Liquidity Score (0-100)
  // Factors: spread tightness, book depth, volume
  liquidityScore: number;
  
  // Volatility Score (0-100)
  // Factors: price range, velocity, historical comparison
  volatilityScore: number;
  
  // Funding Extremeness (0-100)
  // How extreme current funding is vs typical range
  fundingExtremenessScore: number;
  
  // Order Book Health (0-100)
  // Factors: spread, depth balance, imbalance stability
  orderBookHealthScore: number;
  
  // Overall Activity Score (0-100)
  // Combined measure of "interesting-ness"
  activityScore: number;
  
  computedAt: number;
}

