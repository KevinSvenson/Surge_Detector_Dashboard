/**
 * Binance Futures API Types
 * 
 * Type definitions for Binance USDT-M Futures WebSocket and REST API responses.
 */

// ══════════════════════════════════════════════════════════════════════
// WEBSOCKET MESSAGE TYPES
// ══════════════════════════════════════════════════════════════════════

/**
 * Binance WebSocket ticker message (24hr ticker)
 */
export interface BinanceTickerMessage {
  e: string; // Event type: "24hrTicker"
  E: number; // Event time
  s: string; // Symbol
  p: string; // Price change
  P: string; // Price change percent
  w: string; // Weighted average price
  x: string; // First trade price
  c: string; // Last price
  Q: string; // Last quantity
  b: string; // Best bid price
  B: string; // Best bid quantity
  a: string; // Best ask price
  A: string; // Best ask quantity
  o: string; // Open price
  h: string; // High price
  l: string; // Low price
  v: string; // Total traded base asset volume
  q: string; // Total traded quote asset volume
  O: number; // Statistics open time
  C: number; // Statistics close time
  F: number; // First trade ID
  L: number; // Last trade ID
  n: number; // Total number of trades
}

/**
 * Binance mark price message
 */
export interface BinanceMarkPriceMessage {
  e: string; // Event type: "markPriceUpdate"
  E: number; // Event time
  s: string; // Symbol
  p: string; // Mark price
  r: string; // Funding rate
  T: number; // Next funding time
}

/**
 * Binance index price message
 */
export interface BinanceIndexPriceMessage {
  e: string; // Event type: "indexPriceUpdate"
  E: number; // Event time
  s: string; // Symbol
  p: string; // Index price
}

/**
 * Binance book ticker message (best bid/ask)
 */
export interface BinanceBookTickerMessage {
  e: string; // Event type: "bookTicker"
  u: number; // Order book update ID
  s: string; // Symbol
  b: string; // Best bid price
  B: string; // Best bid quantity
  a: string; // Best ask price
  A: string; // Best ask quantity
}

// ══════════════════════════════════════════════════════════════════════
// REST API RESPONSE TYPES
// ══════════════════════════════════════════════════════════════════════

/**
 * Binance exchange info response
 */
export interface BinanceExchangeInfo {
  timezone: string;
  serverTime: number;
  rateLimits: unknown[];
  exchangeFilters: unknown[];
  symbols: BinanceSymbolInfo[];
}

/**
 * Binance symbol information
 */
export interface BinanceSymbolInfo {
  symbol: string;
  pair: string;
  contractType: "PERPETUAL" | "CURRENT_QUARTER" | "NEXT_QUARTER";
  deliveryDate: number;
  onboardDate: number;
  status: "TRADING" | "BREAK" | "PRE_TRADING" | "POST_TRADING" | "END_OF_DAY" | "AUCTION_MATCHING";
  baseAsset: string;
  quoteAsset: string;
  marginAsset: string;
  pricePrecision: number;
  quantityPrecision: number;
  baseAssetPrecision: number;
  quotePrecision: number;
  underlyingType: string;
  underlyingSubType: string[];
  settlePlan: number;
  triggerProtect: string;
  filters: unknown[];
  orderTypes: string[];
  timeInForce: string[];
  liquidationFee: string;
  marketTakeBound: string;
}

/**
 * Binance 24hr ticker statistics (REST)
 */
export interface Binance24hrTicker {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  prevClosePrice: string;
  lastPrice: string;
  lastQty: string;
  bidPrice: string;
  bidQty: string;
  askPrice: string;
  askQty: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  openTime: number;
  closeTime: number;
  firstId: number;
  lastId: number;
  count: number;
}

/**
 * Binance open interest response
 */
export interface BinanceOpenInterest {
  openInterest: string;
  symbol: string;
}

/**
 * Binance mark price response
 */
export interface BinanceMarkPrice {
  symbol: string;
  markPrice: string;
  indexPrice: string;
  estimatedSettlePrice: string;
  fundingRate: string;
  nextFundingTime: number;
  interestRate: string;
  time: number;
}

