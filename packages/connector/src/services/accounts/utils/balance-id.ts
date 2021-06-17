import * as crypto from 'crypto'
import { v4 as uuid } from 'uuid'

const LIQUIDITY_ID_PREFIX = 'liquidity:'
const SETTLEMENT_ID_PREFIX = 'settlement:'

// const REAL_ID_CODE = 'real:'
// const CREDIT_ID_CODE = 'credit:'
// const LOAN_ID_CODE = 'loan:'

function toBalanceId({
  prefix,
  assetCode,
  assetScale,
  hmacSecret
}: {
  prefix: string
  assetCode: string
  assetScale: number
  hmacSecret: string
}): bigint {
  const h = crypto.createHmac('sha256', hmacSecret)
  h.update(`${prefix}${assetCode}:${assetScale}`)
  return BigInt('0x' + h.digest('hex').slice(32))
}

export function toLiquidityId({
  assetCode,
  assetScale,
  hmacSecret
}: {
  assetCode: string
  assetScale: number
  hmacSecret: string
}): bigint {
  return toBalanceId({
    prefix: LIQUIDITY_ID_PREFIX,
    assetCode,
    assetScale,
    hmacSecret
  })
}

export function toSettlementId({
  assetCode,
  assetScale,
  hmacSecret
}: {
  assetCode: string
  assetScale: number
  hmacSecret: string
}): bigint {
  return toBalanceId({
    prefix: SETTLEMENT_ID_PREFIX,
    assetCode,
    assetScale,
    hmacSecret
  })
}

// export function toSettlementCreditId(
//   assetCode: string,
//   assetScale: number
// ): bigint {
//   const assetCodeHex = Buffer.from(assetCode).toString('hex')
//   return BigInt(
//     `0x${SETTLEMENT_ID_PREFIX}${CREDIT_ID_CODE}${assetCodeHex}${assetScale.toString(
//       16
//     )}`
//   )
// }

// export function toSettlementLoanId(
//   assetCode: string,
//   assetScale: number
// ): bigint {
//   const assetCodeHex = Buffer.from(assetCode).toString('hex')
//   return BigInt(
//     `0x${SETTLEMENT_ID_PREFIX}${LOAN_ID_CODE}${assetCodeHex}${assetScale.toString(
//       16
//     )}`
//   )
// }

export function uuidToBigInt(id: string): bigint {
  return BigInt(`0x${id.replace(/-/g, '')}`)
}

export function randomId(): bigint {
  return uuidToBigInt(uuid())
}
