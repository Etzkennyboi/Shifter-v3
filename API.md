# 📡 API Documentation

Complete reference for all REST API endpoints in Shifter.

## Base URL

```
http://localhost:3000/api          # Development
https://your-domain.com/api        # Production
```

## Authentication

Currently **no authentication required** for read operations. Write operations (withdraw, task verification) validate wallet signatures client-side.

All endpoints that require wallet verification accept:
- `walletAddress` (query/body parameter)
- Signature validation handled client-side via Ethers.js

## Endpoints

### Player Profile

#### `GET /api/player`

Retrieve player profile and stats.

**Query Parameters**:
| Parameter | Type | Required | Example |
|-----------|------|----------|---------|
| `walletAddress` | string | Yes | `0x742d35Cc6634C0532925a3b844Bc9e7595f42e7` |

**Response** (200 OK):
```json
{
  "id": "cuid123",
  "walletAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f42e7",
  "bestScore": 2500,
  "totalEarned": 45.50,
  "totalWithdrawn": 25.00,
  "pendingBalance": 20.50,
  "gamesPlayed": 15,
  "createdAt": "2026-04-01T10:30:00Z",
  "updatedAt": "2026-04-03T15:45:22Z"
}
```

**Error Responses**:
```json
// Player not found
{
  "error": "Player not found",
  "statusCode": 404
}

// Invalid wallet address
{
  "error": "Invalid wallet address",
  "statusCode": 400
}
```

**Example**:
```bash
curl "http://localhost:3000/api/player?walletAddress=0x742d35Cc6634C0532925a3b844Bc9e7595f42e7"
```

---

### Leaderboard

#### `GET /api/leaderboard`

Retrieve top-scoring players.

**Query Parameters**:
| Parameter | Type | Required | Default | Example |
|-----------|------|----------|---------|---------|
| `limit` | number | No | 10 | `20` |
| `offset` | number | No | 0 | `0` |

**Response** (200 OK):
```json
[
  {
    "rank": 1,
    "walletAddress": "0x1234...5678",
    "bestScore": 5250,
    "totalEarned": 150.75,
    "gamesPlayed": 50
  },
  {
    "rank": 2,
    "walletAddress": "0xabcd...ef01",
    "bestScore": 4890,
    "totalEarned": 142.30,
    "gamesPlayed": 48
  }
]
```

**Parameters**:
- `limit`: Max 100 entries per request
- `offset`: For pagination (page = offset / limit)

**Example**:
```bash
# Top 10
curl "http://localhost:3000/api/leaderboard"

# Top 20, skip first 10
curl "http://localhost:3000/api/leaderboard?limit=20&offset=10"
```

---

### Game History

#### `GET /api/history`

Retrieve player's game session history.

**Query Parameters**:
| Parameter | Type | Required | Example |
|-----------|------|----------|---------|
| `walletAddress` | string | Yes | `0x742d35Cc6634C0532925a3b844Bc9e7595f42e7` |
| `limit` | number | No | `20` |
| `offset` | number | No | `0` |

**Response** (200 OK):
```json
{
  "totalGames": 15,
  "sessions": [
    {
      "id": "session123",
      "score": 2500,
      "coinsCollected": 250,
      "earnings": 5.50,
      "createdAt": "2026-04-03T14:22:30Z"
    },
    {
      "id": "session122",
      "score": 1800,
      "coinsCollected": 180,
      "earnings": 3.80,
      "createdAt": "2026-04-02T20:15:10Z"
    }
  ]
}
```

**Example**:
```bash
curl "http://localhost:3000/api/history?walletAddress=0x742d35Cc6634C0532925a3b844Bc9e7595f42e7&limit=10"
```

---

### Tasks

#### `GET /api/tasks`

List all available tasks.

**Query Parameters**: None

**Response** (200 OK):
```json
[
  {
    "id": "task1",
    "title": "Hold 100 USDC on XLayer",
    "description": "Maintain a balance of at least 100 USDC in your wallet",
    "reward": 50.00,
    "type": "HOLD_X_LAYER_USDC",
    "targetValue": 100.0
  },
  {
    "id": "task2",
    "title": "Complete Hard Mode",
    "description": "Survive to 1500 points in hard mode",
    "reward": 25.00,
    "type": "HARD_MODE_SCORE",
    "targetValue": 1500.0
  }
]
```

**Example**:
```bash
curl "http://localhost:3000/api/tasks"
```

---

#### `POST /api/tasks/verify`

Verify if player has completed a task.

**Request Body**:
```json
{
  "walletAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f42e7",
  "taskId": "task1",
  "signature": "0x..."  // Optional: EIP-191 signature for future auth
}
```

**Response** (200 OK):
```json
{
  "completed": true,
  "taskId": "task1",
  "reward": 50.00,
  "message": "Task verified and reward credited"
}
```

**Error Response** (400 Bad Request):
```json
{
  "completed": false,
  "reason": "Insufficient USDC balance",
  "required": 100.0,
  "current": 45.50
}
```

**Task Types & Verification**:

| Type | Verification | Example |
|------|--------------|---------|
| `HOLD_X_LAYER_USDC` | Check wallet USDC balance | Balance >= targetValue |
| `HARD_MODE_SCORE` | Check game history | Latest score >= targetValue |
| `SURVIVAL_TIME` | Game session data | Duration >= targetValue |

**Example**:
```bash
curl -X POST "http://localhost:3000/api/tasks/verify" \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f42e7",
    "taskId": "task1"
  }'
```

---

#### `GET /api/tasks/swap-params`

Get token swap parameters for task transactions.

**Query Parameters**:
| Parameter | Type | Required | Example |
|-----------|------|----------|---------|
| `tokenIn` | string | Yes | `NATIVE` |
| `tokenOut` | string | Yes | `USDC` |
| `amount` | string | Yes | `1000000000000000000` |

**Response** (200 OK):
```json
{
  "swapRoute": {
    "amountIn": "1000000000000000000",
    "amountOut": "1950000000",
    "priceImpact": 0.5,
    "path": ["0x...", "0x..."]
  },
  "estimatedGas": "120000",
  "slippage": 0.5
}
```

**Example**:
```bash
curl "http://localhost:3000/api/tasks/swap-params?tokenIn=NATIVE&tokenOut=USDC&amount=1000000000000000000"
```

---

### Withdrawals

#### `POST /api/withdraw`

Initiate a withdrawal of pending earnings.

**Request Body**:
```json
{
  "walletAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f42e7",
  "amount": 10.00,
  "signature": "0x..."  // Optional: for future auth validation
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "txHash": "0xabcd1234...ef5678",
  "amount": 10.00,
  "fee": 0.00,
  "status": "pending",
  "message": "Withdrawal initiated. Check status with tx hash.",
  "explorerUrl": "https://www.okx.com/web3/explorer/xlayer/tx/0xabcd1234...ef5678"
}
```

**Error Responses**:

```json
// Insufficient balance
{
  "success": false,
  "error": "Insufficient pending balance",
  "required": 10.00,
  "available": 5.50,
  "statusCode": 400
}

// Below minimum withdrawal
{
  "success": false,
  "error": "Amount below minimum withdrawal (1.00 USDC)",
  "statusCode": 400
}

// Invalid wallet
{
  "success": false,
  "error": "Wallet address not recognized",
  "statusCode": 404
}
```

**Request Parameters**:
- `walletAddress` (required): ETH address of connected wallet
- `amount` (required): USDC to withdraw (min 1.00)
- `signature` (optional): For enhanced security validation

**Constraints**:
- Minimum withdrawal: 1.00 USDC
- Maximum withdrawal: All pending balance
- Processing: ~30 seconds to block confirmation

**Example**:
```bash
curl -X POST "http://localhost:3000/api/withdraw" \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f42e7",
    "amount": 10.50
  }'
```

---

## Response Format

### Success Response
```json
{
  "success": true,
  "data": { /* endpoint-specific data */ }
}
```

### Error Response
```json
{
  "success": false,
  "error": "Human-readable error message",
  "statusCode": 400,
  "details": { /* optional debug info */ }
}
```

## Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| 200 | Success | Player found, task verified |
| 201 | Created | New record created |
| 400 | Bad Request | Invalid parameters, insufficient balance |
| 404 | Not Found | Player/task not found |
| 500 | Server Error | Database error, blockchain error |

## Rate Limiting

Currently **no rate limiting** is enforced. 

**Recommended for production**:
- Player queries: 60 requests/min
- Leaderboard: 30 requests/min
- Withdrawals: 5 requests/min per wallet

## Blockchain Integration

### XLayer Network Details

| Parameter | Value |
|-----------|-------|
| Chain ID | 196 |
| Network Name | XLayer |
| RPC URL | https://rpc.xlayer.tech |
| USDC Contract | 0x... (to be configured) |
| Explorer | https://www.okx.com/web3/explorer/xlayer |

### Transaction Flow

1. Game session ends → earnings calculated client-side
2. Player initiates withdrawal
3. Server creates transaction signature
4. Transaction sent to XLayer network
5. Block confirmation (~3-5 seconds)
6. Funds arrive in player wallet

## SDK/Client Examples

### JavaScript/TypeScript

```typescript
// Get player stats
const response = await fetch('/api/player?walletAddress=0x...')
const player = await response.json()

// Verify task
const taskResponse = await fetch('/api/tasks/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    walletAddress: '0x...',
    taskId: 'task1'
  })
})

// Withdraw earnings
const withdrawResponse = await fetch('/api/withdraw', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    walletAddress: '0x...',
    amount: 10.00
  })
})
```

### cURL

```bash
# Get leaderboard
curl https://app.com/api/leaderboard?limit=20

# Withdraw
curl -X POST https://app.com/api/withdraw \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"0x...","amount":10.00}'
```

## Error Handling

**Always check `success` field** in responses:

```typescript
const response = await fetch('/api/withdraw', { /* ... */ })
const data = await response.json()

if (!response.ok || !data.success) {
  console.error('API Error:', data.error)
  console.error('Status Code:', data.statusCode)
  // Handle error
} else {
  console.log('Success:', data.data)
}
```

---

**API Version**: 1.0 | **Last Updated**: April 2026
