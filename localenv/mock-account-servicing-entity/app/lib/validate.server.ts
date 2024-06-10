import { z } from 'zod'

export const uuidSchema = z.object({
  id: z.string().uuid()
})

export const createAccountSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  assetId: z.string().uuid()
})

export const updateAccountSchema = z
  .object({
    name: z.string().min(1)
  })
  .merge(uuidSchema)

export const addLiquiditySchema = z
  .object({
    amount: z.coerce.number().positive()
  })
  .merge(uuidSchema)
