import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ethers } from 'ethers'
import { execSync } from 'child_process'

const XLAYER_RPC = 'https://rpc.xlayer.tech'
const USDC_ADDRESS = '0x74b7f16337b8972027f6196a17a631ac6de26d22'
const USDC_ABI = ['function balanceOf(address owner) view returns (uint256)', 'function decimals() view returns (uint8)']

export async function POST(req: NextRequest) {
  try {
    const { taskId, walletAddress } = await req.json()

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
        const cmd = `onchainos portfolio all-balances --address ${walletAddress} --chains "196"`
        const rawOutput = execSync(cmd).toString()
        
        // Extract JSON specifically
        const jsonMatch = rawOutput.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error('No valid response from verification engine')
        const result = JSON.parse(jsonMatch[0])
        
        if (result.ok && result.data) {
          let totalUsd = 0
          // Handle both array and single object responses
          const data = result.data
          const chainResults = Array.isArray(data) ? data : (data.tokenAssets ? [data] : [])
          
          chainResults.forEach((chain: any) => {
            if (chain.tokenAssets) {
              chain.tokenAssets.forEach((asset: any) => {
                const price = parseFloat(asset.tokenPrice || "0")
                const balance = parseFloat(asset.balance || "0")
                if (price > 0 && balance > 0) {
                  totalUsd += price * balance
                  console.log(`[Verify] Token ${asset.symbol}: ${balance} @ $${price} = $${(price * balance).toFixed(2)}`)
                }
              })
            }
          })
          
          userBalanceMsg = `Neural scan complete. Your X Layer holdings: $${totalUsd.toFixed(2)} USD.`
          if (totalUsd >= (task.targetValue || 1.0)) {
            isQualified = true
          }
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
