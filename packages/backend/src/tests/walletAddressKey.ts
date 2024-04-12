import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../app'
import { WalletAddressKey } from '../open_payments/wallet_address/key/model'
import { CreateOptions } from '../open_payments/wallet_address/key/service'
import { v4 as uuidv4 } from 'uuid'
import { generateJwk, generateKey } from '@interledger/http-signature-utils'
export async function createWalletAddressKey(
  deps: IocContract<AppServices>,
  walletAddressId: string
): Promise<WalletAddressKey> {
  const walletAddressKeyService = await deps.use('walletAddressKeyService')

  const options: CreateOptions = {
    walletAddressId,
    jwk: generateJwk({
      privateKey: generateKey(),
      keyId: uuidv4()
    })
  }

  return walletAddressKeyService.create(options)
}
