/**
 * Binance Connector Implementation
 * 
 * Implements the ExchangeConnector interface for Binance USDT-M Futures.
 */

import { EventEmitter } from "eventemitter3";
import type { ExchangeConnector } from "../interface.js";
import type { Exchange } from "../../types/unified.js";
import type {
  SymbolInfo,
  ConnectorHealth,
  PollingConfig,
  ConnectionState,
  ConnectorError,
} from "../../types/exchanges.js";
import { BinanceWebSocketManager } from "./websocket.js";
import {
  normalizeBinanceTicker,
  validateBinanceTicker,
  normalizeBinanceSymbol,
} from "./normalizer.js";
import {
  fetchBinanceSymbols,
  fetchOpenInterest,
} from "./rest.js";
import { logger } from "../../utils/logger.js";
import type {
  BinanceTickerMessage,
  BinanceMarkPriceMessage,
  BinanceBookTickerMessage,
} from "../../types/binance.js";

interface BinanceStreamMessage {
  stream: string;
  data: unknown;
  connectionIndex?: number;
}

export class BinanceConnector extends EventEmitter implements ExchangeConnector {
  readonly exchangeId: Exchange = "binance";
  readonly displayName = "Binance";
  readonly type: "cex" | "dex" = "cex";

  private wsManager: BinanceWebSocketManager;
  private symbols: Map<string, SymbolInfo> = new Map();
  private isInitialized = false;
  private isStarted = false;
  private messageCount = 0;
  private lastMessageTime = 0;
  private reconnectCount = 0;
  private errors: ConnectorError[] = [];
  private subscribedSymbols: Set<string> = new Set();

  // Data caches for combining multiple streams
  private tickerCache: Map<string, BinanceTickerMessage> = new Map();
  private markPriceCache: Map<string, BinanceMarkPriceMessage> = new Map();
  private bookTickerCache: Map<string, BinanceBookTickerMessage> = new Map();

  // REST polling
  private oiPollingInterval: NodeJS.Timeout | null = null;
  private oiPollingIntervalMs = 30000; // 30 seconds

  constructor() {
    super();
    this.wsManager = new BinanceWebSocketManager();
    this.setupWebSocketHandlers();
  }

  // ══════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ══════════════════════════════════════════════════════════════════════

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn("Binance connector already initialized");
      return;
    }

    logger.info("Initializing Binance connector");

    try {
      const symbolList = await fetchBinanceSymbols();

      for (const symbol of symbolList) {
        this.symbols.set(symbol.exchangeSymbol, symbol);
      }

      logger.info("Binance connector initialized", {
        symbolCount: this.symbols.size,
      });

      this.isInitialized = true;
    } catch (error) {
      logger.warn("Failed to fetch symbol list, will use fallback symbols", { error });
      this.isInitialized = true;
    }
  }

  async start(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error("Binance connector must be initialized before starting");
    }

    if (this.isStarted) {
      logger.warn("Binance connector already started");
      return;
    }

    logger.info("Starting Binance connector");

    this.wsManager.connect();
    this.startOIPolling();

    this.isStarted = true;
  }

  async stop(): Promise<void> {
    logger.info("Stopping Binance connector");

    await this.unsubscribeAll();
    this.stopOIPolling();
    this.wsManager.disconnect();

    this.isStarted = false;
  }

  getHealth(): ConnectorHealth {
    const now = Date.now();
    const messageRate =
      this.lastMessageTime > 0 && now > this.lastMessageTime
        ? this.messageCount / ((now - this.lastMessageTime) / 1000)
        : 0;

    const stats = this.wsManager.getConnectionStats();

    return {
      isConnected: this.wsManager.isConnected(),
      connectionCount: stats.totalConnections,
      subscriptionCount: this.subscribedSymbols.size,
      messageRate,
      lastMessageTime: this.lastMessageTime,
      reconnectCount: this.reconnectCount,
      errors: [...this.errors].slice(-10),
      extra: {
        wsConnections: stats.totalConnections,
        wsConnectedCount: stats.connectedCount,
        totalStreams: stats.totalStreams,
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // SYMBOL MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════

  async getAvailableSymbols(): Promise<SymbolInfo[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return Array.from(this.symbols.values());
  }

  normalizeSymbol(exchangeSymbol: string): string {
    const symbolInfo = this.symbols.get(exchangeSymbol);
    if (symbolInfo) {
      return symbolInfo.normalizedSymbol;
    }
    return normalizeBinanceSymbol(exchangeSymbol);
  }

  denormalizeSymbol(normalizedSymbol: string): string {
    for (const [exchangeSymbol, info] of this.symbols.entries()) {
      if (info.normalizedSymbol === normalizedSymbol) {
        return exchangeSymbol;
      }
    }

    const parts = normalizedSymbol.split("-");
    if (parts.length >= 2) {
      return parts[0] + parts[1];
    }

    return normalizedSymbol;
  }

  // ══════════════════════════════════════════════════════════════════════
  // DATA SUBSCRIPTIONS
  // ══════════════════════════════════════════════════════════════════════

  async subscribeToTickers(symbols: string[]): Promise<void> {
    if (!this.isStarted) {
      throw new Error("Connector must be started before subscribing");
    }

    const exchangeSymbols = symbols.map((symbol) => {
      if (this.symbols.has(symbol)) {
        return symbol;
      }
      return this.denormalizeSymbol(symbol);
    });

    // Binance uses combined streams: symbol@ticker, symbol@markPrice@1s, symbol@bookTicker
    const streams: string[] = [];

    for (const symbol of exchangeSymbols) {
      const lowerSymbol = symbol.toLowerCase();
      streams.push(`${lowerSymbol}@ticker`);
      streams.push(`${lowerSymbol}@markPrice@1s`);
      streams.push(`${lowerSymbol}@bookTicker`);
    }

    // Subscribe via WebSocket manager
    this.wsManager.subscribe(streams);

    // Track subscriptions
    exchangeSymbols.forEach((symbol) => this.subscribedSymbols.add(symbol));

    logger.info("Subscribed to Binance tickers", {
      symbolCount: exchangeSymbols.length,
      streamCount: streams.length,
    });
  }

  async subscribeToOrderBooks(
    _symbols: string[],
    _depth: number = 20
  ): Promise<void> {
    logger.warn("Order book subscriptions not implemented in Phase 1B");
  }

  /**
   * Subscribe to trade events.
   * 
   * NOTE: Trade subscriptions are not yet implemented.
   * This means metrics that depend on trade data will be zero or unavailable:
   * - CVD (Cumulative Volume Delta) - all timeframes
   * - Taker buy ratio - all timeframes
   * - Volume surge - requires trade volume data
   * - Volume windows (1m, 5m, 15m, 1h) - not populated
   * 
   * Metrics that work with ticker data only:
   * - Price changes (1m, 5m, 15m, 1h) ✓
   * - Price velocity and acceleration ✓
   * - Funding rates ✓
   * - Spread metrics ✓
   * 
   * To implement: Subscribe to Binance {symbol}@aggTrade WebSocket streams.
   */
  async subscribeToTrades(_symbols: string[]): Promise<void> {
    logger.warn("Trade subscriptions not implemented - CVD, volume surge, and taker buy ratio metrics will be unavailable");
  }

  async subscribeToLiquidations(_symbols: string[]): Promise<void> {
    logger.warn("Liquidation subscriptions not implemented in Phase 1B");
  }

  async unsubscribeAll(): Promise<void> {
    this.wsManager.unsubscribeAll();
    this.subscribedSymbols.clear();
    logger.info("Unsubscribed from all Binance streams");
  }

  // ══════════════════════════════════════════════════════════════════════
  // REST POLLING
  // ══════════════════════════════════════════════════════════════════════

  async pollRestData(): Promise<void> {
    // Open Interest polling is handled by startOIPolling()
    logger.debug("REST polling handled by interval");
  }

  getPollingConfig(): PollingConfig {
    return {
      endpoints: [
        {
          name: "openInterest",
          intervalMs: this.oiPollingIntervalMs,
          symbols: Array.from(this.subscribedSymbols),
        },
      ],
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ══════════════════════════════════════════════════════════════════════

  private setupWebSocketHandlers(): void {
    this.wsManager.on("connection", (state: ConnectionState) => {
      if (state === "connected") {
        this.reconnectCount++;
      }
      this.emit("connection", state);
    });

    this.wsManager.on("message", (msg: BinanceStreamMessage) => {
      this.handleStreamMessage(msg);
    });

    this.wsManager.on("error", (error: Error) => {
      this.recordError("websocket_error", error.message);
      this.emit("error", {
        code: "websocket_error",
        message: error.message,
        timestamp: Date.now(),
      });
    });
  }

  private handleStreamMessage(msg: BinanceStreamMessage): void {
    this.messageCount++;
    this.lastMessageTime = Date.now();

    // Parse stream name: "btcusdt@ticker", "btcusdt@markPrice@1s", etc.
    const streamParts = msg.stream.split("@");
    if (streamParts.length < 2) {
      return;
    }

    const symbol = streamParts[0].toUpperCase();
    const streamType = streamParts[1];

    // Route message by type
    if (streamType === "ticker") {
      if (validateBinanceTicker(msg.data)) {
        this.tickerCache.set(symbol, msg.data);
        this.emitMarketUpdate(symbol);
      }
    } else if (streamType === "markPrice") {
      const markPriceData = msg.data as BinanceMarkPriceMessage;
      if (markPriceData.e === "markPriceUpdate") {
        this.markPriceCache.set(symbol, markPriceData);
        this.emitMarketUpdate(symbol);
      }
    } else if (streamType === "bookTicker") {
      const bookTickerData = msg.data as BinanceBookTickerMessage;
      if (bookTickerData.e === "bookTicker") {
        this.bookTickerCache.set(symbol, bookTickerData);
        this.emitMarketUpdate(symbol);
      }
    }
  }

  private emitMarketUpdate(symbol: string): void {
    const ticker = this.tickerCache.get(symbol);
    if (!ticker) {
      return; // Wait for ticker data
    }

    const markPrice = this.markPriceCache.get(symbol);
    const bookTicker = this.bookTickerCache.get(symbol);

    try {
      const market = normalizeBinanceTicker(
        symbol,
        ticker,
        markPrice,
        undefined, // Index price not in separate stream
        bookTicker
      );

      this.emit("market", market);
    } catch (error) {
      logger.error("Failed to normalize Binance ticker", error as Error, {
        symbol,
      });
      this.recordError("normalization_error", (error as Error).message);
    }
  }

  private startOIPolling(): void {
    this.stopOIPolling();

    this.oiPollingInterval = setInterval(async () => {
      if (this.subscribedSymbols.size === 0) {
        return;
      }

      // Poll OI for subscribed symbols (rate limit: ~10 req/sec)
      const symbols = Array.from(this.subscribedSymbols).slice(0, 10); // Limit to 10 per interval

      for (const symbol of symbols) {
        try {
          const oi = await fetchOpenInterest(symbol);
          // Update market with OI data
          // This would require updating the market store directly or emitting an OI update event
          logger.debug("Fetched open interest", { symbol, oi: oi.openInterest });
        } catch (error) {
          logger.warn("Failed to fetch open interest", { symbol, error });
        }

        // Rate limit: wait 100ms between requests
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }, this.oiPollingIntervalMs);

    logger.info("Started Open Interest polling", {
      intervalMs: this.oiPollingIntervalMs,
    });
  }

  private stopOIPolling(): void {
    if (this.oiPollingInterval) {
      clearInterval(this.oiPollingInterval);
      this.oiPollingInterval = null;
    }
  }

  private recordError(code: string, message: string): void {
    const error: ConnectorError = {
      code,
      message,
      timestamp: Date.now(),
    };

    this.errors.push(error);

    if (this.errors.length > 100) {
      this.errors = this.errors.slice(-100);
    }
  }
}

