import { generateJwk, generateKey } from '@interledger/http-signature-utils'
import { mockAccounts } from './accounts.server'
import { createWalletAddressKey, createWalletAddress } from './requesters'
import { getOpenPaymentsUrl } from './utils'

export type CreateWalletParams = {
  path: string
  name: string
  assetId: string
  accountId: string
}

export async function createWallet({
  name,
  path,
  assetId,
  accountId
}: CreateWalletParams): Promise<void> {
  const walletAddress = await createWalletAddress(
    name,
    `${getOpenPaymentsUrl()}/${path}`,
    assetId
  )

  await mockAccounts.setWalletAddress(
    accountId,
    walletAddress.id,
    walletAddress.address
  )

  await createWalletAddressKey({
    walletAddressId: walletAddress.id,
    jwk: generateJwk({
      keyId: `keyid-${accountId}`,
      privateKey: generateKey()
    }) as unknown as string
  })
}
