import { exec } from 'child_process'
import { promisify } from 'util'
import { USDC_ADDRESS } from './constants'

const execAsync = promisify(exec)

// TEE Wallet Address (Account: 81bf4c60-4ecb-47d5-a768-cd78e7ea7788)
export const AGENT_WALLET_ADDRESS = '0xf33ee27249dd9f870c5fe318064065e1ffe218f9'

export async function sendUSDC(toAddress: string, amount: number) {
  // Convert amount to minimal units (6 decimals for USDC)
  const amountInUnits = Math.floor(amount * 1_000_000).toString()
  
  console.log(`[sendUSDC] Sending ${amount} USDC to ${toAddress} via TEE wallet...`)
  
  // Use onchainos wallet send with contract-token for USDC
  const { stdout, stderr } = await execAsync(
    `onchainos wallet send --chain 196 --receipt "${toAddress}" --amt "${amountInUnits}" --contract-token "${USDC_ADDRESS}"`
  )
  
  if (stderr) {
    throw new Error(`onchainos send failed: ${stderr}`)
  }
  
  const result = JSON.parse(stdout)
  if (!result.ok) {
    throw new Error(`Send failed: ${result.error}`)
  }
  
  return { 
    txHash: result.data.txHash, 
    from: AGENT_WALLET_ADDRESS, 
    to: toAddress, 
    amount 
  }
}

export async function getAgentBalance(): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `onchainos wallet balance --chain 196 --token-address "${USDC_ADDRESS}"`
    )
    const result = JSON.parse(stdout)
    
    if (result.ok && result.data?.tokenAssets?.length > 0) {
      const usdcAsset = result.data.tokenAssets.find(
        (asset: any) => asset.tokenAddress?.toLowerCase() === USDC_ADDRESS.toLowerCase()
      )
      return usdcAsset ? parseFloat(usdcAsset.balance) : 0
    }
    return 0
  } catch (err) {
    console.error('getAgentBalance error:', err)
    return 0
  }
}
