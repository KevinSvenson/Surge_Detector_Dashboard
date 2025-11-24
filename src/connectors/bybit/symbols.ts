/**
 * Bybit Symbol Registry
 * 
 * Fetches and caches available perpetual symbols from Bybit.
 */

import axios from "axios";
import { logger } from "../../utils/logger.js";
import type { SymbolInfo } from "../../types/exchanges.js";
import { normalizeBybitSymbol } from "./normalizer.js";

interface BybitInstrument {
  symbol: string;
  contractType: string;
  status: string;
  baseCoin: string;
  quoteCoin: string;
  launchTime: string;
  deliveryTime: string;
  deliveryFeeRate: string;
  priceScale: string;
  leverageFilter: unknown;
  priceFilter: unknown;
  lotSizeFilter: unknown;
}

interface BybitInstrumentsResponse {
  retCode: number;
  retMsg: string;
  result: {
    category: string;
    list: BybitInstrument[];
  };
}

/**
 * Fetch available perpetual symbols from Bybit.
 */
export async function fetchBybitSymbols(): Promise<SymbolInfo[]> {
  const url = "https://api.bybit.com/v5/market/instruments-info";
  
  try {
    logger.info("Fetching Bybit symbols", { url });
    
    const response = await axios.get<BybitInstrumentsResponse>(url, {
      params: {
        category: "linear",
      },
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CryptoDashboard/1.0)",
        "Accept": "application/json",
      },
    });
    
    if (response.data.retCode !== 0) {
      throw new Error(`Bybit API error: ${response.data.retMsg}`);
    }
    
    const instruments = response.data.result.list;
    
    // Filter for active perpetual contracts
    const perpetuals = instruments.filter(
      (inst) =>
        inst.status === "Trading" &&
        inst.contractType === "LinearPerpetual"
    );
    
    logger.info("Fetched Bybit symbols", {
      total: instruments.length,
      perpetuals: perpetuals.length,
    });
    
    // Convert to SymbolInfo
    const symbols: SymbolInfo[] = perpetuals.map((inst) => ({
      exchangeSymbol: inst.symbol,
      normalizedSymbol: normalizeBybitSymbol(inst.symbol),
      baseAsset: inst.baseCoin,
      quoteAsset: inst.quoteCoin,
      contractType: "perpetual",
      isActive: inst.status === "Trading",
    }));
    
    return symbols;
  } catch (error) {
    logger.error("Failed to fetch Bybit symbols", error as Error);
    throw error;
  }
}

/**
 * Get top N symbols by volume (for initial subscription).
 * This is a placeholder - in production, you'd want to fetch 24h volume
 * and sort by that. For now, we'll just return the first N active symbols.
 */
export async function getTopBybitSymbols(count: number = 50): Promise<string[]> {
  try {
    const symbols = await fetchBybitSymbols();
    
    // For Phase 1A, just return first N active symbols
    // In production, you'd sort by volume24h
    return symbols
      .filter((s) => s.isActive)
      .slice(0, count)
      .map((s) => s.exchangeSymbol);
  } catch (error) {
    // Fallback: return common symbols if API fails
    logger.warn("Failed to fetch symbols from API, using fallback list", { error });
    return getFallbackSymbols(count);
  }
}

/**
 * Fallback list of common Bybit perpetual symbols.
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

