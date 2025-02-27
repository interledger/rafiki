/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, it, expect } from '@jest/globals'
import { AccountUrl, Int, Ratio, PositiveInt, Counter } from '../src'
import Long from 'long'

describe('account urls', () => {
  it('AccountUrl#fromPaymentPointer', () => {
    expect(AccountUrl.fromPaymentPointer('example.com')).toBeUndefined()
    expect(AccountUrl.fromPaymentPointer('$user:pass@example.com')).toBeUndefined()
    expect(AccountUrl.fromPaymentPointer('$localhost:3000')).toBeUndefined()
    expect(AccountUrl.fromPaymentPointer('$example.com?foo=bar')).toBeUndefined()
    expect(AccountUrl.fromPaymentPointer('$example.com#hash')).toBeUndefined()

    expect(AccountUrl.fromPaymentPointer('$example.com/alice')!.toString()).toBe(
      'https://example.com/alice'
    )
  })

  it('AccountUrl#fromUrl', () => {
    expect(AccountUrl.fromUrl('http://wallet.example')!.toString()).toBe(
      'http://wallet.example/.well-known/pay'
    )
    expect(AccountUrl.fromUrl('https://user:pass@wallet.example')).toBeUndefined()
    expect(AccountUrl.fromUrl('https://wallet.example:8080/')).toBeUndefined()

    expect(AccountUrl.fromUrl('https://wallet.example/account?foo=bar')!.toString()).toBe(
      'https://wallet.example/account?foo=bar'
    )
  })

  it('AccountUrl#toEndpointUrl', () => {
    expect(AccountUrl.fromPaymentPointer('$cool.wallet.co')!.toEndpointUrl()).toBe(
      'https://cool.wallet.co/.well-known/pay'
    )
    expect(AccountUrl.fromUrl('https://user.example?someId=123#bleh')!.toEndpointUrl()).toBe(
      'https://user.example/.well-known/pay?someId=123#bleh'
    )
    expect(AccountUrl.fromUrl('https://user.example')!.toEndpointUrl()).toBe(
      'https://user.example/.well-known/pay'
    )
  })

  it('AccountUrl#toBaseUrl', () => {
    expect(AccountUrl.fromPaymentPointer('$cool.wallet.co')!.toBaseUrl()).toBe(
      'https://cool.wallet.co/.well-known/pay'
    )
    expect(AccountUrl.fromUrl('https://user.example?someId=123#bleh')!.toBaseUrl()).toBe(
      'https://user.example/.well-known/pay'
    )
    expect(AccountUrl.fromUrl('https://user.example')!.toBaseUrl()).toBe(
      'https://user.example/.well-known/pay'
    )
  })

  it('AccountUrl#toString', () => {
    expect(AccountUrl.fromPaymentPointer('$wallet.example')!.toString()).toBe(
      'https://wallet.example/.well-known/pay'
    )
    expect(AccountUrl.fromUrl('https://wallet.example/user/account/?baz#bleh')!.toString()).toBe(
      'https://wallet.example/user/account?baz#bleh'
    )
  })

  it('AccountUrl#toPaymentPointer', () => {
    expect(AccountUrl.fromUrl('https://somewebsite.co/')!.toPaymentPointer()).toBe(
      '$somewebsite.co'
    )
    expect(
      AccountUrl.fromUrl('https://user.example?someId=123')!.toPaymentPointer()
    ).toBeUndefined()
    expect(AccountUrl.fromUrl('https://example.com/bob/#hash')!.toPaymentPointer()).toBeUndefined()
    expect(AccountUrl.fromUrl('http://somewebsite.co/')!.toPaymentPointer()).toBeUndefined()

    expect(AccountUrl.fromPaymentPointer('$example.com/')!.toPaymentPointer()).toBe('$example.com')
    expect(AccountUrl.fromPaymentPointer('$example.com/charlie/')!.toPaymentPointer()).toBe(
      '$example.com/charlie'
    )
    expect(AccountUrl.fromPaymentPointer('$example.com/charlie')!.toPaymentPointer()).toBe(
      '$example.com/charlie'
    )
  })
})

describe('integer operations', () => {
  it('Int#from', () => {
    expect(Int.from(Int.ONE)).toEqual(Int.ONE)
    expect(Int.from(Int.MAX_U64)).toEqual(Int.MAX_U64)

    expect(Int.from('1000000000000000000000000000000000000')?.value).toBe(
      BigInt('1000000000000000000000000000000000000')
    )
    expect(Int.from('1')?.value).toBe(BigInt(1))
    expect(Int.from('0')?.value).toBe(BigInt(0))
    expect(Int.from('-2')).toBeUndefined()
    expect(Int.from('2.14')).toBeUndefined()

    expect(Int.from(Long.UZERO)).toEqual(Int.ZERO)
    expect(Int.from(Long.UONE)).toEqual(Int.ONE)
    expect(Int.from(Long.MAX_UNSIGNED_VALUE)).toEqual(Int.MAX_U64)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(Int.from({} as any)).toBeUndefined()
  })

  it('Int#modulo', () => {
    expect(Int.from(5)!.modulo(Int.from(3) as PositiveInt)).toEqual(Int.TWO)
    expect(Int.from(45)!.modulo(Int.from(45) as PositiveInt)).toEqual(Int.ZERO)
  })

  it('Int#orLesser', () => {
    const a = Int.ONE
    const b = Int.ZERO
    expect(a.orLesser()).toBe(a)
    expect(a.orLesser(b)).toBe(b)
  })

  it('Int#toLong', () => {
    expect(Int.from(1234)!.toLong()).toEqual(Long.fromNumber(1234, true))
    expect(Int.MAX_U64.toLong()).toEqual(Long.MAX_UNSIGNED_VALUE)
    expect(Int.MAX_U64.add(Int.ONE).toLong()).toBeUndefined()
  })

  it('Int#toRatio', () => {
    expect(Int.ONE.toRatio()).toEqual(Ratio.of(Int.ONE, Int.ONE))
    expect(Int.MAX_U64.toRatio()).toEqual(Ratio.of(Int.MAX_U64, Int.ONE))
  })

  it('Ratio#from', () => {
    expect(Ratio.from(2)).toEqual(Ratio.of(Int.TWO, Int.ONE))
    expect(Ratio.from(12.34)).toEqual(Ratio.of(Int.from(1234)!, Int.from(100) as PositiveInt))
    expect(Ratio.from(0)).toEqual(Ratio.of(Int.ZERO, Int.ONE))
    expect(Ratio.from(NaN)).toBeUndefined()
    expect(Ratio.from(Infinity)).toBeUndefined()
  })

  it('Ratio#floor', () => {
    expect(Ratio.from(2.999)!.floor()).toEqual(Int.TWO.value)
    expect(Ratio.from(0)!.floor()).toEqual(Int.ZERO.value)
    expect(Ratio.from(100.1)!.floor()).toEqual(Int.from(100)!.value)
  })

  it('Ratio#ceil', () => {
    expect(Ratio.from(2.999)!.ceil()).toEqual(BigInt(3))
    expect(Ratio.from(0)!.ceil()).toEqual(BigInt(0))
    expect(Ratio.from(100.1)!.ceil()).toEqual(BigInt(101))
  })

  it('Ratio#reciprocal', () => {
    expect(Ratio.of(Int.ONE, Int.TWO).reciprocal()).toEqual(Ratio.of(Int.TWO, Int.ONE))
    expect(Ratio.of(Int.TWO, Int.ONE).reciprocal()).toEqual(Ratio.of(Int.ONE, Int.TWO))
    expect(Ratio.of(Int.ZERO, Int.ONE).reciprocal()).toBeUndefined()
  })

  it('Ratio#isEqualTo', () => {
    expect(Ratio.of(Int.from(8)!, Int.TWO).isEqualTo(Ratio.of(Int.from(4)!, Int.ONE))).toBe(true)
    expect(Ratio.of(Int.from(0)!, Int.TWO).isEqualTo(Ratio.of(Int.from(4)!, Int.ONE))).toBe(false)
  })

  it('Ratio#toString', () => {
    expect(Ratio.of(Int.from(4)!, Int.ONE).toString()).toBe('4')
    expect(Ratio.of(Int.ONE, Int.TWO).toString()).toBe('0.5')
    expect(Ratio.of(Int.ONE, Int.from(3) as PositiveInt).toString()).toBe((1 / 3).toString())
  })

  it('Ratio#toJSON', () => {
    expect(JSON.stringify(Ratio.of(Int.ZERO, Int.ONE))).toBe('["0","1"]')
    expect(Ratio.of(Int.from(821)!, Int.from(1200) as PositiveInt).toJSON()).toEqual([
      '821',
      '1200',
    ])
  })
})

describe('counter', () => {
  it('Counter#from', () => {
    expect(Counter.from(NaN)).toBeUndefined()
    expect(Counter.from(Infinity)).toBeUndefined()
    expect(Counter.from(-1)).toBeUndefined()
    expect(Counter.from(0)).toBeDefined()
    expect(Counter.from(1)).toBeDefined()
  })

  it('Counter#getCount', () => {
    expect(Counter.from(0)!.getCount()).toBe(0)
  })

  it('Counter#increment', () => {
    const c = Counter.from(2)!
    c.increment()
    expect(c.getCount()).toBe(3)
    c.increment()
    expect(c.getCount()).toBe(4)
  })
})
