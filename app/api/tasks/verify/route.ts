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
        const OKX_API_KEY = '28c9786b-053b-48df-959f-0d6beacc1d0a'
        const OKX_SECRET_KEY = '8AE96E275EE85DD891AF588E59F822AD'
        const OKX_PASSPHRASE = '$Skippy2000'

        const url = `https://www.okx.com/api/v1/wallet/token/token-assets-v2?address=${walletAddress}&chainIndex=196`
        const timestamp = new Date().toISOString()
        const method = 'GET'
        const path = `/api/v1/wallet/token/token-assets-v2?address=${walletAddress}&chainIndex=196`
        const signStr = `${timestamp}${method}${path}`
        
        const crypto = require('crypto')
        const signature = crypto.createHmac('sha256', OKX_SECRET_KEY).update(signStr).digest('base64')

        const res = await fetch(url, {
          method: 'GET',
          headers: {
            'OK-ACCESS-KEY': OKX_API_KEY,
            'OK-ACCESS-SIGN': signature,
            'OK-ACCESS-PASSPHRASE': OKX_PASSPHRASE,
            'OK-ACCESS-TIMESTAMP': timestamp,
            'Content-Type': 'application/json'
          }
        })

        const result = await res.json()
        
        if (result.code === '0' && result.data && result.data[0]) {
          const totalUsd = parseFloat(result.data[0].totalValue || "0")
          console.log(`[Verify API] User ${walletAddress} portfolio total: $${totalUsd}`)
          
          userBalanceMsg = `Neural scan complete. Your X Layer holdings: $${totalUsd.toFixed(2)} USD.`
          if (totalUsd >= (task.targetValue || 1.0)) {
            isQualified = true
          }
        } else {
          console.error('[Verify API] OKX API Error:', result)
          throw new Error('Verification Engine unreachable')
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
