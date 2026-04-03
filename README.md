# 🎮 Shifter

A blockchain-based game on XLayer where players collect coins, complete tasks, and earn real USDC rewards.

## Overview

**Shifter** is an interactive web game that combines fast-paced gameplay with Web3 integration. Players navigate obstacles, collect color-changing orbs, and gather coins to earn USDC tokens that can be withdrawn to their XLayer wallet.

### Key Features

- 🕹️ **Fast-Paced Gameplay** - Navigate obstacles, collect coins, survive the gauntlet
- 💰 **Real Earnings** - Collect in-game coins to earn actual USDC rewards
- 🎯 **Task System** - Complete specific challenges to earn bonus rewards (e.g., hold X USDC)
- 👛 **Wallet Integration** - Connect your XLayer wallet and withdraw earnings directly
- 📊 **Leaderboard** - Compete globally; see your ranking and top players
- 🔄 **Multi-Player Mode** - Track scores and earnings across game sessions

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| **Next.js 14** | Frontend & backend API routes |
| **React 18** | UI components and game logic |
| **TypeScript** | Type-safe code |
| **Prisma + SQLite** | Database & ORM |
| **Ethers.js** | Blockchain interaction (XLayer) |
| **Tailwind CSS** | Responsive styling |
| **Framer Motion** | Smooth animations |

## Project Structure

```
shifter/
├── app/                          # Next.js app directory
│   ├── api/                      # API routes
│   │   ├── history/              # Game history endpoint
│   │   ├── leaderboard/          # Top scores endpoint
│   │   ├── player/               # Player profile endpoint
│   │   ├── tasks/                # Task management endpoints
│   │   │   ├── swap-params/      # Token swap parameters
│   │   │   └── verify/           # Task verification
│   │   └── withdraw/             # Withdrawal processing
│   ├── leaderboard/              # Leaderboard page
│   ├── profile/                  # User profile page
│   ├── tasks/                    # Tasks page
│   ├── page.tsx                  # Main game page
│   └── layout.tsx                # Root layout
├── components/
│   └── Game.tsx                  # Main game canvas component
├── lib/
│   ├── agent-wallet.ts           # Wallet interaction helpers
│   ├── constants.ts              # Game constants (speed, colors, rewards)
│   ├── db.ts                     # Database utilities
├── prisma/
│   └── schema.prisma             # Database schema
├── scripts/
│   ├── generate-wallet.ts        # Create test wallets
│   ├── seed-tasks.js             # Populate tasks into DB
│   └── check-tasks.js            # Verify task setup
└── package.json                  # Dependencies & scripts
```

## Quick Start

### Prerequisites
- Node.js 18+ and npm
- SQLite3 (usually included)
- MetaMask or compatible XLayer-enabled wallet

### Installation

```bash
# Clone and install
git clone <repo-url>
cd shifter
npm install

# Setup environment
cp .env.example .env
# Edit .env with your blockchain RPC and contract details

# Setup database
npm run db:generate
npm run db:push

# (Optional) Seed initial tasks
npm run seed-tasks

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm run start
```

## Gameplay

### Controls
- **Arrow Keys** / **Mouse/Touch** - Move left/right across the screen
- **Tap/Click** - On mobile touch screen to move

### Game Loop
1. Avoid obstacles coming down the screen
2. Collect USDC coins (worth 0.01-0.05 USDC each)
3. Hit color orbs to change player color and evade obstacles
4. Reach high scores to unlock better rewards
5. Complete tasks for bonus earnings

### Scoring
- **Normal Mode**: Standard coin/obstacle difficulty
- **Hard Mode**: 1.5x speed boost, higher coin values
- **Session Earnings**: In-game coins convert to USDC on game end

## Blockchain Features

### Wallet Connection
- Connect XLayer wallet (MetaMask/compatible)
- All earnings tied to wallet address
- No gas fees for gameplay state changes

### Withdrawal
- Minimum withdrawal: 1.00 USDC
- Direct transfer to connected wallet
- Transaction confirmed on XLayer chain
- View all withdrawal history in Profile

### Task System
- **Types**: Hold USDC, complete game achievements
- **Verification**: On-chain checks for task eligibility
- **Rewards**: Instant credit to player account

## Configuration

Game parameters can be adjusted in `lib/constants.ts`:

```typescript
// Gameplay
CANVAS_WIDTH = 800
CANVAS_HEIGHT = 600
BASE_SPEED = 4
HARD_MODE_SPEED_BOOST = 1.5
MAX_SPEED = 8

// Rewards
COIN_VALUE_NORMAL = 0.01 USDC
COIN_VALUE_MEDIUM = 0.03 USDC
COIN_VALUE_HARD = 0.05 USDC

// Blockchain
XLAYER_CHAIN_ID = 196
XLAYER_EXPLORER = "https://www.okx.com/web3/explorer/xlayer"
```

## API Endpoints

See [API.md](./API.md) for detailed endpoint documentation.

### Key Endpoints
- `GET /api/player` - Get player stats
- `GET /api/leaderboard` - Top scores
- `GET /api/history` - Game history
- `POST /api/withdraw` - Initiate withdrawal
- `POST /api/tasks/verify` - Verify task completion

## Development

### Database Management
```bash
npm run db:generate  # Regenerate Prisma client
npm run db:push      # Sync schema to database
npm run check-db     # Verify DB integrity
```

### Scripts
```bash
npm run generate-wallet   # Create test wallet
npm run seed-tasks        # Auto-populate tasks
npm run dev              # Start dev server
npm run build            # Production build
npm run start            # Run production server
```

## Deployment

### Railway
Pre-configured for [Railway.app](https://railway.app/) deployment:
- See `railway.toml` for configuration
- Database: PostgreSQL recommended for production
- Environment variables managed via Railway dashboard

### Environment Variables
```env
# Database
DATABASE_URL=       # Your DB connection string

# Blockchain (XLayer)
NEXT_PUBLIC_RPC_URL=
NEXT_PUBLIC_CHAIN_ID=196
NEXT_PUBLIC_CONTRACT_ADDRESS=

# Optional
NEXT_PUBLIC_API_URL=
```

## FAQ

**Q: Do I need to pay gas fees?**
A: No! Gas fees are covered by the protocol. You only pay when withdrawing earnings.

**Q: How are earnings calculated?**
A: 1 in-game coin = 0.01-0.05 USDC depending on difficulty mode.

**Q: Can I play without a wallet?**
A: Yes, but you can't earn or withdraw without one connected.

**Q: How do tasks work?**
A: Tasks are on-chain requirements (e.g., "Hold 100 USDC"). Complete them to earn bonus rewards.

## Support & Links

- **X Layer Explorer**: https://www.okx.com/web3/explorer/xlayer
- **Documentation**: See [SETUP.md](./SETUP.md), [API.md](./API.md), [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions

## License

MIT License - See LICENSE file for details

---

**Build Version**: 1.0.0 | **Last Updated**: April 2026
