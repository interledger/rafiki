import { BalanceIds } from '../types'

const LIQUIDITY_ID_PREFIX = '6c69717569646974793a' // 'liquidity:'
const SETTLEMENT_ID_PREFIX = '736574746c656d656e743a' // 'settlement:'

const REAL_ID_CODE = '' // 'real:'
const DEBT_ID_CODE = '' // 'debt:'
const TRUSTLINE_ID_CODE = '' // 'trust:'

export function toLiquidityIds(
  assetCode: string,
  assetScale: number
): BalanceIds {
  const assetCodeHex = Buffer.from(assetCode).toString('hex')
  return {
    id: BigInt(
      `0x${LIQUIDITY_ID_PREFIX}${REAL_ID_CODE}${assetCodeHex}${assetScale}`
    ),
    debtId: BigInt(
      `0x${LIQUIDITY_ID_PREFIX}${DEBT_ID_CODE}${assetCodeHex}${assetScale}`
    ),
    trustlineId: BigInt(
      `0x${LIQUIDITY_ID_PREFIX}${TRUSTLINE_ID_CODE}${assetCodeHex}${assetScale}`
    )
  }
}

export function toSettlementIds(
  assetCode: string,
  assetScale: number
): BalanceIds {
  const assetCodeHex = Buffer.from(assetCode).toString('hex')
  return {
    id: BigInt(
      `0x${SETTLEMENT_ID_PREFIX}${REAL_ID_CODE}${assetCodeHex}${assetScale}`
    ),
    debtId: BigInt(
      `0x${SETTLEMENT_ID_PREFIX}${DEBT_ID_CODE}${assetCodeHex}${assetScale}`
    ),
    trustlineId: BigInt(
      `0x${SETTLEMENT_ID_PREFIX}${TRUSTLINE_ID_CODE}${assetCodeHex}${assetScale}`
    )
  }
}

export function uuidToBigInt(id: string): bigint {
  return BigInt(`0x${id.replace(/-/g, '')}`)
}
