/**
 * Binance Futures WebSocket Connection Manager
 * 
 * Handles WebSocket connection, subscriptions, message routing, and auto-reconnect.
 * Binance uses a combined stream approach with multiple streams per connection.
 * 
 * FIXED: Splits streams across multiple connections to avoid URL length limits.
 */

import WebSocket from "ws";
import { EventEmitter } from "eventemitter3";
import { logger } from "../../utils/logger.js";
import type { ConnectionState } from "../../types/exchanges.js";

interface BinanceWebSocketMessage {
  stream?: string;
  data?: unknown;
}

interface ConnectionInfo {
  ws: WebSocket | null;
  streams: string[];
  isConnected: boolean;
  reconnectAttempts: number;
}

const STREAMS_PER_CONNECTION = 50; // Binance limit is ~200, but we use 50 for safety

export class BinanceWebSocketManager extends EventEmitter {
  private connections: ConnectionInfo[] = [];
  private baseUrl: string;
  private state: ConnectionState = "disconnected";
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private pingInterval: NodeJS.Timeout | null = null;
  private pingIntervalMs = 180000; // 3 minutes as per Binance spec
  private subscribedStreams = new Set<string>(); // Track all subscribed streams
  private isManualClose = false;

  constructor(baseUrl: string = "wss://fstream.binance.com/stream") {
    super();
    this.baseUrl = baseUrl;
  }

  /**
   * Connect all WebSocket connections
   */
  connect(): void {
    if (this.connections.length === 0) {
      logger.warn("No streams to connect to");
      return;
    }

    this.isManualClose = false;
    this.setState("connecting");

    // Connect each connection group
    for (let i = 0; i < this.connections.length; i++) {
      this.connectConnection(i);
    }
  }

  /**
   * Connect a specific connection by index
   */
  private connectConnection(index: number): void {
    const conn = this.connections[index];
    if (!conn || conn.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    // Build combined stream URL
    const combinedStream = conn.streams.join("/");
    const url = `${this.baseUrl}?streams=${combinedStream}`;

    logger.info("Connecting Binance WebSocket", {
      connectionIndex: index,
      streamCount: conn.streams.length,
      urlLength: url.length,
    });

    try {
      conn.ws = new WebSocket(url);

      conn.ws.on("open", () => {
        logger.info("Binance WebSocket connected", {
          connectionIndex: index,
          streamCount: conn.streams.length,
        });
        conn.isConnected = true;
        conn.reconnectAttempts = 0;

        // Update overall state if all connections are up
        this.updateOverallState();
      });

      conn.ws.on("message", (data: WebSocket.Data) => {
        this.handleMessage(data, index);
      });

      conn.ws.on("error", (error: Error) => {
        logger.error("Binance WebSocket error", error, {
          connectionIndex: index,
        });
        this.emit("error", error);
      });

      conn.ws.on("close", (code: number, reason: Buffer) => {
        logger.warn("Binance WebSocket closed", {
          connectionIndex: index,
          code,
          reason: reason.toString(),
        });
        conn.isConnected = false;
        conn.ws = null;

        this.updateOverallState();

        // Auto-reconnect unless manually closed
        if (!this.isManualClose) {
          this.scheduleReconnect(index);
        }
      });
    } catch (error) {
      logger.error("Failed to create WebSocket connection", error as Error, {
        connectionIndex: index,
      });
      this.scheduleReconnect(index);
    }
  }

  /**
   * Disconnect all WebSocket connections
   */
  disconnect(): void {
    this.isManualClose = true;
    this.stopPingInterval();

    for (const conn of this.connections) {
      if (conn.ws) {
        conn.ws.close();
        conn.ws = null;
      }
      conn.isConnected = false;
    }

    this.setState("disconnected");
    logger.info("Binance WebSocket disconnected", {
      connectionCount: this.connections.length,
    });
  }

  /**
   * Subscribe to streams (automatically splits across connections)
   */
  subscribe(streams: string[]): void {
    // Add new streams to subscription list
    const newStreams = streams.filter((stream) => !this.subscribedStreams.has(stream));

    if (newStreams.length === 0) {
      logger.debug("All streams already subscribed");
      return;
    }

    // Track subscriptions
    newStreams.forEach((stream) => this.subscribedStreams.add(stream));

    // Split streams across connections
    this.reorganizeConnections();

    logger.info("Subscribed to Binance streams", {
      newStreamCount: newStreams.length,
      totalStreams: this.subscribedStreams.size,
      connectionCount: this.connections.length,
    });
  }

  /**
   * Unsubscribe from streams
   */
  unsubscribe(streams: string[]): void {
    streams.forEach((stream) => this.subscribedStreams.delete(stream));

    if (this.subscribedStreams.size > 0) {
      this.reorganizeConnections();
    } else {
      this.disconnect();
    }
  }

  /**
   * Unsubscribe from all streams
   */
  unsubscribeAll(): void {
    this.subscribedStreams.clear();
    this.disconnect();
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return (
      this.state === "connected" &&
      this.connections.length > 0 &&
      this.connections.some((conn) => conn.isConnected)
    );
  }

  /**
   * Get subscribed streams
   */
  getSubscriptions(): string[] {
    return Array.from(this.subscribedStreams);
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): {
    totalConnections: number;
    connectedCount: number;
    totalStreams: number;
  } {
    return {
      totalConnections: this.connections.length,
      connectedCount: this.connections.filter((conn) => conn.isConnected).length,
      totalStreams: this.subscribedStreams.size,
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ══════════════════════════════════════════════════════════════════════

  private setState(newState: ConnectionState): void {
    if (this.state !== newState) {
      const oldState = this.state;
      this.state = newState;
      logger.debug("Connection state changed", { from: oldState, to: newState });
      this.emit("connection", newState);
    }
  }

  private updateOverallState(): void {
    const connectedCount = this.connections.filter((conn) => conn.isConnected).length;
    const totalConnections = this.connections.length;

    if (totalConnections === 0) {
      this.setState("disconnected");
    } else if (connectedCount === totalConnections) {
      this.setState("connected");
      this.startPingInterval();
    } else if (connectedCount > 0) {
      this.setState("connected"); // Partially connected is still "connected"
    } else {
      this.setState("disconnected");
    }
  }

  private reorganizeConnections(): void {
    // Disconnect all existing connections
    for (const conn of this.connections) {
      if (conn.ws) {
        conn.ws.close();
        conn.ws = null;
      }
    }

    // Split streams into chunks
    const allStreams = Array.from(this.subscribedStreams);
    const chunks: string[][] = [];

    for (let i = 0; i < allStreams.length; i += STREAMS_PER_CONNECTION) {
      chunks.push(allStreams.slice(i, i + STREAMS_PER_CONNECTION));
    }

    // Create connection info objects
    this.connections = chunks.map((streams) => ({
      ws: null,
      streams,
      isConnected: false,
      reconnectAttempts: 0,
    }));

    // Reconnect all
    this.connect();
  }

  private handleMessage(data: WebSocket.Data, connectionIndex: number): void {
    try {
      const message: BinanceWebSocketMessage = JSON.parse(data.toString());

      // Binance combined stream format: { stream: "btcusdt@ticker", data: {...} }
      if (message.stream && message.data) {
        this.emit("message", {
          stream: message.stream,
          data: message.data,
          connectionIndex,
        });
      }
    } catch (error) {
      logger.error("Failed to parse WebSocket message", error as Error, {
        connectionIndex: String(connectionIndex),
        data: data.toString().substring(0, 200),
      });
    }
  }

  private startPingInterval(): void {
    this.stopPingInterval();

    this.pingInterval = setInterval(() => {
      // Check all connections
      for (const conn of this.connections) {
        if (conn.ws?.readyState === WebSocket.OPEN) {
          // Binance doesn't require explicit ping, but we monitor health
          logger.debug("Binance WebSocket ping check", {
            connectionCount: this.connections.length,
          });
        }
      }
    }, this.pingIntervalMs);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(connectionIndex: number): void {
    const conn = this.connections[connectionIndex];
    if (!conn) {
      return;
    }

    if (conn.reconnectAttempts >= 10) {
      const error = new Error("Max reconnect attempts reached for connection");
      logger.error("Max reconnect attempts reached for connection", error, {
        connectionIndex: String(connectionIndex),
        reconnectAttempts: conn.reconnectAttempts,
      });
      return;
    }

    conn.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, conn.reconnectAttempts - 1),
      this.maxReconnectDelay
    );

    logger.info("Scheduling reconnect", {
      connectionIndex,
      attempt: conn.reconnectAttempts,
      delayMs: delay,
    });

    setTimeout(() => {
      if (!this.isManualClose) {
        this.connectConnection(connectionIndex);
      }
    }, delay);
  }
}
