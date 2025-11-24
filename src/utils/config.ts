/**
 * Configuration system for the crypto dashboard backend.
 * Loads configuration from JSON files and environment variables.
 */

import { readFileSync } from "fs";
import { join } from "path";
import type { Exchange } from "../types/unified.js";
import type { ExchangeConfig } from "../types/exchanges.js";
import { logger } from "./logger.js";

// ══════════════════════════════════════════════════════════════════════
// CONFIGURATION INTERFACE
// ══════════════════════════════════════════════════════════════════════

export interface SystemConfig {
  // Exchange enablement
  exchanges: {
    binance: { enabled: boolean; symbols: string[] | "top100" | "all" };
    bybit: { enabled: boolean; symbols: string[] | "top100" | "all" };
    okx: { enabled: boolean; symbols: string[] | "top100" | "all" };
    hyperliquid: { enabled: boolean; addressScanCount: number };
  };

  // Data retention
  rolling: {
    tradeBucketSizeMs: number;    // Default: 1000 (1 second)
    tradeBucketCount: number;      // Default: 14400 (4 hours)
    priceBucketSizeMs: number;     // Default: 1000
    priceBucketCount: number;      // Default: 86400 (24 hours)
  };

  // Computation
  compute: {
    derivedMetricsIntervalMs: number;      // Default: 250
    leaderboardUpdateIntervalMs: number;   // Default: 100
    compositeScoreIntervalMs: number;       // Default: 1000
  };

  // Hyperliquid scanning
  hyperliquid: {
    priorityScanIntervalMs: number;    // Default: 10000
    backgroundScanIntervalMs: number;  // Default: 60000
    maxParallelScans: number;          // Default: 20
    atRiskThresholdPercent: number;    // Default: 5
  };

  // Performance
  performance: {
    maxSymbolsPerExchange: number;     // Default: 200
    maxLeaderboardSize: number;       // Default: 500
    targetQueryLatencyMs: number;     // Default: 50
  };

  // Logging
  logging: {
    level: "debug" | "info" | "warn" | "error";
  };
}

// ══════════════════════════════════════════════════════════════════════
// DEFAULT CONFIGURATION
// ══════════════════════════════════════════════════════════════════════

const DEFAULT_CONFIG: SystemConfig = {
  exchanges: {
    binance: { enabled: false, symbols: "top100" },
    bybit: { enabled: true, symbols: "top100" },
    okx: { enabled: false, symbols: "top100" },
    hyperliquid: { enabled: false, addressScanCount: 1000 },
  },
  rolling: {
    tradeBucketSizeMs: 1000,
    tradeBucketCount: 14400,  // 4 hours
    priceBucketSizeMs: 1000,
    priceBucketCount: 86400,  // 24 hours
  },
  compute: {
    derivedMetricsIntervalMs: 250,
    leaderboardUpdateIntervalMs: 100,
    compositeScoreIntervalMs: 1000,
  },
  hyperliquid: {
    priorityScanIntervalMs: 10000,
    backgroundScanIntervalMs: 60000,
    maxParallelScans: 20,
    atRiskThresholdPercent: 5,
  },
  performance: {
    maxSymbolsPerExchange: 200,
    maxLeaderboardSize: 500,
    targetQueryLatencyMs: 50,
  },
  logging: {
    level: "info",
  },
};

// ══════════════════════════════════════════════════════════════════════
// CONFIGURATION LOADER
// ══════════════════════════════════════════════════════════════════════

class ConfigManager {
  private config: SystemConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  /**
   * Load configuration from file and environment variables.
   */
  private loadConfig(): SystemConfig {
    const configPath = process.env.CONFIG_PATH || join(process.cwd(), "config", "default.json");
    
    let fileConfig: Partial<SystemConfig> = {};
    
    try {
      const configContent = readFileSync(configPath, "utf-8");
      fileConfig = JSON.parse(configContent);
      logger.info("Configuration loaded from file", { path: configPath });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        logger.warn("Configuration file not found, using defaults", { path: configPath });
      } else {
        logger.error("Failed to load configuration file", error as Error, { path: configPath });
      }
    }

    // Merge with defaults
    const merged = this.deepMerge(DEFAULT_CONFIG, fileConfig);

    // Override with environment variables
    this.applyEnvOverrides(merged);

    return merged;
  }

  /**
   * Deep merge two objects.
   */
  private deepMerge<T>(target: T, source: Partial<T>): T {
    const output = { ...target };
    
    for (const key in source) {
      if (source[key] !== undefined) {
        if (
          typeof source[key] === "object" &&
          source[key] !== null &&
          !Array.isArray(source[key])
        ) {
          output[key] = this.deepMerge(target[key], source[key] as Partial<T[Extract<keyof T, string>]>);
        } else {
          output[key] = source[key] as T[Extract<keyof T, string>];
        }
      }
    }
    
    return output;
  }

  /**
   * Apply environment variable overrides.
   */
  private applyEnvOverrides(config: SystemConfig): void {
    // Exchange enablement
    if (process.env.BINANCE_ENABLED !== undefined) {
      config.exchanges.binance.enabled = process.env.BINANCE_ENABLED === "true";
    }
    if (process.env.BYBIT_ENABLED !== undefined) {
      config.exchanges.bybit.enabled = process.env.BYBIT_ENABLED === "true";
    }
    if (process.env.OKX_ENABLED !== undefined) {
      config.exchanges.okx.enabled = process.env.OKX_ENABLED === "true";
    }
    if (process.env.HYPERLIQUID_ENABLED !== undefined) {
      config.exchanges.hyperliquid.enabled = process.env.HYPERLIQUID_ENABLED === "true";
    }

    // Logging level
    if (process.env.LOG_LEVEL) {
      const level = process.env.LOG_LEVEL.toLowerCase();
      if (["debug", "info", "warn", "error"].includes(level)) {
        config.logging.level = level as SystemConfig["logging"]["level"];
      }
    }
  }

  /**
   * Get the current configuration.
   */
  getConfig(): SystemConfig {
    return { ...this.config };
  }

  /**
   * Get exchange-specific configuration.
   */
  getExchangeConfig(exchange: Exchange): ExchangeConfig | undefined {
    // Handle hyperliquid separately (different structure)
    if (exchange === "hyperliquid") {
      const config = this.config.exchanges.hyperliquid;
      if (!config.enabled) {
        return undefined;
      }
      return {
        exchange,
        enabled: config.enabled,
        symbols: "all", // Hyperliquid doesn't use symbols the same way
      } as ExchangeConfig;
    }

    // Handle other exchanges
    const exchanges = this.config.exchanges as unknown as Record<string, { enabled: boolean; symbols: string[] | "top100" | "all" }>;
    const exchangeConfig = exchanges[exchange];
    if (!exchangeConfig || !exchangeConfig.enabled) {
      return undefined;
    }

    // This would be expanded with exchange-specific settings
    return {
      exchange,
      enabled: exchangeConfig.enabled,
      symbols: exchangeConfig.symbols,
    } as ExchangeConfig;
  }

  /**
   * Reload configuration from file.
   */
  reload(): void {
    this.config = this.loadConfig();
    logger.info("Configuration reloaded");
  }
}

// Singleton instance
export const configManager = new ConfigManager();

// Convenience function to get config
export function getConfig(): SystemConfig {
  return configManager.getConfig();
}

