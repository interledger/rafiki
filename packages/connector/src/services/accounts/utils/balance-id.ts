const LIQUIDITY_ID_PREFIX = '6c69717569646974793a' // 'liquidity:'
const SETTLEMENT_ID_PREFIX = '736574746c656d656e743a' // 'settlement:'

export function toLiquidityId(assetCode: string, assetScale: number): bigint {
  const assetCodeHex = Buffer.from(assetCode).toString('hex')
  return BigInt(`0x${LIQUIDITY_ID_PREFIX}${assetCodeHex}${assetScale}`)
}

export function toSettlementId(assetCode: string, assetScale: number): bigint {
  const assetCodeHex = Buffer.from(assetCode).toString('hex')
  return BigInt(`0x${SETTLEMENT_ID_PREFIX}${assetCodeHex}${assetScale}`)
}

export function uuidToBigInt(id: string): bigint {
  return BigInt(`0x${id.replace(/-/g, '')}`)
}
