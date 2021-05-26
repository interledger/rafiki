export type Transfer = {
  // this can't used for tigerbeetle transfer id if cross currency
  transferId: string

  sourceAccountId: string
  destinationAccountId: string

  sourceAmount?: bigint
  destinationAmount?: bigint
} & (
  | {
      sourceAmount: bigint
    }
  | {
      destinationAmount: bigint
    }
)
