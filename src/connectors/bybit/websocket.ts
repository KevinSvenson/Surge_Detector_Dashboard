/**
 * Bybit V5 WebSocket Connection Manager
 * 
 * Handles WebSocket connection, subscriptions, message routing, and auto-reconnect.
 */

import WebSocket from "ws";
import { EventEmitter } from "eventemitter3";
import { logger } from "../../utils/logger.js";
import type { ConnectionState } from "../../types/exchanges.js";

interface BybitWebSocketMessage {
  op?: string;
  topic?: string;
  type?: string;
  data?: unknown;
  success?: boolean;
  ret_msg?: string;
  conn_id?: string;
}


export class BybitWebSocketManager extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private state: ConnectionState = "disconnected";
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000; // Start with 1 second
  private maxReconnectDelay = 30000; // Max 30 seconds
  private pingInterval: NodeJS.Timeout | null = null;
  private pingIntervalMs = 20000; // 20 seconds as per Bybit spec
  private subscriptions = new Set<string>(); // Track subscribed topics
  private isManualClose = false;

  constructor(url: string = "wss://stream.bybit.com/v5/public/linear") {
    super();
    this.url = url;
  }

  /**
   * Connect to Bybit WebSocket
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      logger.warn("WebSocket already connected");
      return;
    }

    this.isManualClose = false;
    this.setState("connecting");

    logger.info("Connecting to Bybit WebSocket", { url: this.url });

    try {
      this.ws = new WebSocket(this.url);

      this.ws.on("open", () => {
        logger.info("Bybit WebSocket connected");
        this.setState("connected");
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.startPingInterval();

        // Re-subscribe to all previous subscriptions
        if (this.subscriptions.size > 0) {
          this.resubscribeAll();
        }
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        this.handleMessage(data);
      });

      this.ws.on("error", (error: Error) => {
        logger.error("Bybit WebSocket error", error);
        this.emit("error", error);
      });

      this.ws.on("close", (code: number, reason: Buffer) => {
        logger.warn("Bybit WebSocket closed", {
          code,
          reason: reason.toString(),
          reconnectAttempts: this.reconnectAttempts,
        });
        this.stopPingInterval();
        this.setState("disconnected");

        // Auto-reconnect unless manually closed
        if (!this.isManualClose) {
          this.scheduleReconnect();
        }
      });
    } catch (error) {
      logger.error("Failed to create WebSocket connection", error as Error);
      this.setState("error");
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    this.isManualClose = true;
    this.stopPingInterval();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.setState("disconnected");
    logger.info("Bybit WebSocket disconnected");
  }

  /**
   * Subscribe to topics
   */
  subscribe(topics: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn("Cannot subscribe: WebSocket not connected");
      // Queue subscriptions for when connection is established
      topics.forEach((topic) => this.subscriptions.add(topic));
      return;
    }

    const newTopics = topics.filter((topic) => !this.subscriptions.has(topic));

    if (newTopics.length === 0) {
      logger.debug("All topics already subscribed");
      return;
    }

    const message = {
      op: "subscribe",
      args: newTopics,
    };

    logger.debug("Subscribing to topics", { topics: newTopics, count: newTopics.length });
    this.ws.send(JSON.stringify(message));

    // Track subscriptions
    newTopics.forEach((topic) => this.subscriptions.add(topic));
  }

  /**
   * Unsubscribe from topics
   */
  unsubscribe(topics: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn("Cannot unsubscribe: WebSocket not connected");
      return;
    }

    const message = {
      op: "unsubscribe",
      args: topics,
    };

    logger.debug("Unsubscribing from topics", { topics, count: topics.length });
    this.ws.send(JSON.stringify(message));

    // Remove from tracking
    topics.forEach((topic) => this.subscriptions.delete(topic));
  }

  /**
   * Unsubscribe from all topics
   */
  unsubscribeAll(): void {
    if (this.subscriptions.size > 0) {
      this.unsubscribe(Array.from(this.subscriptions));
    }
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
    return this.state === "connected" && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get subscribed topics
   */
  getSubscriptions(): string[] {
    return Array.from(this.subscriptions);
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

  private handleMessage(data: WebSocket.Data): void {
    try {
      const message: BybitWebSocketMessage = JSON.parse(data.toString());

      // Handle subscription confirmations
      if (message.op === "subscribe" || message.op === "unsubscribe") {
        if (message.success) {
          logger.debug("Subscription operation successful", {
            op: message.op,
            ret_msg: message.ret_msg,
          });
        } else {
          logger.warn("Subscription operation failed", {
            op: message.op,
            ret_msg: message.ret_msg,
          });
        }
        return;
      }

      // Handle ping/pong
      if (message.op === "pong") {
        logger.debug("Received pong");
        return;
      }

      // Handle data messages
      if (message.topic && message.data) {
        this.emit("message", {
          topic: message.topic,
          data: message.data,
        });
      }
    } catch (error) {
      logger.error("Failed to parse WebSocket message", error as Error, {
        data: data.toString().substring(0, 200),
      });
    }
  }

  private startPingInterval(): void {
    this.stopPingInterval();

    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        const pingMessage = {
          op: "ping",
        };
        this.ws.send(JSON.stringify(pingMessage));
        logger.debug("Sent ping");
      }
    }, this.pingIntervalMs);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      const error = new Error("Max reconnect attempts reached");
      logger.error("Max reconnect attempts reached", error, {
        reconnectAttempts: this.reconnectAttempts,
      });
      this.setState("error");
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );

    logger.info("Scheduling reconnect", {
      attempt: this.reconnectAttempts,
      delayMs: delay,
    });

    this.setState("reconnecting");

    setTimeout(() => {
      if (!this.isManualClose) {
        logger.info("Attempting to reconnect", {
          attempt: this.reconnectAttempts,
        });
        this.connect();
      }
    }, delay);
  }

  private resubscribeAll(): void {
    if (this.subscriptions.size > 0) {
      logger.info("Resubscribing to topics", {
        count: this.subscriptions.size,
      });
      this.subscribe(Array.from(this.subscriptions));
    }
  }
}

