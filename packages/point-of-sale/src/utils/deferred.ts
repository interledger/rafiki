export class Deferred<T> {
  promise: Promise<T>
  resolve!: (value: T) => void
  reject!: (reason?: Error) => void

  constructor() {
    this.promise = new Promise<T>((res, rej) => {
      this.resolve = res
      this.reject = rej
    })
  }
}
