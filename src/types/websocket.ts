/**
 * WebSocket message types for real-time API
 */

import type { WebSocket } from "ws";

export interface WSMessage {
  channel: string;
  event: "update" | "snapshot" | "subscribe" | "unsubscribe" | "error" | "pong";
  data: unknown;
  timestamp: number;
  sequence?: number; // For ordering messages
}

export interface WSClientMessage {
  action: "subscribe" | "unsubscribe" | "ping";
  channels: string[];
}

export interface WSClient {
  ws: WebSocket;
  subscriptions: Set<string>;
  lastPing: number;
  isAlive: boolean;
}

