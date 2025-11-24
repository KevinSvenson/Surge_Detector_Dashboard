/**
 * Simple HTTP API Server
 * 
 * Provides REST endpoints for querying markets and leaderboards.
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { URL } from "url";
import { logger } from "../utils/logger.js";
import type { MarketStore } from "../store/markets.js";
import type { LeaderboardStore } from "../store/leaderboards.js";
import type { EnhancedLeaderboardStore } from "../store/enhanced-leaderboards.js";
import type { DerivedMetrics } from "../types/unified.js";
import type { AggregatedMarket } from "../compute/cross-exchange.js";

interface ApiServerOptions {
  port: number;
  marketStore: MarketStore;
  leaderboardStore: LeaderboardStore;
  enhancedLeaderboardStore?: EnhancedLeaderboardStore;
  getMetricsStore?: () => Map<string, DerivedMetrics>; // Function to get current metrics
  aggregatedStore?: Map<string, AggregatedMarket>;
  bybitConnector?: unknown; // ExchangeConnector type
  binanceConnector?: unknown; // ExchangeConnector type
}

export class ApiServer {
  private server: ReturnType<typeof createServer> | null = null;
  private port: number;
  private marketStore: MarketStore;
  private leaderboardStore: LeaderboardStore;
  private enhancedLeaderboardStore?: EnhancedLeaderboardStore;
  private getMetricsStore?: () => Map<string, DerivedMetrics>;
  private aggregatedStore?: Map<string, AggregatedMarket>;
  private bybitConnector?: unknown;
  private binanceConnector?: unknown;

  constructor(options: ApiServerOptions) {
    this.port = options.port;
    this.marketStore = options.marketStore;
    this.leaderboardStore = options.leaderboardStore;
    this.enhancedLeaderboardStore = options.enhancedLeaderboardStore;
    this.getMetricsStore = options.getMetricsStore;
    this.aggregatedStore = options.aggregatedStore;
    this.bybitConnector = options.bybitConnector;
    this.binanceConnector = options.binanceConnector;
  }

  /**
   * Start the API server.
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.listen(this.port, () => {
        logger.info("API server started", { port: this.port });
        resolve();
      });

      this.server.on("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE") {
          logger.error(`Port ${this.port} is already in use`, error);
        } else {
          logger.error("API server error", error);
        }
        reject(error);
      });
    });
  }

  /**
   * Stop the API server.
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info("API server stopped");
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Handle incoming HTTP request.
   */
  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const startTime = Date.now();
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    // Enable CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    // Route requests
    try {
      if (url.pathname === "/" || url.pathname === "") {
        this.handleRoot(req, res);
      } else if (url.pathname === "/health") {
        this.handleHealth(req, res);
      } else if (url.pathname === "/markets") {
        this.handleMarkets(req, res, url);
      } else if (url.pathname.startsWith("/markets/")) {
        this.handleMarketById(req, res, url);
      } else if (url.pathname.startsWith("/leaderboards/")) {
        this.handleLeaderboard(req, res, url);
      } else if (url.pathname === "/leaderboards") {
        this.handleLeaderboardsList(req, res);
      } else if (url.pathname === "/metrics") {
        this.handleMetrics(req, res, url);
      } else if (url.pathname.startsWith("/metrics/")) {
        this.handleMetricById(req, res, url);
      } else if (url.pathname === "/signals") {
        this.handleSignals(req, res, url);
      } else if (url.pathname.startsWith("/signals/")) {
        this.handleSignalType(req, res, url);
      } else if (url.pathname === "/aggregated") {
        this.handleAggregated(req, res, url);
      } else if (url.pathname.startsWith("/aggregated/")) {
        this.handleAggregatedBySymbol(req, res, url);
      } else if (url.pathname === "/arbitrage") {
        this.handleArbitrage(req, res, url);
      } else {
        this.handleNotFound(req, res);
      }
    } catch (error) {
      this.handleError(req, res, error as Error);
    } finally {
      const duration = Date.now() - startTime;
      logger.debug("API request", {
        method: req.method,
        path: url.pathname,
        durationMs: duration,
      });
    }
  }

  /**
   * Root endpoint - API information.
   */
  private handleRoot(
    _req: IncomingMessage,
    res: ServerResponse
  ): void {
    const response = {
      name: "Crypto Dashboard Backend API",
      version: "0.1.0",
      endpoints: {
        health: "/health",
        markets: {
          all: "/markets",
          single: "/markets/:id",
          example: "/markets/bybit:BTC-USDT-PERP",
        },
        leaderboards: {
          list: "/leaderboards",
          specific: "/leaderboards/:name",
          examples: [
            "/leaderboards/gainers_1h",
            "/leaderboards/losers_1h",
            "/leaderboards/volume_24h",
            "/leaderboards/pumping",
            "/leaderboards/dumping",
          ],
        },
        metrics: {
          all: "/metrics",
          single: "/metrics/:marketId",
        },
        signals: {
          summary: "/signals",
          pumping: "/signals/pumping",
          dumping: "/signals/dumping",
          volumeSurge: "/signals/volume-surge",
        },
        aggregated: {
          all: "/aggregated",
          symbol: "/aggregated/:symbol",
        },
        arbitrage: "/arbitrage",
      },
      documentation: "See README.md for more information",
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response, null, 2));
  }

  /**
   * Health check endpoint.
   */
  private handleHealth(
    _req: IncomingMessage,
    res: ServerResponse
  ): void {
    const stats = this.marketStore.getStats();

    // Get connector health if available
    let bybitHealth = null;
    if (this.bybitConnector && typeof this.bybitConnector === "object" && this.bybitConnector !== null) {
      const connector = this.bybitConnector as { getHealth?: () => unknown };
      if (typeof connector.getHealth === "function") {
        bybitHealth = connector.getHealth();
      }
    }

    let binanceHealth = null;
    if (this.binanceConnector && typeof this.binanceConnector === "object" && this.binanceConnector !== null) {
      const connector = this.binanceConnector as { getHealth?: () => unknown };
      if (typeof connector.getHealth === "function") {
        binanceHealth = connector.getHealth();
      }
    }

    const response = {
      status: "ok",
      timestamp: Date.now(),
      markets: {
        total: stats.totalMarkets,
        byExchange: stats.marketsByExchange,
        stale: stats.staleMarkets,
      },
      bybit: bybitHealth || { status: "connector_not_available" },
      binance: binanceHealth || { status: "connector_not_available" },
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response, null, 2));
  }

  /**
   * Get all markets.
   */
  private handleMarkets(
    _req: IncomingMessage,
    res: ServerResponse,
    url: URL
  ): void {
    const exchange = url.searchParams.get("exchange");
    const symbol = url.searchParams.get("symbol");

    let markets = this.marketStore.getAll();

    if (exchange) {
      markets = markets.filter((m) => m.exchange === exchange);
    }

    if (symbol) {
      markets = markets.filter((m) => m.symbol === symbol);
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(markets, null, 2));
  }

  /**
   * Get a single market by ID.
   */
  private handleMarketById(
    _req: IncomingMessage,
    res: ServerResponse,
    url: URL
  ): void {
    const id = url.pathname.split("/markets/")[1];

    if (!id) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Market ID required" }));
      return;
    }

    const market = this.marketStore.get(id);

    if (!market) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Market not found" }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(market, null, 2));
  }

  /**
   * Get list of all leaderboards.
   */
  private handleLeaderboardsList(
    _req: IncomingMessage,
    res: ServerResponse
  ): void {
    const store = this.enhancedLeaderboardStore || this.leaderboardStore;
    const leaderboards = store.getAvailableLeaderboards();

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        {
          leaderboards,
          count: leaderboards.length,
        },
        null,
        2
      )
    );
  }

  /**
   * Get a leaderboard.
   */
  private handleLeaderboard(
    _req: IncomingMessage,
    res: ServerResponse,
    url: URL
  ): void {
    const name = url.pathname.split("/leaderboards/")[1];

    if (!name) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Leaderboard name required" }));
      return;
    }

    const limit = parseInt(url.searchParams.get("limit") || "100", 10);

    // Try enhanced store first, fallback to basic
    const store = this.enhancedLeaderboardStore || this.leaderboardStore;
    const leaderboard = store.getLeaderboard(name as any, limit);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(leaderboard, null, 2));
  }

  /**
   * Get all metrics.
   */
  private handleMetrics(
    _req: IncomingMessage,
    res: ServerResponse,
    url: URL
  ): void {
    if (!this.getMetricsStore) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Metrics not available" }));
      return;
    }

    const metricsStore = this.getMetricsStore();
    const metrics = Array.from(metricsStore.values());
    const limit = parseInt(url.searchParams.get("limit") || "100", 10);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(metrics.slice(0, limit), null, 2));
  }

  /**
   * Get metrics for a specific market.
   */
  private handleMetricById(
    _req: IncomingMessage,
    res: ServerResponse,
    url: URL
  ): void {
    if (!this.getMetricsStore) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Metrics not available" }));
      return;
    }

    const id = url.pathname.split("/metrics/")[1];

    if (!id) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Market ID required" }));
      return;
    }

    const metricsStore = this.getMetricsStore();
    const metrics = metricsStore.get(id);

    if (!metrics) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Metrics not found" }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(metrics, null, 2));
  }

  /**
   * Get signals summary.
   */
  private handleSignals(
    _req: IncomingMessage,
    res: ServerResponse,
    _url: URL
  ): void {
    if (!this.enhancedLeaderboardStore) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Enhanced leaderboards not available" }));
      return;
    }

    const pumping = this.enhancedLeaderboardStore.get("pumping", 10);
    const dumping = this.enhancedLeaderboardStore.get("dumping", 10);
    const volumeSurge = this.enhancedLeaderboardStore.get("volume_surge", 10);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        {
          pumping: pumping.length,
          dumping: dumping.length,
          volumeSurge: volumeSurge.length,
          topPumping: pumping.slice(0, 5),
          topDumping: dumping.slice(0, 5),
        },
        null,
        2
      )
    );
  }

  /**
   * Get specific signal type.
   */
  private handleSignalType(
    _req: IncomingMessage,
    res: ServerResponse,
    url: URL
  ): void {
    if (!this.enhancedLeaderboardStore) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Enhanced leaderboards not available" }));
      return;
    }

    const signalType = url.pathname.split("/signals/")[1];
    const limit = parseInt(url.searchParams.get("limit") || "20", 10);

    let leaderboardName: "pumping" | "dumping" | "volume_surge" | null = null;

    if (signalType === "pumping") {
      leaderboardName = "pumping";
    } else if (signalType === "dumping") {
      leaderboardName = "dumping";
    } else if (signalType === "volume-surge") {
      leaderboardName = "volume_surge";
    } else {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid signal type" }));
      return;
    }

    const entries = this.enhancedLeaderboardStore.get(leaderboardName, limit);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ signalType, entries }, null, 2));
  }

  /**
   * Get all aggregated markets.
   */
  private handleAggregated(
    _req: IncomingMessage,
    res: ServerResponse,
    url: URL
  ): void {
    if (!this.aggregatedStore) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Aggregated data not available" }));
      return;
    }

    const limit = parseInt(url.searchParams.get("limit") || "100", 10);
    const aggregated = Array.from(this.aggregatedStore.values()).slice(0, limit);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(aggregated, null, 2));
  }

  /**
   * Get aggregated data for a specific symbol.
   */
  private handleAggregatedBySymbol(
    _req: IncomingMessage,
    res: ServerResponse,
    url: URL
  ): void {
    if (!this.aggregatedStore) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Aggregated data not available" }));
      return;
    }

    const symbol = url.pathname.split("/aggregated/")[1];

    if (!symbol) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Symbol required" }));
      return;
    }

    const aggregated = this.aggregatedStore.get(symbol);

    if (!aggregated) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Symbol not found" }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(aggregated, null, 2));
  }

  /**
   * Get arbitrage opportunities.
   */
  private handleArbitrage(
    _req: IncomingMessage,
    res: ServerResponse,
    url: URL
  ): void {
    if (!this.aggregatedStore) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Aggregated data not available" }));
      return;
    }

    const { getArbitrageOpportunities } = require("../compute/cross-exchange.js");
    const opportunities = getArbitrageOpportunities(this.aggregatedStore);
    const limit = parseInt(url.searchParams.get("limit") || "20", 10);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        {
          count: opportunities.length,
          opportunities: opportunities.slice(0, limit),
        },
        null,
        2
      )
    );
  }

  /**
   * Handle 404 Not Found.
   */
  private handleNotFound(
    _req: IncomingMessage,
    res: ServerResponse
  ): void {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }

  /**
   * Handle errors.
   */
  private handleError(
    _req: IncomingMessage,
    res: ServerResponse,
    error: Error
  ): void {
    logger.error("API error", error);

    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Internal server error",
        message: error.message,
      })
    );
  }
}

