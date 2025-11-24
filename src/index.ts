/**
 * Entry point for the crypto dashboard backend.
 * 
 * This file initializes the system, starts connectors, and begins data ingestion.
 */

import { logger } from "./utils/logger.js";
import { getConfig } from "./utils/config.js";
import { BybitConnector } from "./connectors/bybit/index.js";
import { BinanceConnector } from "./connectors/binance/index.js";
import { MarketStore } from "./store/markets.js";
import { LeaderboardStore } from "./store/leaderboards.js";
import { EnhancedLeaderboardStore } from "./store/enhanced-leaderboards.js";
import { MetricsManager } from "./compute/metrics-manager.js";
import { aggregateMarketsBySymbol } from "./compute/cross-exchange.js";
import { ApiServer } from "./api/server.js";
import { getTopBybitSymbols } from "./connectors/bybit/symbols.js";
import { getTopBinanceSymbols } from "./connectors/binance/rest.js";
import type { UnifiedMarket } from "./types/unified.js";
import type { AggregatedMarket } from "./compute/cross-exchange.js";

// Global stores
const marketStore = new MarketStore();
const leaderboardStore = new LeaderboardStore();
const enhancedLeaderboardStore = new EnhancedLeaderboardStore();
const metricsManager = new MetricsManager();
const aggregatedStore = new Map<string, AggregatedMarket>();

// Connectors
const bybitConnector = new BybitConnector();
const binanceConnector = new BinanceConnector();

// API server
const apiServer = new ApiServer({
  port: parseInt(process.env.PORT || "3000", 10),
  marketStore,
  leaderboardStore,
  enhancedLeaderboardStore,
  getMetricsStore: () => metricsManager.getAll(),
  aggregatedStore,
  bybitConnector,
  binanceConnector,
});

// Update intervals
let leaderboardUpdateInterval: NodeJS.Timeout | null = null;
let aggregatedUpdateInterval: NodeJS.Timeout | null = null;

async function main() {
  logger.info("Starting crypto dashboard backend");

  const config = getConfig();
  logger.info("Configuration loaded", {
    exchanges: {
      binance: config.exchanges.binance.enabled,
      bybit: config.exchanges.bybit.enabled,
      okx: config.exchanges.okx.enabled,
      hyperliquid: config.exchanges.hyperliquid.enabled,
    },
  });

  // Set up connector event handlers
  setupBybitHandlers();
  setupBinanceHandlers();

  // Initialize and start connectors if enabled
  if (config.exchanges.bybit.enabled) {
    await initializeBybit();
  } else {
    logger.info("Bybit connector disabled in config");
  }

  if (config.exchanges.binance.enabled) {
    await initializeBinance();
  } else {
    logger.info("Binance connector disabled in config");
  }

  // Start metrics computation
  metricsManager.start();

  // Start API server
  await apiServer.start();

  // Start leaderboard updates
  startLeaderboardUpdates();

  // Start cross-exchange aggregation
  startAggregatedUpdates();

  logger.info("System initialized and running", {
    apiPort: parseInt(process.env.PORT || "3000", 10),
  });

  // Log health periodically
  setInterval(() => {
    logHealth();
  }, 30000); // Every 30 seconds
}

/**
 * Set up Bybit connector event handlers.
 */
function setupBybitHandlers(): void {
  // Handle normalized market data
  bybitConnector.on("market", (market: UnifiedMarket) => {
    // Update market store
    marketStore.set(market);
    // Update metrics manager
    metricsManager.updateMarket(market);
  });

  // Handle connection state changes
  bybitConnector.on("connection", (state) => {
    logger.info("Bybit connection state changed", { state });
  });

  // Handle errors
  bybitConnector.on("error", (error) => {
    logger.error("Bybit connector error", new Error(error.message), {
      code: error.code,
    });
  });
}

/**
 * Set up Binance connector event handlers.
 */
function setupBinanceHandlers(): void {
  // Handle normalized market data
  binanceConnector.on("market", (market: UnifiedMarket) => {
    // Update market store
    marketStore.set(market);
    // Update metrics manager
    metricsManager.updateMarket(market);
  });

  // Handle connection state changes
  binanceConnector.on("connection", (state) => {
    logger.info("Binance connection state changed", { state });
  });

  // Handle errors
  binanceConnector.on("error", (error) => {
    logger.error("Binance connector error", new Error(error.message), {
      code: error.code,
    });
  });
}

/**
 * Initialize and start Bybit connector.
 */
async function initializeBybit(): Promise<void> {
  try {
    logger.info("Initializing Bybit connector");

    // Initialize connector (fetches symbols)
    await bybitConnector.initialize();

    // Start connector (connects WebSocket)
    await bybitConnector.start();

    // Wait a bit for connection to establish
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Get top symbols to subscribe to
    const config = getConfig();
    const symbolCount =
      config.exchanges.bybit.symbols === "all"
        ? 200
        : config.exchanges.bybit.symbols === "top100"
        ? 100
        : Array.isArray(config.exchanges.bybit.symbols)
        ? config.exchanges.bybit.symbols.length
        : 50;

    logger.info("Fetching top Bybit symbols", { count: symbolCount });
    const topSymbols = await getTopBybitSymbols(symbolCount);

    // Subscribe to tickers
    logger.info("Subscribing to Bybit tickers", {
      symbolCount: topSymbols.length,
    });
    await bybitConnector.subscribeToTickers(topSymbols);

    logger.info("Bybit connector started and subscribed", {
      symbolCount: topSymbols.length,
    });
  } catch (error) {
    logger.error("Failed to initialize Bybit connector", error as Error);
    throw error;
  }
}

/**
 * Initialize and start Binance connector.
 */
async function initializeBinance(): Promise<void> {
  try {
    logger.info("Initializing Binance connector");

    // Initialize connector (fetches symbols)
    await binanceConnector.initialize();

    // Start connector (connects WebSocket)
    await binanceConnector.start();

    // Wait a bit for connection to establish
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Get top symbols to subscribe to
    const config = getConfig();
    const symbolCount =
      config.exchanges.binance.symbols === "all"
        ? 200
        : config.exchanges.binance.symbols === "top100"
        ? 100
        : Array.isArray(config.exchanges.binance.symbols)
        ? config.exchanges.binance.symbols.length
        : 50;

    logger.info("Fetching top Binance symbols", { count: symbolCount });
    const topSymbols = await getTopBinanceSymbols(symbolCount);

    // Subscribe to tickers
    logger.info("Subscribing to Binance tickers", {
      symbolCount: topSymbols.length,
    });
    await binanceConnector.subscribeToTickers(topSymbols);

    logger.info("Binance connector started and subscribed", {
      symbolCount: topSymbols.length,
    });
  } catch (error) {
    logger.error("Failed to initialize Binance connector", error as Error);
    throw error;
  }
}

/**
 * Start periodic leaderboard updates.
 */
function startLeaderboardUpdates(): void {
  const config = getConfig();
  const intervalMs = config.compute.leaderboardUpdateIntervalMs;

  // Update immediately
  updateLeaderboards();

  // Then update periodically
  leaderboardUpdateInterval = setInterval(() => {
    updateLeaderboards();
  }, intervalMs);

  logger.info("Leaderboard updates started", { intervalMs });
}

/**
 * Update all leaderboards.
 */
function updateLeaderboards(): void {
  const markets = marketStore.getAll();
  const metrics = metricsManager.getAll();
  
  // Update basic leaderboards
  leaderboardStore.update(markets);
  
  // Update enhanced leaderboards
  enhancedLeaderboardStore.update(markets, metrics);
}

/**
 * Start cross-exchange aggregation updates.
 */
function startAggregatedUpdates(): void {
  // Update immediately
  updateAggregated();

  // Then update periodically (every 5 seconds)
  aggregatedUpdateInterval = setInterval(() => {
    updateAggregated();
  }, 5000);

  logger.info("Cross-exchange aggregation started", { intervalMs: 5000 });
}

/**
 * Update aggregated markets.
 */
function updateAggregated(): void {
  const markets = marketStore.getAll();
  const aggregated = aggregateMarketsBySymbol(markets);
  
  // Clear and update
  aggregatedStore.clear();
  for (const [symbol, data] of aggregated.entries()) {
    aggregatedStore.set(symbol, data);
  }
}

/**
 * Log system health.
 */
function logHealth(): void {
  const bybitHealth = bybitConnector.getHealth();
  const binanceHealth = binanceConnector.getHealth();
  const stats = marketStore.getStats();

  logger.info("System health", {
    bybit: {
      connected: bybitHealth.isConnected,
      subscriptions: bybitHealth.subscriptionCount,
      messageRate: bybitHealth.messageRate.toFixed(2),
      reconnectCount: bybitHealth.reconnectCount,
    },
    binance: {
      connected: binanceHealth.isConnected,
      subscriptions: binanceHealth.subscriptionCount,
      messageRate: binanceHealth.messageRate.toFixed(2),
      reconnectCount: binanceHealth.reconnectCount,
    },
    markets: {
      total: stats.totalMarkets,
      stale: stats.staleMarkets,
    },
  });
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  logger.info("Received SIGINT, shutting down gracefully");

  // Stop update intervals
  if (leaderboardUpdateInterval) {
    clearInterval(leaderboardUpdateInterval);
  }
  if (aggregatedUpdateInterval) {
    clearInterval(aggregatedUpdateInterval);
  }

  // Stop metrics computation
  metricsManager.stop();

  // Stop connectors
  if (bybitConnector) {
    await bybitConnector.stop();
  }
  if (binanceConnector) {
    await binanceConnector.stop();
  }

  // Stop API server
  await apiServer.stop();

  logger.info("Shutdown complete");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM, shutting down gracefully");

  // Stop update intervals
  if (leaderboardUpdateInterval) {
    clearInterval(leaderboardUpdateInterval);
  }
  if (aggregatedUpdateInterval) {
    clearInterval(aggregatedUpdateInterval);
  }

  // Stop metrics computation
  metricsManager.stop();

  // Stop connectors
  if (bybitConnector) {
    await bybitConnector.stop();
  }
  if (binanceConnector) {
    await binanceConnector.stop();
  }

  // Stop API server
  await apiServer.stop();

  logger.info("Shutdown complete");
  process.exit(0);
});

// Start the application
main().catch((error) => {
  logger.error("Fatal error in main", error);
  process.exit(1);
});
