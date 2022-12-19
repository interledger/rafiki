/**
 * A key-value map where the members' keys represent prefixes.
 *
 * Example:
 *   const map = new PrefixMap()
 *   map.insert("foo", 1)
 *   map.insert("bar", 2)
 *   map.get("foo")     // ⇒ 1
 *   map.get("foo.bar") // ⇒ 1 ("foo" is the longest known prefix of "foo.bar")
 *   map.get("bar")     // ⇒ 2
 *   map.get("bar.foo") // ⇒ 2 ("bar" is the longest known prefix of "bar.foo")
 *   map.get("random")  // ⇒ null
 */
export default class PrefixMap<T> {
  protected prefixes: string[]
  protected items: { [key: string]: T }

  constructor() {
    this.prefixes = []
    this.items = {}
  }

  keys(): string[] {
    return this.prefixes
  }

  size(): number {
    return this.prefixes.length
  }

  /**
   * Find the value of the longest matching prefix key.
   */
  resolve(key: string): T | undefined {
    const prefix = this.resolvePrefix(key)

    return typeof prefix !== 'undefined' ? this.items[prefix] : undefined
  }

  /**
   * Find the longest matching prefix key.
   */
  resolvePrefix(key: string): string | undefined {
    // Exact match
    if (this.items[key]) return key // redundant; optimization?
    // prefix match (the list is in descending length order, and secondarily, reverse-alphabetically)
    const index = this.prefixes.findIndex((e: string) =>
      key.startsWith(e + '.')
    )
    if (index === -1) return undefined
    const prefix = this.prefixes[index]
    return prefix
  }

  get(prefix: string): T | undefined {
    return this.items[prefix]
  }

  /**
   * Look up all keys that start with a certain prefix.
   */
  *getKeysStartingWith(prefix: string): IterableIterator<string> {
    // TODO: This could be done *much* more efficiently
    const predicate = (key: string): boolean => key.startsWith(prefix)
    for (let index = 0; index < this.prefixes.length; index++) {
      if (predicate(this.prefixes[index])) {
        yield this.prefixes[index]
      }
    }
  }

  *getKeysPrefixesOf(search: string): IterableIterator<string> {
    const predicate = (key: string): boolean => search.startsWith(key + '.')
    for (let index = 0; index < this.prefixes.length; index++) {
      if (predicate(this.prefixes[index])) {
        yield this.prefixes[index]
      }
    }
  }

  /**
   * @param {function(item, key)} fn
   */
  each(fn: (item: T, key: string) => void): void {
    for (const prefix of this.prefixes) {
      fn(this.items[prefix], prefix)
    }
  }

  /**
   * Insert the prefix while keeping the prefixes sorted first in length order
   * and if two prefixes are the same length, sort them in reverse alphabetical order
   */
  insert(prefix: string, item: T): T {
    if (!this.items[prefix]) {
      const index = this.prefixes.findIndex((e: string) => {
        if (prefix.length === e.length) {
          return prefix > e
        }
        return prefix.length > e.length
      })

      if (index === -1) {
        this.prefixes.push(prefix)
      } else {
        this.prefixes.splice(index, 0, prefix)
      }
    }
    this.items[prefix] = item
    return item
  }

  delete(prefix: string): void {
    const index = this.prefixes.indexOf(prefix)
    if (this.prefixes[index] === prefix) this.prefixes.splice(index, 1)
    delete this.items[prefix]
  }

  toJSON(): { [key: string]: T } {
    return this.items
  }

  /**
   * Find the shortest unambiguous prefix of an ILP address in a prefix map.
   *
   * This let's us figure out what addresses the selected route applies to. For
   * example, the most specific route for destination "a.b.c" might be "a", but
   * that doesn't mean that that route applies to any destination starting with
   * "a" because there may be a more specific route like "a.c".
   *
   * So we would call this utility function to find out that the least specific
   * prefix for which there are no other more specific routes is "a.b".
   *
   * In order to force a minimum prefix, it can be passed as the third parameter.
   * This function may make it even more specific if necessary to make it
   * unambiguous, but it will never return a less specific prefix.
   */
  getShortestUnambiguousPrefix(address: string, prefix = ''): string {
    if (!address.startsWith(prefix)) {
      throw new Error(
        `address must start with prefix. address=${address} prefix=${prefix}`
      )
    }

    this.keys().forEach((secondPrefix: string) => {
      if (secondPrefix === prefix) {
        return
      }

      while (secondPrefix.startsWith(prefix)) {
        if (secondPrefix === prefix) {
          return
        }

        const nextSegmentEnd = address.indexOf('.', prefix.length + 1)

        if (nextSegmentEnd === -1) {
          prefix = address
          return
        } else {
          prefix = address.slice(0, nextSegmentEnd)
        }
      }
    })

    return prefix
  }
}
