# 🚀 Setup & Installation Guide

Complete guide to setting up Shifter for local development or deployment.

## Prerequisites Checklist

Before starting, ensure you have:

- [ ] **Node.js 18+** - [Download](https://nodejs.org/)
  ```bash
  node --version  # Should be v18.0.0 or higher
  ```

- [ ] **npm 9+** - Comes with Node.js
  ```bash
  npm --version
  ```

- [ ] **Git** - [Download](https://git-scm.com/)

- [ ] **SQLite3** - Usually pre-installed
  ```bash
  sqlite3 --version
  ```

- [ ] **Web3 Wallet** (for testing) - [MetaMask](https://metamask.io/)
  - Must be configured for XLayer network
  - Need some USDC for task testing (optional)

## Step 1: Clone Repository

```bash
git clone <your-repo-url>
cd shifter
```

## Step 2: Install Dependencies

```bash
npm install
```

This will install:
- Next.js & React
- Prisma ORM
- Ethers.js (blockchain)
- Tailwind CSS
- TypeScript

**Installation should complete in 2-3 minutes.**

## Step 3: Environment Configuration

### Create `.env` file

```bash
cp .env.example .env
```

### Configure Environment Variables

Edit `.env` with your settings:

```env
# ===== DATABASE =====
DATABASE_URL="file:./dev.db"  # Local SQLite (development)

# ===== BLOCKCHAIN (XLayer) =====
# Network: XLayer (OKX Layer 2)
# Chain ID: 196
NEXT_PUBLIC_RPC_URL="https://rpc.xlayer.tech"
NEXT_PUBLIC_CHAIN_ID="196"

# Contract addresses (optional, for advanced features)
NEXT_PUBLIC_CONTRACT_ADDRESS=""

# ===== API CONFIGURATION =====
NEXT_PUBLIC_API_URL="http://localhost:3000"  # Dev
# For production: NEXT_PUBLIC_API_URL="https://your-domain.com"

# ===== OPTIONAL =====
# NODE_ENV="development"  # Automatically set based on npm script
```

## Step 4: Initialize Database

### Generate Prisma Client

```bash
npm run db:generate
```

This creates the Prisma client based on your schema.

### Push Schema to Database

```bash
npm run db:push
```

This creates the SQLite database and tables. Expected output:
```
✔ Database synchronized, created 5 tables
```

### Verify Database

```bash
node check-db.js
```

You should see all tables listed:
- Player
- Withdrawal
- Task
- TaskCompletion
- GameSession

## Step 5: (Optional) Seed Initial Data

### Generate Test Wallets

```bash
npm run generate-wallet
```

Creates random Ethereum wallets for testing.

### Populate Sample Tasks

```bash
npm run seed-tasks
```

Adds game tasks to database:
- "Hold 100 USDC on XLayer" (50 USDC reward)
- "Complete Hard Mode" (25 USDC reward)
- "Reach 1000 points" (10 USDC reward)

Verify tasks were created:
```bash
npm run check-tasks
```

## Step 6: Start Development Server

```bash
npm run dev
```

Expected output:
```
  ▲ Next.js 14.2.0
  - Local:        http://localhost:3000
  - Environments: .env
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Step 7: Verify Setup

- [ ] Game loads and renders
- [ ] Connect wallet button appears
- [ ] Game can be played (no wallet required)
- [ ] Leaderboard loads
- [ ] No console errors

## Configuration Deep Dive

### Game Constants (`lib/constants.ts`)

Adjust gameplay parameters:

```typescript
// Canvas dimensions
export const CANVAS_WIDTH = 800
export const CANVAS_HEIGHT = 600

// Movement
export const PLAYER_SIZE = 30
export const BASE_SPEED = 4
export const HARD_MODE_SPEED_BOOST = 1.5
export const MAX_SPEED = 8

// Gameplay
export const OBSTACLE_SPACING = 120
export const COINS_PER_SCREEN = 3
export const COIN_SPAWN_INTERVAL = 2000 // ms

// Rewards (in USDC)
export const COIN_VALUE_NORMAL = 0.01
export const COIN_VALUE_MEDIUM = 0.03
export const COIN_VALUE_HARD = 0.05

// Blockchain
export const XLAYER_CHAIN_ID = 196
export const XLAYER_EXPLORER = "https://www.okx.com/web3/explorer/xlayer"
export const MIN_WITHDRAWAL = 1.0 // USDC
```

### Database (`prisma/schema.prisma`)

Modify models and relationships. After changes:

```bash
npm run db:push    # Apply changes to DB
npm run db:generate # Regenerate Prisma client
```

## Troubleshooting

### Issue: `EACCES: permission denied` during npm install

**Solution**: Use `sudo` or configure npm properly:
```bash
sudo npm install
# OR
npm install --unsafe-perm
```

### Issue: SQLite database not creating

**Solution**: Ensure write permissions in project directory:
```bash
chmod 755 .
npm run db:push
```

### Issue: Port 3000 already in use

**Solution**: Use a different port:
```bash
npm run dev -- -p 3001
```

### Issue: Next.js build fails with TypeScript errors

**Solution**: Check for type errors:
```bash
npx tsc --noEmit
```

Fix any reported errors, then rebuild.

### Issue: Prisma client errors

**Solution**: Regenerate Prisma client:
```bash
npm run db:generate
```

If persistent, remove and reinstall:
```bash
rm -rf node_modules/.prisma
npm run db:generate
```

### Issue: Wallet connection fails

**Check**:
1. MetaMask installed and unlocked
2. XLayer network added to MetaMask:
   - **Network**: XLayer Mainnet
   - **RPC URL**: https://rpc.xlayer.tech
   - **Chain ID**: 196
   - **Explorer**: https://www.okx.com/web3/explorer/xlayer

3. Connected to correct network in MetaMask

## Development Workflows

### Hot Reload

Changes to `.tsx`, `.ts`, `.css` files auto-reload in browser. No manual restart needed.

### Database Changes

```bash
# 1. Modify schema.prisma
# 2. Run:
npm run db:push
npm run db:generate

# 3. Restart dev server (usually auto-restarts)
```

### Testing Game Logic

Use browser DevTools Console to access game state:
```javascript
// Check player position, score, etc.
console.log('Game state available via Game component refs')
```

## Building for Production

### Create Production Build

```bash
npm run build
```

Output goes to `.next/` folder.

### Run Production Server

```bash
npm run start
```

Default port is 3000. Set custom port:
```bash
npm run start -- -p 8080
```

### Environment for Production

Create `.env.production`:
```env
DATABASE_URL="your-production-db-url"
NEXT_PUBLIC_API_URL="https://your-domain.com"
NEXT_PUBLIC_RPC_URL="https://rpc.xlayer.tech"
```

## Deployment

### Railway.app

1. **Connect GitHub** - Link your repository
2. **Create Service** - Select Node.js
3. **Configure** - Railway auto-detects `package.json` and `railway.toml`
4. **Environment** - Set all required env vars in Railway dashboard
5. **Deploy** - Push to main branch to auto-deploy

See `railway.toml` for Railway configuration.

### Other Platforms (Vercel, Netlify, etc.)

1. **Build**: `npm run build`
2. **Start**: `npm run start`
3. **Environment**: Configure env vars in platform dashboard
4. **Database**: Use managed PostgreSQL (recommended for production)
   - Update `DATABASE_URL` in .env
   - Update database provider in `prisma/schema.prisma`

## Next Steps

- [ ] Review [API.md](./API.md) for endpoint documentation
- [ ] Check [ARCHITECTURE.md](./ARCHITECTURE.md) for code structure
- [ ] Deploy to production
- [ ] Customize game constants for your version
- [ ] Add custom tasks and rewards

---

**Last Updated**: April 2026 | **Shifter v1.0.0**
