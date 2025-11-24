/**
 * Abstract interface that all exchange connectors must implement.
 * This ensures consistent behavior across CEXs and DEXs.
 */

import type { EventEmitter } from "eventemitter3";
import type {
  UnifiedMarket,
  UnifiedOrderBook,
  UnifiedTrade,
  UnifiedLiquidation,
  Exchange,
} from "../types/unified.js";
import type {
  SymbolInfo,
  ConnectorHealth,
  PollingConfig,
  ConnectionState,
  ConnectorError,
} from "../types/exchanges.js";
import type {
  HyperliquidPosition,
  LiquidationCluster,
} from "../types/unified.js";
import type { LiquidationRisk } from "../types/exchanges.js";

// ══════════════════════════════════════════════════════════════════════
// BASE EXCHANGE CONNECTOR INTERFACE
// ══════════════════════════════════════════════════════════════════════

export interface ExchangeConnector extends EventEmitter {
  // ══════════════════════════════════════════════════════════════════════
  // IDENTIFICATION
  // ══════════════════════════════════════════════════════════════════════
  
  /** Unique exchange identifier */
  readonly exchangeId: Exchange;
  
  /** Human-readable name */
  readonly displayName: string;
  
  /** Exchange type */
  readonly type: "cex" | "dex";

  // ══════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ══════════════════════════════════════════════════════════════════════
  
  /** Initialize connector, fetch symbol registry */
  initialize(): Promise<void>;
  
  /** Start data ingestion */
  start(): Promise<void>;
  
  /** Graceful shutdown */
  stop(): Promise<void>;
  
  /** Health check */
  getHealth(): ConnectorHealth;

  // ══════════════════════════════════════════════════════════════════════
  // SYMBOL MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════
  
  /** Get all available perpetual symbols */
  getAvailableSymbols(): Promise<SymbolInfo[]>;
  
  /** Convert exchange symbol to normalized format */
  normalizeSymbol(exchangeSymbol: string): string;
  
  /** Convert normalized symbol to exchange format */
  denormalizeSymbol(normalizedSymbol: string): string;

  // ══════════════════════════════════════════════════════════════════════
  // DATA SUBSCRIPTIONS
  // ══════════════════════════════════════════════════════════════════════
  
  /** Subscribe to ticker updates for symbols */
  subscribeToTickers(symbols: string[]): Promise<void>;
  
  /** Subscribe to order book updates */
  subscribeToOrderBooks(symbols: string[], depth?: number): Promise<void>;
  
  /** Subscribe to trade stream */
  subscribeToTrades(symbols: string[]): Promise<void>;
  
  /** Subscribe to liquidations (if available) */
  subscribeToLiquidations(symbols: string[]): Promise<void>;
  
  /** Unsubscribe from all */
  unsubscribeAll(): Promise<void>;

  // ══════════════════════════════════════════════════════════════════════
  // REST POLLING (Where WebSocket Unavailable)
  // ══════════════════════════════════════════════════════════════════════
  
  /** Fetch data that requires REST polling */
  pollRestData(): Promise<void>;
  
  /** Get polling configuration */
  getPollingConfig(): PollingConfig;

  // ══════════════════════════════════════════════════════════════════════
  // EVENT EMITTERS
  // ══════════════════════════════════════════════════════════════════════
  
  /** Emitted when normalized market data is ready */
  on(event: "market", callback: (data: UnifiedMarket) => void): this;
  
  /** Emitted when order book update is ready */
  on(event: "orderbook", callback: (data: UnifiedOrderBook) => void): this;
  
  /** Emitted when trade occurs */
  on(event: "trade", callback: (data: UnifiedTrade) => void): this;
  
  /** Emitted when liquidation occurs */
  on(event: "liquidation", callback: (data: UnifiedLiquidation) => void): this;
  
  /** Emitted on connection state change */
  on(event: "connection", callback: (state: ConnectionState) => void): this;
  
  /** Emitted on error */
  on(event: "error", callback: (error: ConnectorError) => void): this;
}

// ══════════════════════════════════════════════════════════════════════
// HYPERLIQUID-SPECIFIC EXTENSION
// ══════════════════════════════════════════════════════════════════════

/**
 * Extended interface for Hyperliquid with position scanning capabilities.
 */
export interface HyperliquidConnector extends Omit<ExchangeConnector, "on"> {
  // ══════════════════════════════════════════════════════════════════════
  // POSITION SCANNING (Unique to Hyperliquid)
  // ══════════════════════════════════════════════════════════════════════
  
  /** Scan a list of addresses for their positions */
  scanAddresses(addresses: string[]): Promise<HyperliquidPosition[]>;
  
  /** Get positions for a single address */
  getAddressPositions(address: string): Promise<HyperliquidPosition[]>;
  
  /** Check if an address is near liquidation */
  checkLiquidationRisk(address: string): Promise<LiquidationRisk>;
  
  /** Get aggregated liquidation clusters for a coin */
  getLiquidationClusters(coin: string): Promise<LiquidationCluster[]>;
  
  // ══════════════════════════════════════════════════════════════════════
  // ADDRESS MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════
  
  /** Get leaderboard addresses (top traders) */
  getLeaderboardAddresses(): Promise<string[]>;
  
  /** Add addresses to tracking list */
  addTrackedAddresses(addresses: string[]): void;
  
  /** Remove addresses from tracking */
  removeTrackedAddresses(addresses: string[]): void;
  
  /** Get all tracked addresses */
  getTrackedAddresses(): string[];
  
  // ══════════════════════════════════════════════════════════════════════
  // POSITION EVENTS (extends base events)
  // ══════════════════════════════════════════════════════════════════════
  
  /** Emitted when normalized market data is ready */
  on(event: "market", callback: (data: UnifiedMarket) => void): this;
  
  /** Emitted when order book update is ready */
  on(event: "orderbook", callback: (data: UnifiedOrderBook) => void): this;
  
  /** Emitted when trade occurs */
  on(event: "trade", callback: (data: UnifiedTrade) => void): this;
  
  /** Emitted when liquidation occurs */
  on(event: "liquidation", callback: (data: UnifiedLiquidation) => void): this;
  
  /** Emitted on connection state change */
  on(event: "connection", callback: (state: ConnectionState) => void): this;
  
  /** Emitted on error */
  on(event: "error", callback: (error: ConnectorError) => void): this;
  
  /** Emitted when a tracked position changes significantly */
  on(event: "position", callback: (data: HyperliquidPosition) => void): this;
  
  /** Emitted when a position approaches liquidation */
  on(event: "liquidationRisk", callback: (data: LiquidationRisk) => void): this;
}

