/**
 * Bybit Connector Implementation
 * 
 * Implements the ExchangeConnector interface for Bybit V5.
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
import { BybitWebSocketManager } from "./websocket.js";
import { normalizeBybitTicker, validateBybitTicker } from "./normalizer.js";
import { fetchBybitSymbols } from "./symbols.js";
import { logger } from "../../utils/logger.js";

interface BybitTickerMessage {
  topic: string;
  data: unknown;
}

export class BybitConnector extends EventEmitter implements ExchangeConnector {
  readonly exchangeId: Exchange = "bybit";
  readonly displayName = "Bybit";
  readonly type: "cex" | "dex" = "cex";

  private wsManager: BybitWebSocketManager;
  private symbols: Map<string, SymbolInfo> = new Map(); // exchangeSymbol -> SymbolInfo
  private isInitialized = false;
  private isStarted = false;
  private messageCount = 0;
  private lastMessageTime = 0;
  private reconnectCount = 0;
  private errors: ConnectorError[] = [];
  private subscribedTickers: Set<string> = new Set();

  constructor() {
    super();
    this.wsManager = new BybitWebSocketManager();
    this.setupWebSocketHandlers();
  }

  // ══════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ══════════════════════════════════════════════════════════════════════

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn("Bybit connector already initialized");
      return;
    }

    logger.info("Initializing Bybit connector");

    try {
      // Fetch available symbols
      const symbolList = await fetchBybitSymbols();
      
      // Build symbol map
      for (const symbol of symbolList) {
        this.symbols.set(symbol.exchangeSymbol, symbol);
      }

      logger.info("Bybit connector initialized", {
        symbolCount: this.symbols.size,
      });

      this.isInitialized = true;
    } catch (error) {
      // If symbol fetch fails, we can still proceed with fallback symbols
      // The connector will work, but symbol normalization might be less accurate
      logger.warn("Failed to fetch symbol list, will use fallback symbols", { error });
      
      // Mark as initialized anyway - we'll use fallback symbols
      this.isInitialized = true;
    }
  }

  async start(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error("Bybit connector must be initialized before starting");
    }

    if (this.isStarted) {
      logger.warn("Bybit connector already started");
      return;
    }

    logger.info("Starting Bybit connector");

    // Connect WebSocket
    this.wsManager.connect();

    this.isStarted = true;
  }

  async stop(): Promise<void> {
    logger.info("Stopping Bybit connector");

    // Unsubscribe from all
    await this.unsubscribeAll();

    // Disconnect WebSocket
    this.wsManager.disconnect();

    this.isStarted = false;
  }

  getHealth(): ConnectorHealth {
    const now = Date.now();
    const messageRate =
      this.lastMessageTime > 0 && now > this.lastMessageTime
        ? this.messageCount / ((now - this.lastMessageTime) / 1000)
        : 0;

    return {
      isConnected: this.wsManager.isConnected(),
      connectionCount: 1, // Single WebSocket connection
      subscriptionCount: this.subscribedTickers.size,
      messageRate,
      lastMessageTime: this.lastMessageTime,
      reconnectCount: this.reconnectCount,
      errors: [...this.errors].slice(-10), // Last 10 errors
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
    
    // Fallback: simple normalization (BASE+QUOTE -> BASE-QUOTE-PERP)
    // This is a simple fallback; in practice, symbol should be in registry
    const quotes = ["USDT", "USDC", "USD", "BTC", "ETH"];
    for (const quote of quotes) {
      if (exchangeSymbol.endsWith(quote)) {
        const base = exchangeSymbol.slice(0, -quote.length);
        return `${base}-${quote}-PERP`;
      }
    }
    
    // Last resort
    if (exchangeSymbol.length > 4) {
      const base = exchangeSymbol.slice(0, -4);
      return `${base}-USDT-PERP`;
    }
    
    return `${exchangeSymbol}-PERP`;
  }

  denormalizeSymbol(normalizedSymbol: string): string {
    // Find symbol by normalized symbol
    for (const [exchangeSymbol, info] of this.symbols.entries()) {
      if (info.normalizedSymbol === normalizedSymbol) {
        return exchangeSymbol;
      }
    }
    
    // Fallback: assume format is BASE-QUOTE-PERP, extract BASE+QUOTE
    const parts = normalizedSymbol.split("-");
    if (parts.length >= 2) {
      return parts[0] + parts[1]; // e.g., "BTC" + "USDT" = "BTCUSDT"
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

    // Convert normalized symbols to exchange symbols if needed
    const exchangeSymbols = symbols.map((symbol) => {
      // Check if it's already an exchange symbol
      if (this.symbols.has(symbol)) {
        return symbol;
      }
      // Otherwise, try to denormalize
      return this.denormalizeSymbol(symbol);
    });

    // Build topic list: "tickers.BTCUSDT"
    const topics = exchangeSymbols.map((symbol) => `tickers.${symbol}`);

    // Subscribe via WebSocket manager
    this.wsManager.subscribe(topics);

    // Track subscriptions
    exchangeSymbols.forEach((symbol) => this.subscribedTickers.add(symbol));

    logger.info("Subscribed to Bybit tickers", {
      symbolCount: exchangeSymbols.length,
      topics: topics.slice(0, 5), // Log first 5
    });
  }

  async subscribeToOrderBooks(
    _symbols: string[],
    _depth: number = 20
  ): Promise<void> {
    // Not implemented in Phase 1A
    logger.warn("Order book subscriptions not implemented in Phase 1A");
  }

  async subscribeToTrades(_symbols: string[]): Promise<void> {
    // Not implemented in Phase 1A
    logger.warn("Trade subscriptions not implemented in Phase 1A");
  }

  async subscribeToLiquidations(_symbols: string[]): Promise<void> {
    // Not implemented in Phase 1A
    logger.warn("Liquidation subscriptions not implemented in Phase 1A");
  }

  async unsubscribeAll(): Promise<void> {
    this.wsManager.unsubscribeAll();
    this.subscribedTickers.clear();
    logger.info("Unsubscribed from all Bybit topics");
  }

  // ══════════════════════════════════════════════════════════════════════
  // REST POLLING
  // ══════════════════════════════════════════════════════════════════════

  async pollRestData(): Promise<void> {
    // Bybit ticker includes OI and funding, so no REST polling needed for Phase 1A
    logger.debug("No REST polling required for Bybit tickers");
  }

  getPollingConfig(): PollingConfig {
    return {
      endpoints: [],
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ══════════════════════════════════════════════════════════════════════

  private setupWebSocketHandlers(): void {
    // Handle connection state changes
    this.wsManager.on("connection", (state: ConnectionState) => {
      if (state === "connected") {
        this.reconnectCount++;
      }
      this.emit("connection", state);
    });

    // Handle incoming messages
    this.wsManager.on("message", (msg: BybitTickerMessage) => {
      this.handleTickerMessage(msg);
    });

    // Handle errors
    this.wsManager.on("error", (error: Error) => {
      this.recordError("websocket_error", error.message);
      this.emit("error", {
        code: "websocket_error",
        message: error.message,
        timestamp: Date.now(),
      });
    });
  }

  private handleTickerMessage(msg: BybitTickerMessage): void {
    // Update message tracking
    this.messageCount++;
    this.lastMessageTime = Date.now();

    // Extract symbol from topic: "tickers.BTCUSDT"
    const topicParts = msg.topic.split(".");
    if (topicParts.length < 2 || topicParts[0] !== "tickers") {
      logger.warn("Unknown topic format", { topic: msg.topic });
      return;
    }

    const exchangeSymbol = topicParts[1];

    // Validate and normalize ticker data
    if (!validateBybitTicker(msg.data)) {
      logger.warn("Invalid ticker data", {
        symbol: exchangeSymbol,
        data: msg.data,
      });
      return;
    }

    try {
      // Normalize to UnifiedMarket
      const market = normalizeBybitTicker(exchangeSymbol, msg.data);

      // Emit normalized market data
      this.emit("market", market);
    } catch (error) {
      logger.error("Failed to normalize Bybit ticker", error as Error, {
        symbol: exchangeSymbol,
      });
      this.recordError("normalization_error", (error as Error).message);
    }
  }

  private recordError(code: string, message: string): void {
    const error: ConnectorError = {
      code,
      message,
      timestamp: Date.now(),
    };

    this.errors.push(error);

    // Keep only last 100 errors
    if (this.errors.length > 100) {
      this.errors = this.errors.slice(-100);
    }
  }
}

