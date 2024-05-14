export const timeoutTwoPhase = BigInt(
  process.env.WITHDRAWAL_TIMEOUT_SECONDS || 0 /*2-phase disabled*/
)
