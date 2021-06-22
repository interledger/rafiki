import { QueryResolvers, ResolversTypes } from '../generated/graphql'

export const getUser: QueryResolvers['user'] = async (
  parent,
  args,
  ctx
): ResolversTypes['User'] => {
  const id = ctx.user
  const userService = await ctx.container.use('userService')
  const user = await userService.get(id)
  return {
    id: user.id
  }
}
