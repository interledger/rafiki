export interface IlpBalance {
  balance: bigint
  // Remaining credit line available from the super-account
  availableCredit: bigint
  // Total (un-utilized) credit lines extended to all sub-accounts
  creditExtended: bigint
  // Outstanding amount borrowed from the super-account
  totalBorrowed: bigint
  // Total amount lent, or amount owed to this account across all its sub-accounts
  totalLent: bigint
}
