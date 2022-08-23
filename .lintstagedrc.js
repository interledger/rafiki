module.exports = {
  '*': ['pnpm format:check:hook'],
  '!(*graphql).ts': ['pnpm lint:check:hook']
}
