const LIQUIDITY_ID_PREFIX = '6c69717569646974793a' // 'liquidity:'
const SETTLEMENT_ID_PREFIX = '736574746c653a' // 'settle:'

const REAL_ID_CODE = '7265616c3a' // 'real:'
const CREDIT_ID_CODE = '637265643a' // 'cred:'
const LOAN_ID_CODE = '6c6f616e3a' // 'loan:'

export function toLiquidityId(assetCode: string, assetScale: number): bigint {
  const assetCodeHex = Buffer.from(assetCode).toString('hex')
  return BigInt(
    `0x${LIQUIDITY_ID_PREFIX}${assetCodeHex}${assetScale.toString(16)}`
  )
}

export function toSettlementId(assetCode: string, assetScale: number): bigint {
  const assetCodeHex = Buffer.from(assetCode).toString('hex')
  return BigInt(
    `0x${SETTLEMENT_ID_PREFIX}${REAL_ID_CODE}${assetCodeHex}${assetScale.toString(
      16
    )}`
  )
}

export function toSettlementCreditId(
  assetCode: string,
  assetScale: number
): bigint {
  const assetCodeHex = Buffer.from(assetCode).toString('hex')
  return BigInt(
    `0x${SETTLEMENT_ID_PREFIX}${CREDIT_ID_CODE}${assetCodeHex}${assetScale.toString(
      16
    )}`
  )
}

export function toSettlementLoanId(
  assetCode: string,
  assetScale: number
): bigint {
  const assetCodeHex = Buffer.from(assetCode).toString('hex')
  return BigInt(
    `0x${SETTLEMENT_ID_PREFIX}${LOAN_ID_CODE}${assetCodeHex}${assetScale.toString(
      16
    )}`
  )
}

export function uuidToBigInt(id: string): bigint {
  return BigInt(`0x${id.replace(/-/g, '')}`)
}
