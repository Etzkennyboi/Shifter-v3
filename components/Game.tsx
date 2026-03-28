'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, PLAYER_SIZE, BASE_SPEED,
  HARD_MODE_SPEED_BOOST, MAX_SPEED, OBSTACLE_SPACING,
  COLOR_CHANGER_OFFSET, ORB_SIZE, COLORS,
  COIN_VALUE_NORMAL, COIN_VALUE_MEDIUM, COIN_VALUE_HARD,
  COINS_PER_SCREEN, COIN_SPAWN_INTERVAL, MIN_WITHDRAWAL,
  XLAYER_CHAIN_ID, XLAYER_EXPLORER,
} from '@/lib/constants'
import { ethers } from 'ethers'

// ===== TYPES =====
interface Obstacle {
  id: number
  y: number
  sections: string[]
}

interface ColorOrb {
  id: number
  y: number
  x: number
  newColor: string
  collected: boolean
}

interface USDCCoin {
  id: number
  y: number
  x: number
  value: number
  collected: boolean
  pulseOffset: number
}

interface Particle {
  x: number; y: number; vx: number; vy: number; color: string; life: number
}

interface FloatingText {
  x: number; y: number; text: string; life: number; color: string
}

// ===== GAME STATE (all refs — no useState for game loop data) =====
interface GameRefs {
  cameraY: number
  speed: number
  score: number
  playerX: number
  playerColor: string
  obstacles: Obstacle[]
  colorOrbs: ColorOrb[]
  usdcCoins: USDCCoin[]
  particles: Particle[]
  floatingTexts: FloatingText[]
  nextObstacleId: number
  sessionEarnings: number
  isRunning: boolean
  tick: number
}

declare global {
  interface Window {
    ethereum?: any
  }
}

export default function Game() {
  // ===== DISPLAY STATE (triggers re-renders for UI) =====
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'gameover'>('menu')
  const [displayScore, setDisplayScore] = useState(0)
  const [displaySessionEarnings, setDisplaySessionEarnings] = useState(0)
  const [displayPlayerColor, setDisplayPlayerColor] = useState(COLORS[0])
  const [highScore, setHighScore] = useState(0)
  const [totalPendingEarnings, setTotalPendingEarnings] = useState(0)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [isWithdrawing, setIsWithdrawing] = useState(false)
  const [withdrawTxHash, setWithdrawTxHash] = useState<string | null>(null)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)
  const [hasHydrated, setHydrated] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setHydrated(true)
  }, [])

  const uiScoreRef = useRef<HTMLSpanElement>(null)
  const uiEarningsRef = useRef<HTMLSpanElement>(null)
  const [taskEarnings, setTaskEarnings] = useState(0)

  // Fetch task earnings whenever wallet is connected or game ends
  const fetchTaskEarnings = useCallback(async (address: string) => {
    try {
      const res = await fetch(`/api/player?walletAddress=${address}`)
      const data = await res.json()
      setTaskEarnings(data.totalEarned || 0)
    } catch (e) {
      console.error('Failed to fetch task earnings:', e)
    }
  }, [])

  const [dimensions, setDimensions] = useState({ width: 400, height: 700 })
  const dimensionsRef = useRef({ width: 400, height: 700 })

  useEffect(() => {
    const updateSize = () => {
      if (gameAreaRef.current) {
        const { width, height } = gameAreaRef.current.getBoundingClientRect()
        setDimensions({ width, height })
        dimensionsRef.current = { width, height }
        g.current.playerX = Math.min(g.current.playerX, width - PLAYER_SIZE / 2)
      }
    }
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  const getDynamicSpacing = useCallback((score: number) => {
    const startSpacing = 550
    const endSpacing = 280
    const progress = Math.min(score / 3000, 1)
    return startSpacing - (startSpacing - endSpacing) * progress
  }, [])

  // ===== GAME REFS (mutable, no re-renders) =====
  const g = useRef<GameRefs>({
    cameraY: 0,
    speed: BASE_SPEED,
    score: 0,
    playerX: 170,
    playerColor: COLORS[0],
    obstacles: [],
    colorOrbs: [],
    usdcCoins: [],
    particles: [],
    floatingTexts: [],
    nextObstacleId: 0,
    sessionEarnings: 0,
    isRunning: false,
    tick: 0,
  })

  const gameAreaRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)
  const touchStartX = useRef<number>(0)

  // ===== HELPERS =====
  const generateObstacle = useCallback((yPos: number, id: number, safeColor: string, isHardMode: boolean, safeColor2?: string): Obstacle => {
    const numSections = 4
    const safePalette = [safeColor, safeColor2].filter(Boolean) as string[]
    const dangerousColors = COLORS.filter(c => !safePalette.includes(c))

    const sections: string[] = Array(numSections).fill(0).map(() =>
      dangerousColors.length > 0
        ? dangerousColors[Math.floor(Math.random() * dangerousColors.length)]
        : COLORS[0]
    )

    sections[Math.floor(Math.random() * numSections)] = safeColor
    if (safeColor2 && safeColor2 !== safeColor && numSections > 1) {
      const primarySlot = sections.lastIndexOf(safeColor)
      let secondarySlot: number
      do {
        secondarySlot = Math.floor(Math.random() * numSections)
      } while (secondarySlot === primarySlot)
      sections[secondarySlot] = safeColor2
    }
    return { id, y: yPos, sections }
  }, [])

  const generateColorOrb = useCallback((yPos: number, id: number, currentColor: string): ColorOrb => {
    const availableColors = COLORS.filter(c => c !== currentColor)
    return {
      id,
      y: yPos,
      x: Math.random() * (dimensionsRef.current.width - ORB_SIZE * 2) + ORB_SIZE,
      newColor: availableColors[Math.floor(Math.random() * availableColors.length)],
      collected: false,
    }
  }, [])

  const generateUSDCCoins = useCallback((yStart: number, startId: number, isHardMode: boolean): USDCCoin[] => {
    const coins: USDCCoin[] = []
    const value = isHardMode ? COIN_VALUE_HARD : (startId % 3 === 0 ? COIN_VALUE_MEDIUM : COIN_VALUE_NORMAL)
    for (let i = 0; i < COINS_PER_SCREEN; i++) {
      coins.push({
        id: startId + i,
        y: yStart - (i * COIN_SPAWN_INTERVAL),
        x: Math.random() * (dimensionsRef.current.width - 40) + 20,
        value,
        collected: false,
        pulseOffset: Math.random() * Math.PI * 2,
      })
    }
    return coins
  }, [])

  const spawnParticles = useCallback((x: number, y: number, color: string) => {
    for (let i = 0; i < 12; i++) {
      g.current.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 14,
        vy: (Math.random() - 0.5) * 14,
        color,
        life: 1.0,
      })
    }
    if (g.current.particles.length > 80) {
      g.current.particles = g.current.particles.slice(-80)
    }
  }, [])

  const triggerShake = useCallback(() => {
    if (gameAreaRef.current) {
      gameAreaRef.current.style.transform = `translate(${Math.random() * 10 - 5}px, ${Math.random() * 10 - 5}px)`
      setTimeout(() => {
        if (gameAreaRef.current) gameAreaRef.current.style.transform = 'none'
      }, 60)
    }
  }, [])

  // ===== DRAWING =====
  const draw = useCallback((ctx: CanvasRenderingContext2D) => {
    const state = g.current
    const { width, height } = dimensionsRef.current
    ctx.clearRect(0, 0, width, height)

    const playerScreenY = height * 0.75

    // === DRAW OBSTACLES ===
    state.obstacles.forEach(obs => {
      const screenY = obs.y - state.cameraY
      const sectionWidth = width / obs.sections.length
      obs.sections.forEach((color, i) => {
        ctx.fillStyle = color
        ctx.fillRect(i * sectionWidth, screenY, sectionWidth, 24)
        
        ctx.globalAlpha = 0.3
        ctx.fillRect(i * sectionWidth + 2, screenY + 2, sectionWidth - 4, 20)
        ctx.globalAlpha = 1.0
      })
    })

    // === DRAW COLOR ORBS ===
    state.colorOrbs.forEach(orb => {
      if (orb.collected) return
      const screenY = orb.y - state.cameraY
      
      ctx.beginPath()
      ctx.arc(orb.x, screenY, 15, 0, Math.PI * 2)
      ctx.fillStyle = orb.newColor
      ctx.fill()
      
      ctx.globalAlpha = 0.4
      ctx.beginPath()
      ctx.arc(orb.x, screenY, 20, 0, Math.PI * 2)
      ctx.fillStyle = orb.newColor
      ctx.fill()
      ctx.globalAlpha = 1.0
      
      ctx.beginPath()
      ctx.arc(orb.x, screenY, 20, 0, Math.PI * 2)
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 2
      ctx.stroke()
    })

    // === DRAW USDC COINS ===
    state.usdcCoins.forEach(coin => {
      if (coin.collected) return
      const screenY = coin.y - state.cameraY
      const pulse = Math.sin(state.tick * 0.1 + coin.pulseOffset) * 3
      
      ctx.beginPath()
      ctx.arc(coin.x, screenY, 12 + pulse, 0, Math.PI * 2)
      ctx.fillStyle = '#2775ca'
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.stroke()
      
      ctx.fillStyle = 'white'
      ctx.font = 'bold 12px Arial'
      ctx.textAlign = 'center'
      ctx.fillText('$', coin.x, screenY + 4)
    })

    // === DRAW PARTICLES ===
    state.particles.forEach(p => {
      ctx.globalAlpha = p.life
      ctx.fillStyle = p.color
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4)
    })
    ctx.globalAlpha = 1.0

    // === DRAW FLOATING TEXTS ===
    state.floatingTexts.forEach(ft => {
      ctx.globalAlpha = ft.life
      ctx.fillStyle = ft.color
      ctx.font = 'bold 16px Courier New'
      ctx.textAlign = 'center'
      ctx.fillText(ft.text, ft.x, ft.y - (1.0 - ft.life) * 50)
    })
    ctx.globalAlpha = 1.0

    // === DRAW PLAYER ===
    ctx.fillStyle = state.playerColor
    ctx.shadowBlur = 15
    ctx.shadowColor = state.playerColor
    ctx.fillRect(state.playerX - PLAYER_SIZE / 2, playerScreenY - PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE)
    
    ctx.fillStyle = 'white'
    ctx.fillRect(state.playerX - PLAYER_SIZE / 4, playerScreenY - PLAYER_SIZE / 4, PLAYER_SIZE / 2, PLAYER_SIZE / 2)
    ctx.shadowBlur = 0

  }, [])

  // ===== GAME LOOP =====
  const gameLoop = useCallback(async () => {
    if (!g.current.isRunning) return

    const state = g.current
    const { width, height } = dimensionsRef.current
    state.tick++

    const playerScreenY = height * 0.75

    state.cameraY -= state.speed
    state.score++
    const isHardMode = state.score > 1000

    let targetSpeed = BASE_SPEED + (state.score / 4000)
    if (isHardMode) targetSpeed += HARD_MODE_SPEED_BOOST + ((state.score - 1000) / 1000)
    state.speed = Math.min(state.speed + 0.005, Math.min(targetSpeed, MAX_SPEED))

    state.particles = state.particles
      .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, life: p.life - 0.05 }))
      .filter(p => p.life > 0)

    state.floatingTexts = state.floatingTexts
      .map(ft => ({ ...ft, life: ft.life - 0.03 }))
      .filter(ft => ft.life > 0)

    const farthestObstacleY = state.obstacles.length > 0
      ? Math.min(...state.obstacles.map(o => o.y))
      : state.cameraY

    if (farthestObstacleY > state.cameraY - height * 1.5) {
      const dynamicSpacing = getDynamicSpacing(state.score)
      const newY = farthestObstacleY - dynamicSpacing
      const obsId = state.nextObstacleId++

      if (obsId % 3 === 0) {
        const orb = generateColorOrb(newY + (dynamicSpacing / 2), obsId, state.playerColor)
        state.colorOrbs.push(orb)
        state.obstacles.push(generateObstacle(newY, obsId, state.playerColor, isHardMode, orb.newColor))
      } else {
        state.obstacles.push(generateObstacle(newY, obsId, state.playerColor, isHardMode))
      }
      const coins = generateUSDCCoins(newY + 100, obsId * 10, isHardMode).slice(0, 1)
      state.usdcCoins.push(...coins)
    }

    const cleanupY = state.cameraY + height + 200
    state.obstacles = state.obstacles.filter(o => o.y < cleanupY)
    state.colorOrbs = state.colorOrbs.filter(o => o.y < cleanupY)
    state.usdcCoins = state.usdcCoins.filter(c => c.y < cleanupY)

    state.colorOrbs.forEach(orb => {
      if (orb.collected) return
      const orbScreenY = orb.y - state.cameraY
      const dx = Math.abs(state.playerX - orb.x)
      const dy = Math.abs(playerScreenY - orbScreenY)
      if (dx < ORB_SIZE && dy < ORB_SIZE) {
        orb.collected = true
        state.playerColor = orb.newColor
        spawnParticles(orb.x, orbScreenY, orb.newColor)

        const playerWorldY = state.cameraY + playerScreenY
        state.obstacles
          .filter(o => o.y < playerWorldY)
          .forEach(obs => {
            const rebuilt = generateObstacle(obs.y, obs.id, orb.newColor, isHardMode)
            obs.sections = rebuilt.sections
          })
      }
    })

    state.usdcCoins.forEach(coin => {
      if (coin.collected) return
      const coinScreenY = coin.y - state.cameraY
      const dx = Math.abs(state.playerX - coin.x)
      const dy = Math.abs(playerScreenY - coinScreenY)
      if (dx < 28 && dy < 28) {
        coin.collected = true
        state.sessionEarnings += coin.value
        spawnParticles(coin.x, coinScreenY, '#FFD700')
        state.floatingTexts.push({
          x: coin.x, y: coinScreenY, text: `+$${coin.value.toFixed(2)}`, life: 1.0, color: '#FFD700',
        })
      }
    })

    for (const obs of state.obstacles) {
      const obsScreenY = obs.y - state.cameraY
      const obsHeight = 28
      if (playerScreenY + PLAYER_SIZE / 2 > obsScreenY && playerScreenY - PLAYER_SIZE / 2 < obsScreenY + obsHeight) {
        const sectionWidth = width / obs.sections.length
        const sectionIndex = Math.floor(state.playerX / sectionWidth)
        const clampedIndex = Math.max(0, Math.min(sectionIndex, obs.sections.length - 1))

        if (obs.sections[clampedIndex] !== state.playerColor) {
          state.isRunning = false
          spawnParticles(state.playerX, playerScreenY, state.playerColor)
          triggerShake()

          const finalScore = Math.floor(state.score)
          const finalEarnings = state.sessionEarnings
          setDisplayScore(finalScore)
          setDisplaySessionEarnings(finalEarnings)
          setGameState('gameover')

          const prevHigh = parseInt(localStorage.getItem('shifter_high_score') || '0')
          if (finalScore > prevHigh) {
            localStorage.setItem('shifter_high_score', finalScore.toString())
            setHighScore(finalScore)
          }

          const prevPending = parseFloat(localStorage.getItem('shifter_pending') || '0')
          const newPending = prevPending + finalEarnings
          localStorage.setItem('shifter_pending', newPending.toFixed(6))
          setTotalPendingEarnings(newPending)

          if (walletAddress) {
            fetch('/api/player', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ walletAddress, score: finalScore, earnings: finalEarnings }),
            }).then(r => r.json()).then(data => {
              if (data.bestScore) setHighScore(data.bestScore)
              fetchTaskEarnings(walletAddress)
            }).catch(err => console.error('Failed to sync player info:', err))
          }
          return
        }
      }
    }

    if (state.tick % 5 === 0) {
      if (uiScoreRef.current) uiScoreRef.current.innerText = state.score.toString()
      if (uiEarningsRef.current) uiEarningsRef.current.innerText = `$${state.sessionEarnings.toFixed(2)}`
    }

    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) draw(ctx)
    if (state.isRunning) animFrameRef.current = requestAnimationFrame(gameLoop)
  }, [generateObstacle, generateColorOrb, generateUSDCCoins, spawnParticles, triggerShake, draw, walletAddress, fetchTaskEarnings, getDynamicSpacing])

  const startGame = useCallback(() => {
    const state = g.current
    state.cameraY = 0
    state.speed = BASE_SPEED
    state.score = 0
    state.playerX = dimensionsRef.current.width / 2
    state.playerColor = COLORS[0]
    state.obstacles = []
    state.colorOrbs = []
    state.usdcCoins = []
    state.particles = []
    state.floatingTexts = []
    state.nextObstacleId = 0
    state.sessionEarnings = 0
    state.isRunning = true
    state.tick = 0

    setDisplayScore(0)
    setDisplaySessionEarnings(0)
    setDisplayPlayerColor(COLORS[0])
    setWithdrawTxHash(null)
    setWithdrawError(null)
    setGameState('playing')

    for (let i = 0; i < 5; i++) {
      const dynamicSpacing = getDynamicSpacing(0)
      const y = -(i + 1) * dynamicSpacing
      const id = state.nextObstacleId++
      state.obstacles.push(generateObstacle(y, id, state.playerColor, false))
      if (id % 3 === 0) {
        state.colorOrbs.push(generateColorOrb(y + (dynamicSpacing / 2), id, state.playerColor))
      }
      const coins = generateUSDCCoins(y + 100, id * 10, false).slice(0, 1)
      state.usdcCoins.push(...coins)
    }

    animFrameRef.current = requestAnimationFrame(gameLoop)
  }, [gameLoop, generateObstacle, generateColorOrb, generateUSDCCoins, getDynamicSpacing])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!g.current.isRunning || !gameAreaRef.current) return
      const rect = gameAreaRef.current.getBoundingClientRect()
      g.current.playerX = Math.max(PLAYER_SIZE / 2, Math.min(rect.width - PLAYER_SIZE / 2, (e.clientX - rect.left)))
    }
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 0) touchStartX.current = e.touches[0].clientX
    }
    const handleTouchMove = (e: TouchEvent) => {
      if (!g.current.isRunning || !gameAreaRef.current) return
      const rect = gameAreaRef.current.getBoundingClientRect()
      if (e.touches.length > 0) {
        g.current.playerX = Math.max(PLAYER_SIZE / 2, Math.min(rect.width - PLAYER_SIZE / 2, (e.touches[0].clientX - rect.left)))
      }
    }
    const el = gameAreaRef.current
    if (el) {
      el.addEventListener('mousemove', handleMouseMove)
      el.addEventListener('touchstart', handleTouchStart, { passive: false })
      el.addEventListener('touchmove', handleTouchMove, { passive: false })
    }
    return () => {
      if (el) {
        el.removeEventListener('mousemove', handleMouseMove)
        el.removeEventListener('touchstart', handleTouchStart)
        el.removeEventListener('touchmove', handleTouchMove)
      }
    }
  }, [gameState])

  useEffect(() => {
    return () => {
      g.current.isRunning = false
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('shifter_high_score')
    if (saved) setHighScore(parseInt(saved))
    const pending = localStorage.getItem('shifter_pending')
    if (pending) setTotalPendingEarnings(parseFloat(pending))
    const wallet = localStorage.getItem('shifter_wallet')
    
    if (wallet) {
      setWalletAddress(wallet)
      fetch(`/api/player?walletAddress=${wallet}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.bestScore !== undefined) {
             setHighScore(Math.max(parseInt(saved || "0"), data.bestScore))
          }
        }).catch(console.error)
    }

    if (window.ethereum) {
      const handleAccounts = (accounts: string[]) => {
        if (accounts.length > 0) {
          setWalletAddress(accounts[0])
          localStorage.setItem('shifter_wallet', accounts[0])
        } else {
          setWalletAddress(null)
          localStorage.removeItem('shifter_wallet')
        }
      }
      window.ethereum.on('accountsChanged', handleAccounts)
      return () => window.ethereum.removeListener('accountsChanged', handleAccounts)
    }
  }, [])

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      alert('Please install MetaMask or OKX Wallet!')
      return
    }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      const address = accounts[0]
      await fetchTaskEarnings(address)
      setWalletAddress(address)
      localStorage.setItem('shifter_wallet', address)

      fetch('/api/player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address, score: 0, earnings: 0 }),
      }).then(r => r.json()).then(data => {
        if (data.bestScore !== undefined) setHighScore(prev => Math.max(prev, data.bestScore))
      }).catch(console.error)
    } catch (err) {
      console.error('Wallet connection failed:', err)
    }
  }, [fetchTaskEarnings])

  const disconnectWallet = useCallback(() => {
    setWalletAddress(null)
    localStorage.removeItem('shifter_wallet')
  }, [])

  if (!hasHydrated) return null

  return (
    <div ref={containerRef} className="flex items-center justify-center w-full h-full p-4 overflow-hidden">
      <div
        ref={gameAreaRef}
        className={`relative overflow-hidden select-none shadow-[0_0_100px_rgba(0,0,0,0.8)] border border-white/10 ${gameState === 'playing' ? 'cursor-none' : 'cursor-default'}`}
        style={{
          width: '100%',
          maxWidth: '420px',
          height: '100%',
          maxHeight: '720px',
          background: 'linear-gradient(180deg, #030712 0%, #0f172a 50%, #030712 100%)',
          touchAction: 'none'
        }}
      >
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="absolute inset-0 w-full h-full"
      />

      {/* ===== MENU SCREEN ===== */}
      {gameState === 'menu' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-neon-dark/80 backdrop-blur-md pointer-events-auto border border-neon-blue/20 clip-both shadow-[0_0_50px_rgba(0,240,255,0.1)]">
          <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-transparent via-neon-blue to-transparent opacity-50 shadow-[0_0_10px_#00F0FF]"></div>
          
          <h1 className="text-4xl sm:text-5xl font-display font-black mb-2 animate-pulse-glow tracking-[0.05em] text-transparent bg-clip-text bg-gradient-to-br from-white via-neon-green to-neon-blue text-center px-4 w-full shrink-0">
            SHIFTER
          </h1>
          <p className="text-neon-blue text-[10px] mb-1 uppercase tracking-[0.3em] font-bold text-center">» Dodge · Collect · Earn</p>
          <p className="text-white/40 text-[9px] mb-4 uppercase tracking-[0.2em] text-center">Protocol: Extractions enabled via X Layer</p>

          <div className="mb-4 w-full max-w-[280px]">
            {highScore > 0 ? (
              <div className="bg-black/60 px-6 py-3 border-l-4 border-neon-pink clip-edge relative overflow-hidden group text-center">
                <div className="absolute inset-0 bg-neon-pink/5 group-hover:bg-neon-pink/10 transition-colors"></div>
                <p className="text-[10px] text-neon-pink uppercase tracking-[0.2em] mb-1 font-bold">Personal High Score</p>
                <p className="text-3xl font-display font-black text-white drop-shadow-[0_0_10px_rgba(255,0,60,0.6)]">{highScore}</p>
              </div>
            ) : (
              <div className="bg-black/40 px-6 py-3 border-l-4 border-white/20 clip-edge text-center opacity-50">
                <p className="text-[10px] text-white/40 uppercase tracking-[0.2em] font-bold">Awaiting Primary Run</p>
                <p className="text-xl font-display font-black text-white/20">-- --</p>
              </div>
            )}
          </div>

          <div className="mb-6 w-full max-w-[280px] bg-white/5 border border-white/10 p-4 clip-both relative group text-left">
            <div className="absolute top-0 left-0 w-2 h-2 bg-neon-blue"></div>
            <p className="text-[9px] text-neon-blue uppercase tracking-[0.2em] font-bold mb-2">MISSION BRIEFING</p>
            <ul className="text-[10px] text-white/70 space-y-1.5 font-display tracking-widest leading-relaxed">
              <li className="flex gap-2"><span className="text-neon-blue font-bold">01.</span> Neural matching via security gates.</li>
              <li className="flex gap-2"><span className="text-neon-blue font-bold">02.</span> Collect orbs for color shifts.</li>
              <li className="flex gap-2"><span className="text-neon-blue font-bold">03.</span> Extract USDC for real-world yield.</li>
            </ul>
          </div>

          <button
            onClick={() => walletAddress ? startGame() : connectWallet()}
            className={`clip-edge px-8 py-3 text-sm font-display font-black mb-6 transition-all hover:scale-[1.05] active:scale-95 shadow-[0_0_20px_rgba(34,197,94,0.3)] inset-ring ${
              walletAddress ? 'bg-neon-green text-black hover:bg-white' : 'bg-neon-blue text-white hover:bg-neon-blue/80 animate-pulse'
            }`}
          >
            {walletAddress ? '[ INITIATE EXTRACTION ]' : '[ LINK SYSTEM TO START ]'}
          </button>

          <div className="flex flex-col sm:flex-row gap-3 mb-6 pointer-events-auto w-full max-w-[280px] px-2">
            <button 
              onClick={() => walletAddress ? router.push('/leaderboard') : connectWallet()}
              className={`clip-edge-rev flex-1 py-3 text-[10px] font-bold uppercase tracking-[0.2em] transition-all shadow-[0_0_15px_rgba(0,240,255,0.1)] ${
                walletAddress ? 'bg-neon-dark border border-neon-blue/50 text-neon-blue hover:bg-neon-blue/10 cursor-pointer' : 'bg-black/80 border border-white/10 text-white/30 cursor-not-allowed'
              }`}
            >
              🏆 Ranking
            </button>
            <button 
              onClick={() => walletAddress ? router.push('/tasks') : connectWallet()}
              className={`clip-edge-rev flex-1 py-3 text-[10px] font-bold uppercase tracking-[0.2em] transition-all shadow-[0_0_15px_rgba(176,38,255,0.1)] ${
                walletAddress ? 'bg-neon-dark border border-neon-purple/50 text-neon-purple hover:bg-neon-purple/10 cursor-pointer' : 'bg-black/80 border border-white/10 text-white/30 cursor-not-allowed'
              }`}
            >
              ⚡ Bounties
            </button>
          </div>

          {!walletAddress ? (
            <button
              onClick={connectWallet}
              className="clip-both px-6 py-3 text-[10px] font-bold bg-neon-blue/10 border border-neon-blue text-neon-blue hover:bg-neon-blue hover:text-black transition-all active:scale-95 flex items-center justify-center gap-2 tracking-widest text-center"
            >
              CONNECT NEURAL LINK
            </button>
          ) : (
            <div className="flex items-center gap-3 bg-black/60 px-4 py-2 border-r-4 border-neon-blue mb-4">
              <Link href="/profile" className="text-[10px] font-bold text-neon-pink hover:text-white uppercase tracking-[0.2em] transition-colors border-r border-white/20 pr-3">
                PROFILE
              </Link>
              <div className="group relative flex flex-col items-center justify-center cursor-pointer">
                <p className="text-[10px] text-neon-blue font-mono group-hover:text-neon-pink transition-colors">
                  {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : 'UNKNOWN'}
                </p>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 hidden group-hover:flex items-center justify-center bg-black/90 w-full h-full">
                  <button onClick={disconnectWallet} className="text-[10px] font-bold text-neon-pink flex items-center gap-1">
                    DISCONNECT
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== PLAYING HUD ===== */}
      {gameState === 'playing' && (
        <div className="absolute top-0 inset-x-0 p-4 flex justify-between items-start pointer-events-none z-10">
          <div className="flex flex-col bg-black/40 px-4 py-1 border-l-2 border-neon-blue">
            <span className="text-[10px] text-neon-blue uppercase tracking-widest font-bold">Score</span>
            <span ref={uiScoreRef} className="text-2xl font-display text-white">0</span>
          </div>
          <div className="flex flex-col bg-black/40 px-4 py-1 border-r-2 border-yellow-500 text-right">
            <span className="text-[10px] text-yellow-500 uppercase tracking-widest font-bold">Acquired</span>
            <span ref={uiEarningsRef} className="text-2xl font-display text-white">$0.00</span>
          </div>
        </div>
      )}

      {/* ===== GAME OVER SCREEN ===== */}
      {gameState === 'gameover' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-neon-dark/95 backdrop-blur-md p-6 text-center pointer-events-auto border-t-4 border-neon-pink">
          <h2 className="text-3xl font-display font-black mb-1 animate-flicker text-neon-pink tracking-[0.1em] drop-shadow-[0_0_15px_rgba(255,0,60,0.8)]">SYSTEM</h2>
          <h3 className="text-lg font-display font-black mb-6 text-white tracking-[0.3em]">OVERLOAD</h3>
          
          <div className="grid grid-cols-2 gap-4 w-full max-w-sm mb-10">
            <div className="bg-black/40 p-3 border border-neon-blue/30 clip-edge relative overflow-hidden group text-center">
              <div className="absolute inset-0 bg-neon-blue/5 group-hover:bg-neon-blue/10 transition-colors"></div>
              <p className="text-[9px] text-neon-blue uppercase tracking-widest mb-1">Final Score</p>
              <p className="text-xl font-display font-bold text-white relative z-10">{displayScore}</p>
            </div>
            <div className="bg-black/40 p-3 border border-yellow-500/30 clip-edge-rev relative overflow-hidden group text-center">
              <div className="absolute inset-0 bg-yellow-500/5 group-hover:bg-yellow-500/10 transition-colors"></div>
              <p className="text-[9px] text-yellow-500 uppercase tracking-widest mb-1">USDC Extractions</p>
              <p className="text-xl font-display font-bold text-white relative z-10">${displaySessionEarnings.toFixed(2)}</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 w-full max-w-sm">
            <button
              onClick={startGame}
              className="clip-both py-3 text-base font-display font-bold bg-white text-black hover:bg-neon-blue hover:text-black transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:shadow-[0_0_30px_rgba(0,240,255,0.5)] mb-2"
            >
              [ REBOOT SEQUENCE ]
            </button>
            
            <div className="grid grid-cols-2 gap-2 pointer-events-auto mb-2">
               <button
                  onClick={() => walletAddress ? router.push('/profile') : connectWallet()}
                  className="clip-edge py-3 text-xs tracking-widest font-bold bg-neon-dark border border-neon-blue/50 text-neon-blue hover:bg-neon-blue/20 transition-all shadow-[0_0_10px_rgba(0,240,255,0.1)] hover:shadow-[0_0_15px_rgba(0,240,255,0.4)]"
                >
                PROFILE
               </button>
               <button
                  onClick={() => walletAddress ? router.push('/leaderboard') : connectWallet()}
                  className="clip-edge-rev py-3 text-xs tracking-widest font-bold bg-neon-dark border border-white/20 text-white/70 hover:bg-white/10 hover:text-white transition-all"
                >
                RANKINGS
               </button>
            </div>
            <button
                onClick={() => walletAddress ? router.push('/tasks') : connectWallet()}
                className="clip-both w-full py-3 text-[10px] font-bold bg-neon-purple/20 border border-neon-purple text-neon-purple hover:bg-neon-purple hover:text-white transition-all tracking-[0.2em] shadow-[0_0_15px_rgba(176,38,255,0.2)] hover:shadow-[0_0_25px_rgba(176,38,255,0.6)] pointer-events-auto"
              >
                ACCESS BOUNTIES
            </button>

            {!walletAddress && (
              <button
                onClick={connectWallet}
                className="w-full mt-4 py-3 text-[10px] uppercase font-bold border border-neon-blue text-neon-blue hover:bg-neon-blue/20 transition-all tracking-widest opacity-50 hover:opacity-100"
              >
                CONNECT WALLET
              </button>
            )}

            <button
               onClick={() => setGameState('menu')}
               className="text-gray-500 text-sm mt-4 hover:text-gray-300 transition-colors underline"
            >
              Back to Menu
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
