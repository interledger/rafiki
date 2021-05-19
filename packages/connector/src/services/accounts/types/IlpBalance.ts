// interface IlpBalanceChildren {
//   availableCredit: bigint
//   totalLent: bigint
// }

interface IlpBalanceParent {
  availableCreditLine: bigint
  totalBorrowed: bigint
}

export interface IlpBalance {
  id: string
  balance: bigint
  // children: IlpBalanceChildren
  parent: IlpBalanceParent
}
