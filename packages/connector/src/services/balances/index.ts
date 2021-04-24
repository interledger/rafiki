export interface CreateBalanceOptions {
  id: string

  // assetCode: string
  // assetScale: number

  max?: bigint
  min?: bigint
}

export interface Balance extends CreateBalanceOptions {
  current: bigint
}

export interface Transfer {
  id: string

  sourceBalanceId: string
  destinationBalanceId: string

  amount: bigint
}

const tempBalances = {}

// does appContainer need to be passed in to access tigerbeetleClient?
export async function createBalance(
  balance: CreateBalanceOptions
): Promise<Balance> {
  // await tigerbeetleClient.createAccounts([{
  //   id: Buffer.from(balance.id),
  //   debit_accepted: BigInt(0),
  //   debit_reserved: BigInt(0),
  //   credit_accepted: BigInt(0),
  //   credit_reserved: BigInt(0),
  //   limit_net_debit: balance.min,
  //   limit_net_credit: balance.max
  // }])
  tempBalances[balance.id] = {
    current: BigInt(0),
    max: balance.max,
    min: balance.min
  }
  return {
    ...balance,
    current: BigInt(0)
  }
}

export async function getBalance(balanceId: string): Promise<Balance> {
  // const balance = await tigerbeetleClient.lookupAccounts([{
  //   id: Buffer.from(balance.id)
  // }])[0]
  // return {
  //   id: balance.id.toString(),
  //   max: balance.max,
  //   min: balance.min,
  //   current: balance.credit_accepted - (balance.debit_accepted + balance.debit_reserved)
  // }

  return tempBalances[balanceId]
}

// should this be updateMin and updateMax?
// export async function updateBalance(balance: Balance): Promise<Balance> {
// }

export async function createTransfer(transfer: Transfer): Promise<Transfer> {
  // TODO: batch me
  // await tigerbeetleClient.createTransfers([{
  //   id: Buffer.from(balance.id),
  //   flags: {
  //     accept: true,
  //     autoCommit: true
  //   },
  //   debitAccountId: Buffer.from(transfer.sourceBalanceId),
  //   creditAccountId: Buffer.from(transfer.destinationBalanceId),
  //   amount: transfer.amount
  // }])

  tempBalances[transfer.sourceBalanceId].current -= transfer.amount
  tempBalances[transfer.destinationBalanceId].current += transfer.amount
  return transfer
}
