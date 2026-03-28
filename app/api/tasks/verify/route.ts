import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ethers } from 'ethers'
import { execSync } from 'child_process'

export const dynamic = 'force-dynamic'

const XLAYER_RPC = 'https://rpc.xlayer.tech'
const USDC_ADDRESS = '0x74b7f16337b8972027f6196a17a631ac6de26d22'
const USDC_ABI = ['function balanceOf(address owner) view returns (uint256)', 'function decimals() view returns (uint8)']

export async function POST(req: NextRequest) {
  try {
    const { taskId, walletAddress: rawAddress } = await req.json()
    const walletAddress = rawAddress.toLowerCase()

    if (!taskId || !walletAddress) {
      return NextResponse.json({ error: 'Missing taskId or walletAddress' }, { status: 400 })
    }

    const task = await prisma.task.findUnique({ where: { id: taskId } })
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    // Check if already completed
    const existing = await prisma.taskCompletion.findFirst({
      where: { taskId, player: { walletAddress } }
    })
    if (existing) return NextResponse.json({ error: 'Task already completed' }, { status: 400 })

    const provider = new ethers.JsonRpcProvider(XLAYER_RPC)
    let isQualified = false
    let calculatedReward = task.reward
    let userBalanceMsg = ""

    if (task.type === 'HOLD_X_LAYER_ANY') {
      try {
        // Use Onchain OS skill to get real-time balances and prices
        // Use Onchain OS skill - Public portfolio query for the user's address
        // Use direct OKX Wallet API to avoid CLI dependency
        // Direct Blockchain Verification (Deterministic & Reliable)
        const provider = new ethers.JsonRpcProvider(XLAYER_RPC)
        
        // 1. Fetch Real-time OKB Price
        let okbPrice = 70.0
        try {
          const tickerRes = await fetch('https://www.okx.com/api/v5/market/ticker?instId=OKB-USDT')
          const tickerData = await tickerRes.json()
          if (tickerData.code === '0' && tickerData.data && tickerData.data[0]) {
            okbPrice = parseFloat(tickerData.data[0].last)
            console.log(`[Verify API] Live OKB Price: $${okbPrice}`)
          }
        } catch (tickerErr) {
          console.error('[Verify API] Price fetch failed, using fallback:', tickerErr)
        }
        
        // 2. Check Native OKB on X Layer
        const okbBalance = await provider.getBalance(walletAddress)
        const okbVal = parseFloat(ethers.formatEther(okbBalance))
        const okbUsd = okbVal * okbPrice
        
        // 3. Check USDC Token on X Layer
        const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider)
        const usdcBalance = await usdcContract.balanceOf(walletAddress)
        const usdcDecimals = await usdcContract.decimals()
        const usdcVal = parseFloat(ethers.formatUnits(usdcBalance, usdcDecimals))
        
        const totalUsd = okbUsd + usdcVal
        console.log(`[Verify API] User ${walletAddress} verified on-chain: $${totalUsd.toFixed(2)} ($${okbUsd.toFixed(2)} OKB Run + $${usdcVal.toFixed(2)} USDC)`)
        
        userBalanceMsg = `Neural scan complete. Your X Layer holdings: ~$${totalUsd.toFixed(2)} USD (OKB Price: $${okbPrice.toFixed(2)}).`
        if (totalUsd >= (task.targetValue || 1.0)) {
          isQualified = true
        }
      } catch (err: any) {
        console.error('Verification Engine Error:', err.message)
        return NextResponse.json({ error: `Verification System Sync Error. Please retry in 60s.` }, { status: 500 })
      }
    } else if (task.type === 'FOLLOW_TWITTER' || task.type === 'SWAP_XDOG' || task.type === 'SWAP_OKB') {
      isQualified = true
    }

    if (!isQualified) {
      const errorMsg = task.type === 'HOLD_X_LAYER_ANY' 
        ? `Verification failed. ${userBalanceMsg} Minimum $1.00 required. Bridge assets to X Layer!`
        : 'Verification failed. Qualification criteria not met.'
      return NextResponse.json({ error: errorMsg }, { status: 403 })
    }

    // Success - Update DB
    await prisma.$transaction(async (tx: any) => {
      // Ensure player exists
      const player = await tx.player.upsert({
        where: { walletAddress },
        update: {},
        create: { walletAddress, pendingBalance: 0, totalEarned: 0 }
      })

      await tx.taskCompletion.create({
        data: {
          taskId: task.id,
          playerId: player.id
        }
      })

      await tx.player.update({
        where: { id: player.id },
        data: {
          pendingBalance: { increment: task.reward },
          totalEarned: { increment: task.reward }
        }
      })
    })

    return NextResponse.json({ success: true, reward: task.reward })
  } catch (error: any) {
    console.error('Verification error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
