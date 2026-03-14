# ⚡ EVM Liquidation Bot

A production-ready automated liquidation bot targeting **Aave V3** on Ethereum mainnet, Arbitrum, and Base. Uses flash loans for capital-free liquidations and Flashbots for MEV protection on mainnet.

---

## What It Does

When borrowers on Aave V3 become undercollateralized (health factor < 1.0), they're eligible for liquidation. This bot:

1. **Monitors** all Aave V3 borrowers continuously via WebSocket
2. **Detects** positions where health factor drops below thresholds
3. **Calculates** profitability (accounting for gas, flash loan fees, slippage)
4. **Executes** flash-loan-backed liquidations atomically on-chain
5. **Protects** against front-running via Flashbots bundles (Ethereum mainnet)
6. **Displays** real-time stats on a web dashboard

---

## How Liquidations Work

```
┌─────────────┐   flash loan (debt asset)   ┌─────────────────┐
│  Aave Pool  │ ──────────────────────────► │ FlashLiquidator │
│             │                              │     Contract    │
│             │ ◄─── liquidationCall ─────── │                 │
│             │   repays debt, gets collat.  │                 │
│             │                              │                 │
│             │                              │  swap collat.   │
│             │                              │  → debt token   │
│             │                              │  (Uniswap V3)   │
│             │                              │                 │
│             │ ◄─── repay loan + 0.05% ──── │                 │
│             │                              │                 │
│             │                              │  profit → owner │
└─────────────┘                              └─────────────────┘
```

**Profit = Liquidation Bonus − Flash Loan Fee (0.05%) − Gas Cost**

Aave V3 grants a liquidation bonus (typically 4–10%) on the collateral received, which exceeds the flash loan fee and gas cost when markets are moving.

---

## Project Structure

```
evm-liquidation-bot/
├── contracts/
│   └── FlashLiquidator.sol     ← Solidity: flash loan + liquidation + swap
├── bot/
│   └── src/
│       ├── index.ts            ← Main orchestrator
│       ├── monitor.ts          ← WebSocket position scanner
│       ├── liquidator.ts       ← Execution engine
│       ├── calculator.ts       ← Profitability math
│       ├── flashbots.ts        ← Flashbots bundle submission
│       ├── protocols/
│       │   └── aave.ts         ← Aave V3 data fetching
│       ├── utils/
│       │   ├── config.ts       ← Environment config loader
│       │   └── logger.ts       ← Winston logging
│       └── dashboard/
│           ├── server.ts       ← Express + Socket.io
│           └── public/         ← Dark-themed web UI
├── scripts/
│   └── deploy.ts               ← Hardhat deployment script
├── test/
│   └── FlashLiquidator.test.ts ← Contract tests
├── .env.example
├── hardhat.config.ts
├── package.json
└── tsconfig.json
```

---

## Setup

### 1. Clone & Install

```bash
cd evm-liquidation-bot
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

| Variable | Description |
|---|---|
| `ETH_RPC_WS` | Ethereum WebSocket RPC (Alchemy/Infura) |
| `PRIVATE_KEY` | Bot wallet private key (needs ETH for gas) |
| `FLASHBOTS_AUTH_KEY` | Flashbots relay auth key |
| `CHAIN` | `ethereum` \| `arbitrum` \| `base` |
| `DRY_RUN` | `true` to simulate only, `false` to go live |
| `MIN_PROFIT_ETH` | Minimum net profit threshold (e.g. `0.005`) |
| `MAX_GAS_GWEI` | Maximum gas price willing to pay |

### 3. Compile Contracts

```bash
npm run compile
```

---

## Deploy Contract

The `FlashLiquidator` contract must be deployed before running in live mode.

### Ethereum Mainnet
```bash
npm run deploy:mainnet
```

### Arbitrum
```bash
npm run deploy:arbitrum
```

### Base
```bash
npm run deploy:base
```

### Local (Hardhat fork)
```bash
npm run deploy:local
```

After deploying, add the contract address to `.env`:
```
FLASH_LIQUIDATOR_ADDRESS=0xYourContractAddress
```

---

## Run the Bot

### Development (with hot reload)
```bash
npm run dev
```

### Production (compiled)
```bash
npm run build
npm start
```

### Dry Run (safe — no real txs)
```bash
DRY_RUN=true npm run dev
```

---

## Dashboard

Once running, open your browser:

```
http://localhost:3000
```

**Features:**
- 📊 Real-time stats (total profit, liquidations today, success rate)
- ⚡ Live liquidation feed with transaction links
- 🔍 At-risk position monitor with health factors
- 📈 Profit-over-time chart (Chart.js)
- 🟢 Live status indicator

The dashboard connects via Socket.io and updates automatically.

---

## Configuration Guide

### Minimum Profit (`MIN_PROFIT_ETH`)

Set this based on your risk tolerance:
- `0.001` ETH — aggressive, catches small liquidations
- `0.005` ETH — balanced default
- `0.01` ETH — conservative, larger positions only

### Gas Price (`MAX_GAS_GWEI`)

During normal conditions: 20–50 Gwei
During congestion: raise to 100+ but watch profitability

### Monitor Interval (`MONITOR_INTERVAL_MS`)

- `30000` (30s) — default, good for most positions
- `10000` (10s) — faster but more RPC calls
- `60000` (60s) — slower, conserves rate limits

### Pool Fee (Uniswap V3)

The bot defaults to 0.3% (3000) for swaps. Modify `poolFee` in `liquidator.ts` to use:
- `500` — 0.05% (stable pairs like USDC/DAI)
- `3000` — 0.3% (standard)
- `10000` — 1% (exotic pairs)

---

## Multi-Chain Support

| Chain | Pool Address | Flashbots | Status |
|---|---|---|---|
| Ethereum | `0x87870Bca...` | ✅ Yes | Supported |
| Arbitrum | `0x794a613...` | ❌ Direct tx | Supported |
| Base | `0xA238Dd8...` | ❌ Direct tx | Supported |

Switch chains via `.env`:
```
CHAIN=arbitrum
ARB_RPC_WS=wss://arb-mainnet.g.alchemy.com/v2/YOUR_KEY
```

---

## Testing

Run tests (requires mainnet fork or local Hardhat):

```bash
# Unit tests (no fork needed)
npm test

# Fork tests (requires ETH_RPC_HTTP in .env)
npm run test:fork
```

---

## Risk Warnings

⚠️ **Read before deploying with real funds:**

1. **Smart contract risk** — This code is unaudited. Do not deposit large amounts into the contract beyond what's needed for gas. Use `withdraw()` to recover profits.

2. **MEV competition** — Liquidation bots compete. Without Flashbots, your transaction may be front-run. On Ethereum mainnet, always use Flashbots mode.

3. **Gas estimation** — The bot estimates gas but reverts are possible. Start with small positions.

4. **Oracle manipulation** — Price oracle attacks can make positions appear liquidatable when they're not. The slippage protection (`amountOutMinimum`) guards against this.

5. **Flash loan reversions** — If the swap doesn't return enough to repay the loan, the entire transaction reverts (atomically). You only lose gas.

6. **Dry run first** — Always run with `DRY_RUN=true` for at least 24 hours before going live.

7. **Private key security** — Never commit your `.env` file. Use hardware wallets for large sums.

---

## Architecture Decisions

- **ethers v6** — Latest version with better TypeScript support
- **WebSocket provider** — Real-time block updates vs polling
- **Flashbots bundles** — MEV protection + priority ordering
- **Winston logging** — Structured logs with file rotation
- **Socket.io dashboard** — Real-time without polling
- **No ORM/DB** — In-memory state is sufficient for single-process bots

---

## License

MIT — use at your own risk.
