import Knex from 'knex'
import { createClient } from 'tigerbeetle-node'
import { v4 as uuid } from 'uuid'

import { AccountsService } from '../accounts/service'
import { createAssetService } from '../asset/service'
import { BalanceService, createBalanceService } from '../balance/service'
import { createCreditService, CreditService } from '../credit/service'
import { createDepositService, DepositService } from '../deposit/service'
import { createTransferService, TransferService } from '../transfer/service'
import {
  createWithdrawalService,
  WithdrawalService
} from '../withdrawal/service'
import { Config } from '../config'
import { Logger } from '../logger/service'
import { createKnex } from '../Knex/service'

export interface TestServices {
  accountsService: AccountsService
  balanceService: BalanceService
  creditService: CreditService
  depositService: DepositService
  transferService: TransferService
  withdrawalService: WithdrawalService
  config: typeof Config
  knex: Knex
  shutdown: () => Promise<void>
}

export const createTestServices = async (): Promise<TestServices> => {
  const config = Config
  config.ilpAddress = 'test.rafiki'
  config.peerAddresses = [
    {
      accountId: uuid(),
      ilpAddress: 'test.alice'
    }
  ]

  const tbClient = createClient({
    cluster_id: config.tigerbeetleClusterId,
    replica_addresses: config.tigerbeetleReplicaAddresses
  })

  const knex = await createKnex(config.postgresUrl)
  const balanceService = createBalanceService({ tbClient, logger: Logger })
  const assetService = createAssetService({ balanceService, logger: Logger })
  const accountsService = new AccountsService(
    assetService,
    balanceService,
    config,
    Logger
  )
  const creditService = createCreditService({ balanceService, logger: Logger })
  const depositService = createDepositService({
    assetService,
    balanceService,
    logger: Logger
  })
  const transferService = createTransferService({
    balanceService,
    logger: Logger
  })
  const withdrawalService = createWithdrawalService({
    assetService,
    balanceService,
    logger: Logger
  })

  return {
    accountsService,
    balanceService,
    creditService,
    depositService,
    transferService,
    withdrawalService,
    config,
    knex,
    shutdown: async () => {
      await knex.destroy()
      tbClient.destroy()
    }
  }
}
