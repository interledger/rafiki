import { AccountProvider, setupFromSeed } from 'mock-account-servicing-lib'
import { createApolloClient } from './apolloClient'
import { TestConfig } from './config'
import { ApolloClient, NormalizedCacheObject } from '@apollo/client'

export class MockASE {
  private config: TestConfig
  private apolloClient: ApolloClient<NormalizedCacheObject>
  public accounts: AccountProvider
  // private opClient: AuthenticatedClient

  // Use .create factory because async construction
  public static async create(config: TestConfig) {
    const mase = new MockASE(config)
    await mase.initAsync()
    return mase
  }

  // Private to ensure it doesnt get called directly.
  // Use static MockASE.create instead.
  private constructor(config: TestConfig) {
    this.config = config
    this.apolloClient = createApolloClient(config.graphqlUrl)
    this.accounts = new AccountProvider()
  }

  private async initAsync() {
    await setupFromSeed(this.config, this.apolloClient, this.accounts)

    // this.opClient = await createAuthenticatedClient({
    //   privateKey: this.config.clientPrivateKey,
    //   keyId: this.config.clientKeyId,
    //   walletAddressUrl: this.config.clientWalletAddress
    // })
  }
}
