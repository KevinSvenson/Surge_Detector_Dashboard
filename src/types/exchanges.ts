/**
 * Exchange-specific types and configurations.
 * These types are used internally by connectors but should not leak
 * into the unified data store.
 */

import type { Exchange } from "./unified.js";

// ══════════════════════════════════════════════════════════════════════
// SYMBOL INFORMATION
// ══════════════════════════════════════════════════════════════════════

export interface SymbolInfo {
  exchangeSymbol: string;
  normalizedSymbol: string;
  baseAsset: string;
  quoteAsset: string;
  contractType: "perpetual" | "quarterly" | "spot";
  isActive: boolean;
}

// ══════════════════════════════════════════════════════════════════════
// CONNECTOR HEALTH & STATUS
// ══════════════════════════════════════════════════════════════════════

export interface ConnectorHealth {
  isConnected: boolean;
  connectionCount: number;
  subscriptionCount: number;
  messageRate: number;          // Messages per second
  lastMessageTime: number;
  reconnectCount: number;
  errors: ConnectorError[];
  extra?: Record<string, unknown>; // Additional exchange-specific health data
}

export interface ConnectorError {
  code: string;
  message: string;
  timestamp: number;
  context?: Record<string, unknown>;
}

export type ConnectionState = 
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

// ══════════════════════════════════════════════════════════════════════
// POLLING CONFIGURATION
// ══════════════════════════════════════════════════════════════════════

export interface PollingConfig {
  endpoints: {
    name: string;
    intervalMs: number;
    symbols: string[] | "all";
  }[];
}

// ══════════════════════════════════════════════════════════════════════
// EXCHANGE-SPECIFIC CONFIGURATIONS
// ══════════════════════════════════════════════════════════════════════

export interface ExchangeConfig {
  exchange: Exchange;
  enabled: boolean;
  symbols: string[] | "top100" | "all";
  
  // Exchange-specific settings
  wsBaseUrl?: string;
  restBaseUrl?: string;
  
  // Rate limits
  rateLimits?: {
    requestsPerSecond?: number;
    requestsPerMinute?: number;
    maxConnections?: number;
    maxSubscriptions?: number;
  };
  
  // Data capabilities
  capabilities?: {
    hasRealTimeOI: boolean;
    hasFullLiquidations: boolean;
    hasFunding: boolean;
    hasLongShortRatio: boolean;
    hasTransparentPositions?: boolean; // Hyperliquid only
  };
}

// ══════════════════════════════════════════════════════════════════════
// HYPERLIQUID-SPECIFIC TYPES
// ══════════════════════════════════════════════════════════════════════

export interface LiquidationRisk {
  address: string;
  coin: string;
  side: "long" | "short";
  distanceToLiqPercent: number;
  positionSizeUsd: number;
  liquidationPrice: number;
  currentPrice: number;
  riskLevel: "low" | "medium" | "high" | "critical";
}

