import Long from 'long'
import { createHash, createHmac } from 'crypto'

const HASH_ALGORITHM = 'sha256'
const ENCRYPTION_KEY_STRING = Buffer.from('ilp_stream_encryption', 'utf8')
const FULFILLMENT_GENERATION_STRING = Buffer.from('ilp_stream_fulfillment', 'utf8')

export const sha256 = (preimage: Buffer): Buffer =>
  createHash(HASH_ALGORITHM).update(preimage).digest()

export const hmac = (key: Buffer, message: Buffer): Buffer =>
  createHmac(HASH_ALGORITHM, key).update(message).digest()

export const generateEncryptionKey = (sharedSecret: Buffer): Buffer =>
  hmac(sharedSecret, ENCRYPTION_KEY_STRING)

export const generateFulfillmentKey = (sharedSecret: Buffer): Buffer =>
  hmac(sharedSecret, FULFILLMENT_GENERATION_STRING)

const SHIFT_32 = BigInt(4294967296)

/**
 * Return a rejected Promise if the given Promise does not resolve within the timeout,
 * or return the resolved value of the Promise
 */
export const timeout = <T>(duration: number, promise: Promise<T>): Promise<T> => {
  let timer: NodeJS.Timeout
  return Promise.race([
    new Promise<T>((_, reject) => {
      timer = setTimeout(reject, duration)
    }),
    promise.finally(() => clearTimeout(timer)),
  ])
}

/** Wait and resolve after the given number of milliseconds */
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Integer greater than or equal to 0 */
export class Int {
  readonly value: bigint

  static ZERO = new Int(BigInt(0))
  static ONE = new Int(BigInt(1)) as PositiveInt
  static TWO = new Int(BigInt(2)) as PositiveInt
  static MAX_U64 = new Int(BigInt('18446744073709551615')) as PositiveInt

  private constructor(n: bigint) {
    this.value = n
  }

  static from<T extends Int>(n: T): T
  static from(n: Long): Int
  static from(n: NonNegativeInteger): Int
  static from(n: number): Int | undefined
  static from(n: bigint): Int | undefined
  static from(n: string): Int | undefined
  static from(n: Int | bigint | number | string): Int | undefined // Necessary for amounts passed during setup
  static from<T extends Long | Int | bigint | number | string>(n: T): Int | undefined {
    if (n instanceof Int) {
      return new Int(n.value)
    } else if (typeof n === 'bigint') {
      return Int.fromBigint(n)
    } else if (typeof n === 'string') {
      return Int.fromString(n)
    } else if (typeof n === 'number') {
      return Int.fromNumber(n)
    } else if (Long.isLong(n)) {
      return Int.fromLong(n)
    }
  }

  private static fromBigint(n: bigint): Int | undefined {
    if (n >= 0) {
      return new Int(n)
    }
  }

  private static fromString(n: string): Int | undefined {
    try {
      return Int.fromBigint(BigInt(n))
      // eslint-disable-next-line no-empty
    } catch (_) {}
  }

  private static fromNumber(n: NonNegativeInteger): Int
  private static fromNumber(n: number): Int | undefined
  private static fromNumber<T extends number>(n: T): Int | undefined {
    if (isNonNegativeInteger(n)) {
      return new Int(BigInt(n))
    }
  }

  private static fromLong(n: Long): Int {
    const lsb = BigInt(n.getLowBitsUnsigned())
    const gsb = BigInt(n.getHighBitsUnsigned())
    return new Int(lsb + SHIFT_32 * gsb)
  }

  add(n: PositiveInt): PositiveInt
  add(n: Int): Int
  add<T extends Int>(n: T): Int {
    return new Int(this.value + n.value)
  }

  saturatingSubtract(n: Int): Int {
    return this.value >= n.value ? new Int(this.value - n.value) : Int.ZERO
  }

  multiply(n: Int): Int {
    return new Int(this.value * n.value)
  }

  multiplyFloor(r: Ratio): Int {
    return new Int((this.value * r.a.value) / r.b.value)
  }

  multiplyCeil(r: Ratio): Int {
    return this.multiply(r.a).divideCeil(r.b)
  }

  divide(d: PositiveInt): Int {
    return new Int(this.value / d.value)
  }

  divideCeil(d: PositiveInt): Int {
    // Simple algorithm with no modulo/conditional: https://medium.com/@arunistime/how-div-round-up-works-179f1a2113b5
    return new Int((this.value + d.value - BigInt(1)) / d.value)
  }

  modulo(n: PositiveInt): Int {
    return new Int(this.value % n.value)
  }

  isEqualTo(n: Int): boolean {
    return this.value === n.value
  }

  isGreaterThan(n: Int): this is PositiveInt {
    return this.value > n.value
  }

  isGreaterThanOrEqualTo(n: PositiveInt): this is PositiveInt
  isGreaterThanOrEqualTo(n: Int): boolean
  isGreaterThanOrEqualTo<T extends Int>(n: T): boolean {
    return this.value >= n.value
  }

  isLessThan(n: Int): boolean {
    return this.value < n.value
  }

  isLessThanOrEqualTo(n: Int): boolean {
    return this.value <= n.value
  }

  isPositive(): this is PositiveInt {
    return this.value > 0
  }

  orLesser(n?: Int): Int {
    return !n ? this : this.value <= n.value ? this : n
  }

  orGreater(n: PositiveInt): PositiveInt
  orGreater(n?: Int): Int
  orGreater<T extends Int>(n: T): Int {
    return !n ? this : this.value >= n.value ? this : n
  }

  toString(): string {
    return this.value.toString()
  }

  toLong(): Long | undefined {
    if (this.isGreaterThan(Int.MAX_U64)) {
      return
    }

    const lsb = BigInt.asUintN(32, this.value)
    const gsb = (this.value - lsb) / SHIFT_32
    return new Long(Number(lsb), Number(gsb), true)
  }

  valueOf(): number {
    return Number(this.value)
  }

  toRatio(): Ratio {
    return Ratio.of(this, Int.ONE)
  }
}

/** Integer greater than 0 */
export interface PositiveInt extends Int {
  add(n: Int): PositiveInt
  multiply(n: PositiveInt): PositiveInt
  multiply(n: Int): Int
  multiplyCeil(r: PositiveRatio): PositiveInt
  multiplyCeil(r: Ratio): Int
  divideCeil(n: PositiveInt): PositiveInt
  isEqualTo(n: Int): n is PositiveInt
  isLessThan(n: Int): n is PositiveInt
  isLessThanOrEqualTo(n: Int): n is PositiveInt
  isPositive(): true
  orLesser(n?: PositiveInt): PositiveInt
  orLesser(n: Int): Int
  orGreater(n?: Int): PositiveInt
  toRatio(): PositiveRatio
}

declare class Tag<N extends string> {
  protected __nominal: N
}

export type Brand<T, N extends string> = T & Tag<N>

/** Finite number greater than or equal to 0 */
export type NonNegativeRational = Brand<number, 'NonNegativeRational'>

/** Is the given number greater than or equal to 0, not `NaN`, and not `Infinity`? */
export const isNonNegativeRational = (o: unknown): o is NonNegativeRational =>
  typeof o === 'number' && Number.isFinite(o) && o >= 0

/** Integer greater than or equal to 0 */
export type NonNegativeInteger = Brand<number, 'NonNegativeInteger'>

/** Is the given number an integer (not `NaN` nor `Infinity`) and greater than or equal to 0? */
export const isNonNegativeInteger = (o: number): o is NonNegativeInteger =>
  Number.isInteger(o) && o >= 0

/**
 * Ratio of two integers: a numerator greater than or equal to 0,
 * and a denominator greater than 0
 */
export class Ratio {
  /** Numerator */
  readonly a: Int
  /** Denominator */
  readonly b: PositiveInt

  private constructor(a: Int, b: PositiveInt) {
    this.a = a
    this.b = b
  }

  static of(a: PositiveInt, b: PositiveInt): PositiveRatio
  static of(a: Int, b: PositiveInt): Ratio
  static of<T extends Int>(a: T, b: PositiveInt): Ratio {
    return new Ratio(a, b)
  }

  /**
   * Convert a number (not `NaN`, `Infinity` or negative) into a Ratio.
   * Zero becomes 0/1.
   */
  static from(n: NonNegativeRational): Ratio
  static from(n: number): Ratio | undefined
  static from<T extends number>(n: T): Ratio | undefined {
    if (!isNonNegativeRational(n)) {
      return
    }

    let e = 1
    while (!Number.isInteger(n * e)) {
      e *= 10
    }

    const a = Int.from(n * e) as Int
    const b = Int.from(e) as PositiveInt
    return new Ratio(a, b)
  }

  reciprocal(): PositiveRatio | undefined {
    if (this.a.isPositive()) {
      return Ratio.of(this.b, this.a)
    }
  }

  floor(): bigint {
    return this.a.divide(this.b).value
  }

  ceil(): bigint {
    return this.a.divideCeil(this.b).value
  }

  isEqualTo(r: Ratio): boolean {
    return this.a.value * r.b.value === this.b.value * r.a.value
  }

  isGreaterThan(r: Ratio): this is PositiveRatio {
    return this.a.value * r.b.value > this.b.value * r.a.value
  }

  isGreaterThanOrEqualTo(r: PositiveRatio): this is PositiveRatio
  isGreaterThanOrEqualTo(r: Ratio): boolean
  isGreaterThanOrEqualTo<T extends Ratio>(r: T): boolean {
    return this.a.value * r.b.value >= this.b.value * r.a.value
  }

  isLessThan(r: Ratio): boolean {
    return this.a.value * r.b.value < this.b.value * r.a.value
  }

  isLessThanOrEqualTo(r: Ratio): boolean {
    return this.a.value * r.b.value <= this.b.value * r.a.value
  }

  isPositive(): this is PositiveRatio {
    return this.a.isPositive()
  }

  valueOf(): number {
    return +this.a / +this.b
  }

  toString(): string {
    return this.valueOf().toString()
  }

  toJSON(): [string, string] {
    return [this.a.toString(), this.b.toString()]
  }
}

/** Ratio of two integers greater than 0 */
export interface PositiveRatio extends Ratio {
  readonly a: PositiveInt
  readonly b: PositiveInt

  reciprocal(): PositiveRatio
  isEqualTo(r: Ratio): r is PositiveRatio
  isLessThan(r: Ratio): r is PositiveRatio
  isLessThanOrEqualTo(r: Ratio): r is PositiveRatio
  isPositive(): true
}
