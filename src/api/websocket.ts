/**
 * WebSocket API Server
 * 
 * Provides real-time updates for markets, leaderboards, and signals.
 * Supports subscription-based channels with throttled broadcasting.
 */

import { WebSocketServer, WebSocket } from "ws";
import { EventEmitter } from "eventemitter3";
import { logger } from "../utils/logger.js";
import type { UnifiedMarket } from "../types/unified.js";
import type { LeaderboardEntry } from "../types/internal.js";
import type { WSMessage, WSClientMessage, WSClient } from "../types/websocket.js";

interface BroadcastQueue {
  markets: Map<string, UnifiedMarket>;
  leaderboards: Map<string, LeaderboardEntry[]>;
  signals: Array<{ type: string; data: unknown }>;
}

export class WebSocketAPI extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, WSClient> = new Map();
  private broadcastQueue: BroadcastQueue;
  private broadcastInterval: NodeJS.Timeout | null = null;
  private broadcastIntervalMs = 100; // 100ms throttle
  private sequenceNumber = 0;
  private pingInterval: NodeJS.Timeout | null = null;
  private readonly PING_INTERVAL_MS = 30000; // 30 seconds

  constructor() {
    super();
    this.broadcastQueue = {
      markets: new Map(),
      leaderboards: new Map(),
      signals: [],
    };
  }

  /**
   * Start WebSocket server
   */
  start(server: unknown): void {
    if (this.wss) {
      logger.warn("WebSocket server already started");
      return;
    }

    // Create WebSocket server attached to HTTP server
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.wss = new WebSocketServer({ 
      server: server as any,
      path: "/ws",
    });

    this.wss.on("connection", (ws, req) => {
      this.handleConnection(ws, req);
    });

    // Start broadcast interval
    this.broadcastInterval = setInterval(() => {
      this.flushBroadcastQueue();
    }, this.broadcastIntervalMs);

    // Start ping interval
    this.pingInterval = setInterval(() => {
      this.pingClients();
    }, this.PING_INTERVAL_MS);

    logger.info("WebSocket server started", { path: "/ws" });
  }

  /**
   * Stop WebSocket server
   */
  stop(): void {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Close all client connections
    for (const client of this.clients.values()) {
      client.ws.close();
    }
    this.clients.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    logger.info("WebSocket server stopped");
  }

  /**
   * Handle new client connection
   */
  private handleConnection(ws: WebSocket, req: unknown): void {
    const client: WSClient = {
      ws,
      subscriptions: new Set(),
      lastPing: Date.now(),
      isAlive: true,
    };

    this.clients.set(ws, client);

    // Send welcome message
    this.sendToClient(ws, {
      channel: "system",
      event: "subscribe",
      data: { message: "Connected to WebSocket API" },
      timestamp: Date.now(),
    });

    ws.on("message", (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as WSClientMessage;
        this.handleClientMessage(ws, message);
      } catch (error) {
        logger.error("Failed to parse WebSocket message", error as Error);
        this.sendToClient(ws, {
          channel: "system",
          event: "error",
          data: { error: "Invalid message format" },
          timestamp: Date.now(),
        });
      }
    });

    ws.on("close", () => {
      this.clients.delete(ws);
      logger.debug("WebSocket client disconnected", {
        remainingClients: this.clients.size,
      });
    });

    ws.on("error", (error) => {
      logger.error("WebSocket error", error);
      this.clients.delete(ws);
    });

    ws.on("pong", () => {
      const client = this.clients.get(ws);
      if (client) {
        client.isAlive = true;
        client.lastPing = Date.now();
      }
    });

    logger.debug("WebSocket client connected", {
      clientCount: this.clients.size,
      origin: (req as { headers?: { origin?: string } }).headers?.origin,
    });
  }

  /**
   * Handle client message
   */
  private handleClientMessage(ws: WebSocket, message: WSClientMessage): void {
    const client = this.clients.get(ws);
    if (!client) {
      return;
    }

    switch (message.action) {
      case "subscribe":
        for (const channel of message.channels) {
          client.subscriptions.add(channel);
        }
        this.sendToClient(ws, {
          channel: "system",
          event: "subscribe",
          data: { channels: Array.from(client.subscriptions) },
          timestamp: Date.now(),
        });
        logger.debug("Client subscribed", {
          channels: message.channels,
          totalSubscriptions: client.subscriptions.size,
        });
        break;

      case "unsubscribe":
        for (const channel of message.channels) {
          client.subscriptions.delete(channel);
        }
        this.sendToClient(ws, {
          channel: "system",
          event: "unsubscribe",
          data: { channels: Array.from(client.subscriptions) },
          timestamp: Date.now(),
        });
        logger.debug("Client unsubscribed", {
          channels: message.channels,
          totalSubscriptions: client.subscriptions.size,
        });
        break;

      case "ping":
        this.sendToClient(ws, {
          channel: "system",
          event: "pong",
          data: null,
          timestamp: Date.now(),
        });
        break;

      default:
        logger.warn("Unknown WebSocket action", { action: message.action });
    }
  }

  /**
   * Broadcast market update (queued, sent in batches)
   */
  broadcastMarket(market: UnifiedMarket): void {
    this.broadcastQueue.markets.set(market.id, market);
  }

  /**
   * Broadcast leaderboard update
   */
  broadcastLeaderboard(name: string, entries: LeaderboardEntry[]): void {
    // Only send top 20 to reduce payload
    this.broadcastQueue.leaderboards.set(name, entries.slice(0, 20));
  }

  /**
   * Broadcast signal immediately (not queued)
   */
  broadcastSignal(type: string, data: unknown): void {
    const message: WSMessage = {
      channel: "signals",
      event: "update",
      data: { type, ...(typeof data === "object" && data !== null ? data : { data }) },
      timestamp: Date.now(),
      sequence: this.getNextSequence(),
    };

    this.broadcastToSubscribers("signals", message);
  }

  /**
   * Flush broadcast queue (called periodically)
   */
  private flushBroadcastQueue(): void {
    // Send batched market updates
    if (this.broadcastQueue.markets.size > 0) {
      const markets = Array.from(this.broadcastQueue.markets.values());
      const message: WSMessage = {
        channel: "markets",
        event: "update",
        data: markets,
        timestamp: Date.now(),
        sequence: this.getNextSequence(),
      };

      this.broadcastToSubscribers("markets", message);

      // Send individual market updates for specific subscriptions
      for (const market of markets) {
        const symbolChannel = `markets:${market.symbol}`;
        const symbolMessage: WSMessage = {
          channel: symbolChannel,
          event: "update",
          data: market,
          timestamp: Date.now(),
          sequence: this.getNextSequence(),
        };
        this.broadcastToSubscribers(symbolChannel, symbolMessage);
      }

      this.broadcastQueue.markets.clear();
    }

    // Send leaderboard updates
    for (const [name, entries] of this.broadcastQueue.leaderboards.entries()) {
      const message: WSMessage = {
        channel: `leaderboard:${name}`,
        event: "update",
        data: entries,
        timestamp: Date.now(),
        sequence: this.getNextSequence(),
      };
      this.broadcastToSubscribers(`leaderboard:${name}`, message);
    }
    this.broadcastQueue.leaderboards.clear();
  }

  /**
   * Broadcast message to all subscribers of a channel
   */
  private broadcastToSubscribers(channel: string, message: WSMessage): void {
    let sentCount = 0;
    for (const [ws, client] of this.clients.entries()) {
      if (client.subscriptions.has(channel) || client.subscriptions.has("*")) {
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
            sentCount++;
          }
        } catch (error) {
          logger.error("Failed to send WebSocket message", error as Error);
          this.clients.delete(ws);
        }
      }
    }

    if (sentCount > 0) {
      logger.debug("Broadcast message", { channel, sentCount });
    }
  }

  /**
   * Send message to specific client
   */
  private sendToClient(ws: WebSocket, message: WSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        logger.error("Failed to send message to client", error as Error);
      }
    }
  }

  /**
   * Ping all clients to check if they're alive
   */
  private pingClients(): void {
    for (const [ws, client] of this.clients.entries()) {
      if (!client.isAlive) {
        // Client didn't respond to last ping, close connection
        logger.debug("Closing inactive WebSocket connection");
        ws.terminate();
        this.clients.delete(ws);
        continue;
      }

      client.isAlive = false;
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }
  }

  /**
   * Get next sequence number
   */
  private getNextSequence(): number {
    return ++this.sequenceNumber;
  }

  /**
   * Get WebSocket statistics
   */
  getStats(): {
    clientCount: number;
    totalSubscriptions: number;
  } {
    let totalSubscriptions = 0;
    for (const client of this.clients.values()) {
      totalSubscriptions += client.subscriptions.size;
    }

    return {
      clientCount: this.clients.size,
      totalSubscriptions,
    };
  }
}

