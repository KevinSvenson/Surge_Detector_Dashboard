/**
 * Binance Futures REST API Client
 * 
 * Handles REST API calls for symbol info, open interest polling, etc.
 */

import axios from "axios";
import { logger } from "../../utils/logger.js";
import type {
  BinanceExchangeInfo,
  BinanceOpenInterest,
  BinanceMarkPrice,
  Binance24hrTicker,
} from "../../types/binance.js";
import type { SymbolInfo } from "../../types/exchanges.js";

const REST_BASE_URL = "https://fapi.binance.com";

/**
 * Fetch exchange info (symbols list)
 */
export async function fetchBinanceSymbols(): Promise<SymbolInfo[]> {
  const url = `${REST_BASE_URL}/fapi/v1/exchangeInfo`;

  try {
    logger.info("Fetching Binance symbols", { url });

    const response = await axios.get<BinanceExchangeInfo>(url, {
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CryptoDashboard/1.0)",
        "Accept": "application/json",
      },
    });

    const symbols = response.data.symbols;

    // Filter for active perpetual contracts
    const perpetuals = symbols.filter(
      (symbol) =>
        symbol.status === "TRADING" &&
        symbol.contractType === "PERPETUAL"
    );

    logger.info("Fetched Binance symbols", {
      total: symbols.length,
      perpetuals: perpetuals.length,
    });

    // Convert to SymbolInfo
    const symbolInfos: SymbolInfo[] = perpetuals.map((symbol) => ({
      exchangeSymbol: symbol.symbol,
      normalizedSymbol: normalizeBinanceSymbol(symbol.symbol),
      baseAsset: symbol.baseAsset,
      quoteAsset: symbol.quoteAsset,
      contractType: "perpetual",
      isActive: symbol.status === "TRADING",
    }));

    return symbolInfos;
  } catch (error) {
    logger.error("Failed to fetch Binance symbols", error as Error);
    throw error;
  }
}

/**
 * Normalize Binance symbol to unified format.
 * Example: "BTCUSDT" → "BTC-USDT-PERP"
 */
function normalizeBinanceSymbol(exchangeSymbol: string): string {
  // Binance perpetuals are typically BASE + QUOTE (e.g., BTCUSDT)
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
 * Fetch open interest for a symbol
 */
export async function fetchOpenInterest(symbol: string): Promise<BinanceOpenInterest> {
  const url = `${REST_BASE_URL}/fapi/v1/openInterest`;

  try {
    const response = await axios.get<BinanceOpenInterest>(url, {
      params: { symbol },
      timeout: 5000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CryptoDashboard/1.0)",
      },
    });

    return response.data;
  } catch (error) {
    logger.error("Failed to fetch open interest", error as Error, { symbol });
    throw error;
  }
}

/**
 * Fetch mark price for a symbol
 */
export async function fetchMarkPrice(symbol: string): Promise<BinanceMarkPrice> {
  const url = `${REST_BASE_URL}/fapi/v1/premiumIndex`;

  try {
    const response = await axios.get<BinanceMarkPrice | BinanceMarkPrice[]>(url, {
      params: { symbol },
      timeout: 5000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CryptoDashboard/1.0)",
      },
    });

    // API returns array if no symbol specified, single object if symbol specified
    const data = Array.isArray(response.data) ? response.data[0] : response.data;
    return data as BinanceMarkPrice;
  } catch (error) {
    logger.error("Failed to fetch mark price", error as Error, { symbol });
    throw error;
  }
}

/**
 * Fetch 24hr ticker statistics
 */
export async function fetch24hrTicker(symbol: string): Promise<Binance24hrTicker> {
  const url = `${REST_BASE_URL}/fapi/v1/ticker/24hr`;

  try {
    const response = await axios.get<Binance24hrTicker | Binance24hrTicker[]>(url, {
      params: { symbol },
      timeout: 5000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CryptoDashboard/1.0)",
      },
    });

    // API returns array if no symbol specified, single object if symbol specified
    const data = Array.isArray(response.data) ? response.data[0] : response.data;
    return data as Binance24hrTicker;
  } catch (error) {
    logger.error("Failed to fetch 24hr ticker", error as Error, { symbol });
    throw error;
  }
}

/**
 * Get top symbols by 24h volume
 */
export async function getTopBinanceSymbols(count: number = 50): Promise<string[]> {
  try {
    const url = `${REST_BASE_URL}/fapi/v1/ticker/24hr`;
    const response = await axios.get<Binance24hrTicker[]>(url, {
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CryptoDashboard/1.0)",
      },
    });

    // Sort by quote volume (USDT volume) descending
    const sorted = response.data
      .filter((ticker) => ticker.symbol.endsWith("USDT"))
      .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, count)
      .map((ticker) => ticker.symbol);

    logger.info("Fetched top Binance symbols by volume", { count: sorted.length });
    return sorted;
  } catch (error) {
    logger.warn("Failed to fetch top symbols, using fallback", { error });
    return getFallbackSymbols(count);
  }
}

/**
 * Fallback list of common Binance perpetual symbols
 */
function getFallbackSymbols(count: number): string[] {
  const commonSymbols = [
    "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
    "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "TRXUSDT", "LINKUSDT",
    "DOTUSDT", "MATICUSDT", "LTCUSDT", "UNIUSDT", "ATOMUSDT",
    "ETCUSDT", "XLMUSDT", "ALGOUSDT", "VETUSDT", "ICPUSDT",
    "FILUSDT", "THETAUSDT", "EOSUSDT", "AAVEUSDT", "MKRUSDT",
    "GRTUSDT", "SANDUSDT", "MANAUSDT", "AXSUSDT", "CRVUSDT",
    "COMPUSDT", "SNXUSDT", "YFIUSDT", "SUSHIUSDT", "1INCHUSDT",
    "ENJUSDT", "CHZUSDT", "BATUSDT", "ZECUSDT", "DASHUSDT",
    "NEARUSDT", "FTMUSDT", "ALPHAUSDT", "ZILUSDT", "ONTUSDT",
    "QTUMUSDT", "IOTAUSDT", "WAVESUSDT", "OMGUSDT", "ZRXUSDT",
  ];
  return commonSymbols.slice(0, count);
}

