import { LiquidityAccountType } from '../../service'
import {
  LedgerAccountType,
  mapLiquidityAccountTypeToLedgerAccountType
} from './model'

describe('Ledger Account Model', (): void => {
  describe('mapLiquidityAccountTypeToLedgerAccountType', (): void => {
    test.each`
      liquidityAccountType                     | ledgerAccountType
      ${LiquidityAccountType.ASSET}            | ${LedgerAccountType.LIQUIDITY_ASSET}
      ${LiquidityAccountType.INCOMING}         | ${LedgerAccountType.LIQUIDITY_INCOMING}
      ${LiquidityAccountType.OUTGOING}         | ${LedgerAccountType.LIQUIDITY_OUTGOING}
      ${LiquidityAccountType.PEER}             | ${LedgerAccountType.LIQUIDITY_PEER}
      ${LiquidityAccountType.WEB_MONETIZATION} | ${LedgerAccountType.LIQUIDITY_WEB_MONETIZATION}
    `(
      'properly maps $liquidityAccountType to $ledgerAccountType',
      async ({ liquidityAccountType, ledgerAccountType }): Promise<void> => {
        expect(
          mapLiquidityAccountTypeToLedgerAccountType[
            liquidityAccountType as LiquidityAccountType
          ]
        ).toEqual(ledgerAccountType)
      }
    )
  })
})
