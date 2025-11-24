# Crypto Dashboard Backend

Real-time crypto derivatives screener backend with unified data ingestion from multiple exchanges.

## Overview

This system ingests data from multiple centralized exchanges (CEXs) and the decentralized Hyperliquid exchange, normalizes everything into a unified schema, computes derived metrics, and serves pre-sorted leaderboards via an internal API.

## Architecture

- **Data Source Layer**: Exchange connectors (Binance, Bybit, OKX, Hyperliquid)
- **Normalization Layer**: Exchange-specific → Unified schema transformers
- **Unified Data Store**: In-memory stores for markets, order books, positions, rolling windows
- **Computation Layer**: Derived metrics, composite scores, liquidation analysis
- **Query API Layer**: REST API for leaderboards and symbol queries

## Key Features

- **Unified Data Model**: All exchanges normalized to consistent schemas
- **Real-time Processing**: Sub-second latency for data updates
- **Hyperliquid Position Scanning**: Unique capability to scan transparent on-chain positions
- **Liquidation Analysis**: Exact liquidation prices and cluster detection (Hyperliquid)
- **Leaderboards**: 15+ pre-sorted leaderboards with <50ms query latency

## Project Structure

```
src/
├── types/              # Unified schemas and type definitions
├── connectors/         # Exchange connectors (Binance, Bybit, OKX, Hyperliquid)
├── pipeline/           # Data normalization and processing
├── store/              # In-memory data stores
├── compute/            # Derived metrics and composite scores
├── api/                # Query API server
└── utils/              # Logging, config, utilities
```

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
npm start
```

## Configuration

Edit `config/default.json` to configure:
- Exchange enablement
- Symbol selection
- Rolling window sizes
- Computation intervals
- Hyperliquid scanning parameters

## Status

**Current Phase:** Phase 0 - Project Setup ✅

**Next Phase:** Phase 1A - Bybit MVP

See `.cursor/scratchpad.md` for detailed progress tracking.

## License

MIT

