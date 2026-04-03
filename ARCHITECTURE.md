# 🏗️ Architecture & Codebase Guide

Technical overview of Shifter's structure, design patterns, and key components.

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser / Client                         │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Game Component (Canvas)                                 │ │
│  │  - Movement, collision, coin collection                  │ │
│  │  - Real-time game loop (60 FPS)                          │ │
│  │  - UI overlays (scores, menu, wallet connect)            │ │
│  └─────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Wallet Integration (Ethers.js)                          │ │
│  │  - MetaMask connection                                   │ │
│  │  - Balance queries                                       │ │
│  │  - Transaction signing                                   │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↕️ API
┌─────────────────────────────────────────────────────────────┐
│                    Next.js Server (API)                      │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  API Routes (app/api/*)                                  │ │
│  │  - Player profile & stats                                │ │
│  │  - Leaderboard queries                                   │ │
│  │  - Task verification                                     │ │
│  │  - Withdrawal processing                                 │ │
│  └─────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Database (Prisma ORM)                                   │ │
│  │  - SQLite (dev) / PostgreSQL (prod)                      │ │
│  └─────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Blockchain Integration (Ethers.js)                      │ │
│  │  - XLayer RPC calls                                      │ │
│  │  - USDC balance checks                                   │ │
│  │  - Transaction verification                              │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↕️ RPC
┌─────────────────────────────────────────────────────────────┐
│              XLayer Blockchain (Chain ID: 196)               │
│  - USDC token contract                                       │
│  - Player wallet addresses                                   │ │
│  - Withdrawal transaction receipts                           │
└─────────────────────────────────────────────────────────────┘
```

## File Structure

### `components/Game.tsx`

**Purpose**: Main game component with canvas-based gameplay.

**Key Responsibilities**:
- Render canvas at 60 FPS
- Handle user input (keyboard/touch)
- Manage game state (player, obstacles, coins)
- Connect to wallet
- Send game completion events to API

**Architecture**:
```typescript
// Game state stored in refs (for performance)
const gameRefs: GameRefs = {
  cameraY: 0,
  speed: 0,
  score: 0,
  playerX: 0,
  playerColor: string,
  obstacles: Obstacle[],
  colorOrbs: ColorOrb[],
  usdcCoins: USDCCoin[],
  // ... more state
}

// UI state in useState (for re-renders)
const [gameState, setGameState] = useState('menu' | 'playing' | 'gameover')
const [displayScore, setDisplayScore] = useState(0)
// ... more UI state
```

**Why This Split?**
- Refs handle high-frequency updates (1000s per second) without re-rendering
- useState triggers UI updates only when necessary (score change, game over)
- ~60 FPS game loop at 60Hz monitor refresh rate

**Key Functions**:
- `gameLoop()` - Main animation frame loop
- `handleCollisionDetection()` - Obstacle/coin collision checks
- `handleWalletConnect()` - MetaMask integration
- `handleGameOver()` - End game, save score, calculate earnings

---

### `app/api/` Routes

#### `player/route.ts`
**Endpoint**: `GET /api/player`

```typescript
// Query: ?walletAddress=0x...
export async function GET(req: Request) {
  const walletAddress = searchParams.get('walletAddress')
  
  // Find player in DB
  const player = await prisma.player.findUnique({
    where: { walletAddress }
  })
  
  return Response.json(player)
}
```

**Database Query**:
```sql
SELECT * FROM Player WHERE walletAddress = ?
```

---

#### `leaderboard/route.ts`
**Endpoint**: `GET /api/leaderboard`

```typescript
export async function GET(req: Request) {
  const { limit, offset } = getParams(req)
  
  const topPlayers = await prisma.player.findMany({
    orderBy: { bestScore: 'desc' },
    take: limit,
    skip: offset
  })
  
  return Response.json(topPlayers)
}
```

**Optimization**: No indexes or pagination limits = O(n) scan. 
**Recommendation**: Add index on `bestScore` field.

---

#### `withdraw/route.ts`
**Endpoint**: `POST /api/withdraw`

```typescript
export async function POST(req: Request) {
  const { walletAddress, amount } = await req.json()
  
  // 1. Validate amount
  if (amount < MIN_WITHDRAWAL) {
    throw new Error('Insufficient amount')
  }
  
  // 2. Check player balance
  const player = await prisma.player.findUnique({
    where: { walletAddress }
  })
  
  if (player.pendingBalance < amount) {
    throw new Error('Insufficient balance')
  }
  
  // 3. Create blockchain transaction (Ethers.js)
  const tx = await sendUSDCWithdrawal(walletAddress, amount)
  
  // 4. Record withdrawal in DB
  await prisma.withdrawal.create({
    data: {
      playerId: player.id,
      walletAddress,
      amount,
      txHash: tx.hash
    }
  })
  
  return Response.json({
    txHash: tx.hash,
    status: 'pending'
  })
}
```

---

#### `tasks/verify/route.ts`
**Endpoint**: `POST /api/tasks/verify`

```typescript
export async function POST(req: Request) {
  const { walletAddress, taskId } = await req.json()
  
  // Get task definition
  const task = await prisma.task.findUnique({
    where: { id: taskId }
  })
  
  // Verify based on task type
  let isCompleted = false
  
  switch (task.type) {
    case 'HOLD_X_LAYER_USDC':
      // Check blockchain balance
      isCompleted = await checkUSDCBalance(
        walletAddress, 
        task.targetValue
      )
      break
    
    case 'HARD_MODE_SCORE':
      // Check game history
      const recentGame = await prisma.gameSession.findFirst({
        where: { walletAddress },
        orderBy: { createdAt: 'desc' }
      })
      isCompleted = recentGame?.score >= task.targetValue
      break
  }
  
  if (isCompleted) {
    // Check if already completed
    const existing = await prisma.taskCompletion.findUnique({
      where: { taskId_playerId: { taskId, playerId } }
    })
    
    if (!existing) {
      // Record completion + credit reward
      await prisma.taskCompletion.create({
        data: { taskId, playerId }
      })
      
      await prisma.player.update({
        where: { id: playerId },
        data: { pendingBalance: { increment: task.reward } }
      })
    }
  }
  
  return Response.json({ completed: isCompleted })
}
```

---

### `lib/constants.ts`

Centralized configuration for all gameplay parameters:

```typescript
// Canvas & rendering
export const CANVAS_WIDTH = 800
export const CANVAS_HEIGHT = 600
export const PLAYER_SIZE = 30

// Gameplay tuning
export const BASE_SPEED = 4
export const HARD_MODE_SPEED_BOOST = 1.5
export const MAX_SPEED = 8
export const OBSTACLE_SPACING = 120

// Coin spawning
export const COINS_PER_SCREEN = 3
export const COIN_SPAWN_INTERVAL = 2000

// Rewards
export const COIN_VALUE_NORMAL = 0.01  // USDC
export const COIN_VALUE_MEDIUM = 0.03
export const COIN_VALUE_HARD = 0.05

// Blockchain
export const XLAYER_CHAIN_ID = 196
export const MIN_WITHDRAWAL = 1.0
```

**Why centralize?**
- Adjust game difficulty without code changes
- Update rewards in one place
- A/B testing via environment overrides
- Easy rollback to previous values

---

### `lib/agent-wallet.ts`

Wallet integration utilities:

```typescript
import { ethers } from 'ethers'

// Connect to XLayer network
export async function connectWallet() {
  const provider = new ethers.BrowserProvider(window.ethereum)
  const signer = await provider.getSigner()
  return signer
}

// Check USDC balance on XLayer
export async function getUSDCBalance(address: string): Promise<number> {
  const provider = new ethers.JsonRpcProvider(XLAYER_RPC_URL)
  const contract = new ethers.Contract(USDC_ADDRESS, ABI, provider)
  const balance = await contract.balanceOf(address)
  return ethers.formatUnits(balance, 6) // USDC has 6 decimals
}

// Send USDC to player (withdrawal)
export async function sendUSDCWithdrawal(
  to: string, 
  amount: number
): Promise<ethers.TransactionResponse> {
  const signer = await connectWallet()
  const contract = new ethers.Contract(USDC_ADDRESS, ABI, signer)
  return contract.transfer(to, ethers.parseUnits(amount.toString(), 6))
}
```

---

### `prisma/schema.prisma`

Database schema with 5 core models:

```prisma
model Player {
  id              String    @id @default(cuid())
  walletAddress   String    @unique
  bestScore       Int       @default(0)
  totalEarned     Float     @default(0)
  totalWithdrawn  Float     @default(0)
  pendingBalance  Float     @default(0)
  gamesPlayed     Int       @default(0)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  // Relations
  withdrawals     Withdrawal[]
  completions     TaskCompletion[]
  
  @@index([walletAddress])
}

model Withdrawal {
  id              String    @id @default(cuid())
  playerId        String
  player          Player    @relation(fields: [playerId])
  walletAddress   String
  amount          Float
  score           Int
  txHash          String
  status          String    @default("confirmed")
  createdAt       DateTime  @default(now())
  
  @@index([walletAddress])
  @@index([createdAt])
}

model Task {
  id              String    @id @default(cuid())
  title           String
  description     String
  reward          Float
  type            String    // HOLD_X_LAYER_USDC, HARD_MODE_SCORE, etc.
  targetValue     Float?
  completions     TaskCompletion[]
  createdAt       DateTime  @default(now())
}

model TaskCompletion {
  id              String    @id @default(cuid())
  taskId          String
  task            Task      @relation(fields: [taskId])
  playerId        String
  player          Player    @relation(fields: [playerId])
  createdAt       DateTime  @default(now())
  
  @@unique([taskId, playerId])
}

model GameSession {
  id              String    @id @default(cuid())
  walletAddress   String?
  score           Int
  coinsCollected  Int       @default(0)
  earnings        Float     @default(0)
  createdAt       DateTime  @default(now())
  
  @@index([walletAddress])
  @@index([createdAt])
}
```

**Key Design Decisions**:
- `pendingBalance`: Earnings not yet withdrawn
- `totalWithdrawn`: Cumulative withdrawn amount (for analytics)
- Separate `Withdrawal` table for transaction history
- `TaskCompletion` is unique per task per player (prevent double-reward)

---

## Data Flow

### Game Session → Earnings

```
1. Player plays game
   ↓
2. Collects coins (15 coins in normal mode)
   ↓
3. Game ends: score = 2500, coins = 15
   ↓
4. Earnings = 15 coins × $0.01/coin = $0.15 USDC
   ↓
5. Send to API: POST /game-session
   {
     walletAddress: "0x...",
     score: 2500,
     earnings: 0.15
   }
   ↓
6. Server creates GameSession record
   ↓
7. Server updates Player.pendingBalance += 0.15
   ↓
8. Player sees "+$0.15 pending" on UI
```

### Withdrawal Flow

```
1. Player clicks "Withdraw $10"
   ↓
2. Calls POST /api/withdraw
   {
     walletAddress: "0x...",
     amount: 10.00
   }
   ↓
3. Server validates:
   - Amount >= $1.00 minimum
   - Player.pendingBalance >= 10.00
   ↓
4. Server calls sendUSDCWithdrawal()
   (via Ethers.js on XLayer)
   ↓
5. MetaMask pops up (if needed)
   Player confirms transaction
   ↓
6. Transaction sent to XLayer network
   ↓
7. Server records Withdrawal in DB
   {
     playerId, walletAddress, amount, txHash
   }
   ↓
8. Server deducts from pendingBalance
   Player.pendingBalance -= 10.00
   ↓
9. Sends txHash to client
   Client shows "Withdrawal pending..."
   Provides link to XLayer explorer
   ↓
10. ~5-30 seconds later: Block confirmation
    Funds appear in player wallet
```

### Task Verification Flow

```
1. Player has held $100+ USDC
   Views "Hold $100" task
   ↓
2. Clicks "Verify & Claim"
   ↓
3. Client sends POST /api/tasks/verify
   {
     walletAddress: "0x...",
     taskId: "task123"
   }
   ↓
4. Server fetches task definition
   (type: HOLD_X_LAYER_USDC, targetValue: 100)
   ↓
5. Server calls getUSDCBalance("0x...")
   via XLayer RPC
   ↓
6. Balance check returns: $150 USDC
   150 >= 100 ✓
   ↓
7. Server checks TaskCompletion
   (prevent double-reward)
   ↓
8. Creates TaskCompletion record
   Updates Player.pendingBalance += $50 reward
   ↓
9. Returns { completed: true, reward: 50 }
   ↓
10. Client shows "+$50 earned!"
```

---

## Performance Considerations

### Client-Side (Game Loop)

**Problem**: 60 FPS × complex collision detection = frame drops

**Solution**: Use refs instead of state for high-frequency updates
```typescript
// ✅ GOOD: No re-render, smooth 60 FPS
gameRefs.playerX += velocityX

// ❌ BAD: Re-render on every frame = stuttering
setPlayerX(prev => prev + velocityX)
```

**Result**: 60 FPS maintained even with 100+ obstacles on screen

---

### Server-Side (API)

**Bottleneck**: Database queries on leaderboard
```sql
SELECT * FROM Player ORDER BY bestScore DESC LIMIT 10
-- Without index: O(n log n) = slow with 10k+ players
```

**Solution**: Add index
```typescript
// In schema.prisma
model Player {
  bestScore Int @default(0)
  @@index([bestScore])  // <- Add this
}
```

**Result**: O(log n) query time. Leaderboard loads instantly.

---

### Database (Prisma)

**Problem**: N+1 queries when fetching player + withdrawals
```typescript
const player = await prisma.player.findUnique({
  where: { id: 'id1' }
})
// Extra query per withdrawal!
const withdrawals = await prisma.withdrawal.findMany({
  where: { playerId: player.id }
})
```

**Solution**: Use `include` for eager loading
```typescript
const player = await prisma.player.findUnique({
  where: { id: 'id1' },
  include: {
    withdrawals: true,
    completions: true
  }
})
// 1 query, all data fetched
```

---

## Security Considerations

### Wallet Verification

**Current**: Client-side only – no cryptographic verification

**Improvement**: Add EIP-191 message signing
```typescript
// Client signs message
const message = `verify-${Date.now()}`
const signature = await signer.signMessage(message)

// Server verifies signature
const recoveredAddress = ethers.verifyMessage(message, signature)
if (recoveredAddress !== walletAddress) {
  throw new Error('Invalid signature')
}
```

---

### Smart Contract Risk

**Current**: Direct USDC transfers via Ethers.js

**Risk**: Private key exposure, reentrancy attacks

**Improvement**:
1. Use relayer service (no private key stored)
2. Implement withdrawal allowance limits
3. Rate limiting per wallet

---

### Database Access

**Current**: No authentication on read endpoints

**Improvement**: Add rate limiting by IP
```typescript
const rateLimit = {
  leaderboard: '60 per minute',
  playerData: '100 per minute',
  withdraw: '5 per minute'
}
```

---

## Testing Strategy

### Unit Tests

Test individual functions (constants, utilities):
```typescript
test('calculateEarnings', () => {
  const earnings = 15 * COIN_VALUE_NORMAL
  expect(earnings).toBe(0.15)
})
```

### Integration Tests

Test API flow:
```typescript
test('POST /api/withdraw', async () => {
  const res = await fetch('/api/withdraw', {
    method: 'POST',
    body: JSON.stringify({
      walletAddress: '0x...',
      amount: 5.00
    })
  })
  
  expect(res.status).toBe(200)
  expect(res.json().txHash).toBeDefined()
})
```

### E2E Tests

Test full user flow:
1. Connect wallet
2. Play game
3. Complete task
4. Withdraw earnings
5. Verify funds in wallet

---

## Deployment Architecture

### Development
```
Local Machine
├── Next.js dev server (port 3000)
├── SQLite database (dev.db)
└── Hot reload on file changes
```

### Production (Railway)
```
Railway.app
├── Next.js production build
├── Node.js runtime
├── PostgreSQL database
├── Auto-deploy on git push main
└── Environment variables from Railway dashboard
```

**Key Changes from Dev**:
- SQLite → PostgreSQL (better concurrency)
- `.env.development` → `.env.production`
- `localhost:3000` → `your-domain.com`

---

## Future Enhancements

1. **Leaderboard Pagination** - Add table index on bestScore
2. **Game Replay System** - Store input sequences for instant replay
3. **Multiplayer** - WebSocket for real-time leaderboard updates
4. **NFT Achievements** - Mint badges for milestone scores
5. **Analytics** - Track player retention, daily active users
6. **Mobile App** - React Native wrapper around web game

---

**Architecture Version**: 1.0 | **Last Updated**: April 2026
