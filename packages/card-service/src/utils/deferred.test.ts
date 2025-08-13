import { Deferred } from './deferred'

describe('Deferred', () => {
  test('resolves when resolve is called', async () => {
    const d = new Deferred<string>()
    setTimeout(() => d.resolve('ok'), 10)
    await expect(d.promise).resolves.toBe('ok')
  })

  test('rejects when reject is called', async () => {
    const d = new Deferred<string>()
    setTimeout(() => d.reject(new Error('fail')), 10)
    await expect(d.promise).rejects.toThrow('fail')
  })
})
