import { AccountProvider } from 'mock-account-service-lib'
import { v4 as uuid } from 'uuid'

export type AccountWithAsset = {
  path: string
  name: string
  assetId: string
  assetCode: string
  assetScale: number
}

export type AccountWithBalance = {
  id: string
  path: string
  name: string
  balance: string
  assetId: string
  assetCode: string
  assetScale: number
}

export const mockAccounts = new AccountProvider()

export async function createAccount({
  path,
  name,
  assetId,
  assetCode,
  assetScale
}: AccountWithAsset): Promise<string | undefined> {
  const id = uuid()

  try {
    await mockAccounts.create(id, path, name, assetCode, assetScale, assetId)

    return id
  } catch (err) {
    console.log(err)
    return
  }
}

export async function updateAccount({
  id,
  name
}: {
  id: string
  name: string
}): Promise<string | undefined> {
  try {
    await mockAccounts.set(id, name)

    return id
  } catch (err) {
    console.log(err)
    return
  }
}

export async function getAccountWithBalance(
  id: string
): Promise<AccountWithBalance | undefined> {
  try {
    const account = await mockAccounts.get(id)
    if (!account) {
      return
    }
    return {
      id: account.id,
      name: account.name,
      path: account.path,
      assetId: account.assetId,
      assetScale: account.assetScale,
      assetCode: account.assetCode,
      balance: (
        BigInt(account.creditsPosted) - BigInt(account.debitsPosted)
      ).toString()
    }
  } catch (err) {
    console.log(err)
    return
  }
}

export async function addLiquidity({
  id,
  amount
}: {
  id: string
  amount: number
}): Promise<string | undefined> {
  try {
    const bigAmount = BigInt((Number(amount) * 100).toFixed(0))
    await mockAccounts.credit(id, bigAmount, false)

    return id
  } catch (err) {
    console.log(err)
    return
  }
}
