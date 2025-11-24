/**
 * Bybit → UnifiedMarket Normalizer
 * 
 * Transforms Bybit V5 ticker data into the unified UnifiedMarket schema.
 */

import type { UnifiedMarket } from "../../types/unified.js";

// ══════════════════════════════════════════════════════════════════════
// BYBIT TICKER DATA STRUCTURE
// ══════════════════════════════════════════════════════════════════════

interface BybitTickerData {
  symbol: string;
  lastPrice: string;
  markPrice: string;
  indexPrice: string;
  bid1Price: string;
  bid1Size: string;
  ask1Price: string;
  ask1Size: string;
  fundingRate: string;
  nextFundingTime: string;
  openInterest: string;
  openInterestValue: string;
  volume24h: string;
  turnover24h: string;
  price24hPcnt: string;
  highPrice24h: string;
  lowPrice24h: string;
  prevPrice24h: string;
}

// ══════════════════════════════════════════════════════════════════════
// NORMALIZATION FUNCTIONS
// ══════════════════════════════════════════════════════════════════════

/**
 * Normalize Bybit symbol to unified format.
 * Example: "BTCUSDT" → "BTC-USDT-PERP"
 */
export function normalizeBybitSymbol(exchangeSymbol: string): string {
  // Bybit perpetuals are typically BASE + QUOTE (e.g., BTCUSDT)
  // We need to detect the split point
  
  // Common quote assets
  const quotes = ["USDT", "USDC", "USD", "BTC", "ETH"];
  
  for (const quote of quotes) {
    if (exchangeSymbol.endsWith(quote)) {
      const base = exchangeSymbol.slice(0, -quote.length);
      return `${base}-${quote}-PERP`;
    }
  }
  
  // Fallback: assume USDT if no match
  if (exchangeSymbol.length > 4) {
    const base = exchangeSymbol.slice(0, -4);
    return `${base}-USDT-PERP`;
  }
  
  // Last resort: return as-is with -PERP suffix
  return `${exchangeSymbol}-PERP`;
}

/**
 * Extract base and quote assets from normalized symbol.
 */
export function parseNormalizedSymbol(normalizedSymbol: string): {
  baseAsset: string;
  quoteAsset: string;
} {
  // Format: "BTC-USDT-PERP"
  const parts = normalizedSymbol.split("-");
  if (parts.length >= 2) {
    return {
      baseAsset: parts[0],
      quoteAsset: parts[1],
    };
  }
  
  // Fallback
  return {
    baseAsset: normalizedSymbol,
    quoteAsset: "USDT",
  };
}

/**
 * Convert Bybit ticker data to UnifiedMarket.
 */
export function normalizeBybitTicker(
  exchangeSymbol: string,
  tickerData: BybitTickerData
): UnifiedMarket {
  const normalizedSymbol = normalizeBybitSymbol(exchangeSymbol);
  const { baseAsset, quoteAsset } = parseNormalizedSymbol(normalizedSymbol);
  
  const now = Date.now();
  
  // Parse numeric values
  const lastPrice = parseFloat(tickerData.lastPrice) || 0;
  const markPrice = parseFloat(tickerData.markPrice) || null;
  const indexPrice = parseFloat(tickerData.indexPrice) || null;
  const bestBid = parseFloat(tickerData.bid1Price) || 0;
  const bestBidQty = parseFloat(tickerData.bid1Size) || 0;
  const bestAsk = parseFloat(tickerData.ask1Price) || 0;
  const bestAskQty = parseFloat(tickerData.ask1Size) || 0;
  
  // Calculate mid price and spread
  const midPrice = (bestBid + bestAsk) / 2;
  const spreadAbsolute = bestAsk - bestBid;
  const spreadPercent = midPrice > 0 ? (spreadAbsolute / midPrice) * 100 : 0;
  
  // Funding data
  const fundingRate = tickerData.fundingRate ? parseFloat(tickerData.fundingRate) : null;
  const nextFundingTime = tickerData.nextFundingTime ? parseInt(tickerData.nextFundingTime) : null;
  const timeToFunding = nextFundingTime ? Math.max(0, nextFundingTime - now) : null;
  
  // Calculate annualized funding rate (assuming 8-hour intervals)
  const fundingIntervalHours = 8;
  const intervalsPerYear = (365 * 24) / fundingIntervalHours;
  const fundingRateAnnualized = fundingRate !== null
    ? fundingRate * intervalsPerYear * 100
    : null;
  
  // Volume and OI
  const volume24hBase = parseFloat(tickerData.volume24h) || 0;
  const volume24h = parseFloat(tickerData.turnover24h) || 0; // Quote currency
  const volume24hUsd = volume24h; // Bybit uses USDT, which is ~USD
  const openInterest = tickerData.openInterest ? parseFloat(tickerData.openInterest) : null;
  const openInterestUsd = tickerData.openInterestValue
    ? parseFloat(tickerData.openInterestValue)
    : null;
  
  // 24h statistics
  const high24h = parseFloat(tickerData.highPrice24h) || 0;
  const low24h = parseFloat(tickerData.lowPrice24h) || 0;
  const open24h = parseFloat(tickerData.prevPrice24h) || 0;
  const priceChangePercent24h = parseFloat(tickerData.price24hPcnt) * 100 || 0;
  const priceChange24h = lastPrice - open24h;
  
  // Create unified market
  const market: UnifiedMarket = {
    // Identifiers
    id: `bybit:${normalizedSymbol}`,
    exchange: "bybit",
    symbol: normalizedSymbol,
    baseAsset,
    quoteAsset,
    marketType: "perpetual",
    exchangeSymbol,
    
    // Price data
    lastPrice,
    markPrice,
    indexPrice,
    bestBid,
    bestBidQty,
    bestAsk,
    bestAskQty,
    midPrice,
    spreadAbsolute,
    spreadPercent,
    
    // Funding
    fundingRate,
    fundingRateNext: null, // Not available in ticker
    fundingRateAnnualized,
    nextFundingTime,
    timeToFunding,
    fundingIntervalHours: fundingRate !== null ? fundingIntervalHours : null,
    
    // Volume & OI
    volume24h,
    volume24hBase,
    volume24hUsd,
    tradeCount24h: null, // Not in ticker
    openInterest,
    openInterestUsd,
    
    // 24h statistics
    high24h,
    low24h,
    open24h,
    priceChange24h,
    priceChangePercent24h,
    
    // Metadata
    updatedAt: now,
    dataAge: 0,
    isFresh: true,
    
    // Data quality flags
    flags: {
      hasRealTimeOI: true,        // Bybit provides OI in ticker
      hasFullLiquidations: true,   // Bybit has good liquidation data
      hasFunding: fundingRate !== null,
    },
  };
  
  return market;
}

/**
 * Validate Bybit ticker data structure.
 */
export function validateBybitTicker(data: unknown): data is BybitTickerData {
  if (!data || typeof data !== "object") {
    return false;
  }
  
  const ticker = data as Record<string, unknown>;
  
  // Check required fields
  return (
    typeof ticker.symbol === "string" &&
    typeof ticker.lastPrice === "string"
  );
}

