module.exports = {
  '*': ['pnpm format:check:hook'],
  '!(*graphql).ts|x': ['pnpm lint:check:hook']
}
