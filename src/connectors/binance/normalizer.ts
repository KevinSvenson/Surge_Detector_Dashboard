/**
 * Binance → UnifiedMarket Normalizer
 * 
 * Transforms Binance Futures data into the unified UnifiedMarket schema.
 */

import type { UnifiedMarket } from "../../types/unified.js";
import type {
  BinanceTickerMessage,
  BinanceMarkPriceMessage,
  BinanceIndexPriceMessage,
  BinanceBookTickerMessage,
} from "../../types/binance.js";

// ══════════════════════════════════════════════════════════════════════
// NORMALIZATION FUNCTIONS
// ══════════════════════════════════════════════════════════════════════

/**
 * Normalize Binance symbol to unified format.
 * Example: "BTCUSDT" → "BTC-USDT-PERP"
 */
export function normalizeBinanceSymbol(exchangeSymbol: string): string {
  const quotes = ["USDT", "BUSD", "USDC", "BTC", "ETH"];

  for (const quote of quotes) {
    if (exchangeSymbol.endsWith(quote)) {
      const base = exchangeSymbol.slice(0, -quote.length);
      return `${base}-${quote}-PERP`;
    }
  }

  // Fallback
  if (exchangeSymbol.length > 4) {
    const base = exchangeSymbol.slice(0, -4);
    return `${base}-USDT-PERP`;
  }

  return `${exchangeSymbol}-PERP`;
}

/**
 * Extract base and quote assets from normalized symbol.
 */
export function parseNormalizedSymbol(normalizedSymbol: string): {
  baseAsset: string;
  quoteAsset: string;
} {
  const parts = normalizedSymbol.split("-");
  if (parts.length >= 2) {
    return {
      baseAsset: parts[0],
      quoteAsset: parts[1],
    };
  }

  return {
    baseAsset: normalizedSymbol,
    quoteAsset: "USDT",
  };
}

/**
 * Convert Binance ticker data to UnifiedMarket.
 * Combines data from multiple Binance streams (ticker, markPrice, bookTicker).
 */
export function normalizeBinanceTicker(
  exchangeSymbol: string,
  tickerData: BinanceTickerMessage,
  markPriceData?: BinanceMarkPriceMessage,
  indexPriceData?: BinanceIndexPriceMessage,
  bookTickerData?: BinanceBookTickerMessage
): UnifiedMarket {
  const normalizedSymbol = normalizeBinanceSymbol(exchangeSymbol);
  const { baseAsset, quoteAsset } = parseNormalizedSymbol(normalizedSymbol);

  const now = Date.now();

  // Parse numeric values from ticker
  const lastPrice = parseFloat(tickerData.c) || 0;
  const open24h = parseFloat(tickerData.o) || 0;
  const high24h = parseFloat(tickerData.h) || 0;
  const low24h = parseFloat(tickerData.l) || 0;
  const priceChange24h = parseFloat(tickerData.p) || 0;
  const priceChangePercent24h = parseFloat(tickerData.P) || 0;

  // Mark price and index price (from separate streams)
  const markPrice = markPriceData ? parseFloat(markPriceData.p) : null;
  const indexPrice = indexPriceData ? parseFloat(indexPriceData.p) : null;

  // Best bid/ask (from bookTicker or ticker)
  const bestBid = bookTickerData
    ? parseFloat(bookTickerData.b)
    : parseFloat(tickerData.b) || 0;
  const bestBidQty = bookTickerData
    ? parseFloat(bookTickerData.B)
    : parseFloat(tickerData.B) || 0;
  const bestAsk = bookTickerData
    ? parseFloat(bookTickerData.a)
    : parseFloat(tickerData.a) || 0;
  const bestAskQty = bookTickerData
    ? parseFloat(bookTickerData.A)
    : parseFloat(tickerData.A) || 0;

  // Calculate mid price and spread
  const midPrice = (bestBid + bestAsk) / 2;
  const spreadAbsolute = bestAsk - bestBid;
  const spreadPercent = midPrice > 0 ? (spreadAbsolute / midPrice) * 100 : 0;

  // Funding data (from markPrice stream)
  const fundingRate = markPriceData ? parseFloat(markPriceData.r) : null;
  const nextFundingTime = markPriceData ? markPriceData.T : null;
  const timeToFunding = nextFundingTime ? Math.max(0, nextFundingTime - now) : null;

  // Calculate annualized funding rate (assuming 8-hour intervals)
  const fundingIntervalHours = 8;
  const intervalsPerYear = (365 * 24) / fundingIntervalHours;
  const fundingRateAnnualized = fundingRate !== null
    ? fundingRate * intervalsPerYear * 100
    : null;

  // Volume data
  const volume24hBase = parseFloat(tickerData.v) || 0;
  const volume24h = parseFloat(tickerData.q) || 0; // Quote volume
  const volume24hUsd = volume24h; // Binance uses USDT, which is ~USD
  const tradeCount24h = tickerData.n || null;

  // Open interest will be updated via REST polling
  const openInterest = null;
  const openInterestUsd = null;

  // Create unified market
  const market: UnifiedMarket = {
    // Identifiers
    id: `binance:${normalizedSymbol}`,
    exchange: "binance",
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
    tradeCount24h,
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
      hasRealTimeOI: false, // OI from REST polling, not WebSocket
      hasFullLiquidations: false, // Binance has limited liquidation data
      hasFunding: fundingRate !== null,
    },
  };

  return market;
}

/**
 * Validate Binance ticker data structure.
 */
export function validateBinanceTicker(data: unknown): data is BinanceTickerMessage {
  if (!data || typeof data !== "object") {
    return false;
  }

  const ticker = data as Record<string, unknown>;

  // Check required fields
  return (
    typeof ticker.e === "string" &&
    ticker.e === "24hrTicker" &&
    typeof ticker.s === "string" &&
    typeof ticker.c === "string"
  );
}

