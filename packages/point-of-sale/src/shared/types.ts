export type FnWithDeps<Deps, Fn> = Fn extends (...args: infer Args) => infer R
  ? (deps: Deps, ...args: Args) => R
  : never
