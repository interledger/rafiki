export class TokenBucket {
  private _lastTime: number
  private _left: bigint
  private _capacity: bigint
  private _refillRate: number

  constructor({
    refillPeriod,
    refillCount,
    capacity
  }: {
    refillPeriod: number
    refillCount: bigint
    capacity?: bigint
  }) {
    this._lastTime = Date.now()
    this._capacity = typeof capacity !== 'undefined' ? capacity : refillCount
    this._left = this._capacity
    this._refillRate = Number(refillCount) / refillPeriod
  }

  take(count = 1n): boolean {
    const now = Date.now()
    const delta = Math.max(now - this._lastTime, 0)
    const refillAmount = Math.floor(delta * this._refillRate)

    this._lastTime = now
    this._left =
      this._left + BigInt(refillAmount) < this._capacity
        ? this._left + BigInt(refillAmount)
        : this._capacity

    if (this._left < count) {
      return false
    }

    this._left -= count
    return true
  }
}
