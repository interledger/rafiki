import { z } from 'zod'
import { isValidIlpAddress } from 'ilp-packet'

export const paginationSchema = z
  .object({
    after: z.string().uuid(),
    before: z.string().uuid(),
    first: z.coerce.number().positive(),
    last: z.coerce.number().positive()
  })
  .partial()

export const peerGeneralInfoSchema = z.object({
  id: z.string().uuid(),
  name: z.string().optional(),
  staticIlpAddress: z
    .string()
    .refine((ilpAddress) => isValidIlpAddress(ilpAddress), {
      message: 'The provided ILP Address is not valid.'
    }),
  maxPacketAmount: z.coerce
    .number({
      invalid_type_error: 'Max packet amount is expected to be a number.'
    })
    .optional()
})

export const peerHttpInfoSchema = z.object({
  id: z.string().uuid(),
  incomingAuthTokens: z.string().optional(),
  outgoingAuthToken: z.string(),
  outgoingEndpoint: z
    .string()
    .url({ message: 'Invalid outgoing HTTP endpoint URL.' })
})

export const peerAssetInfoSchema = z.object({
  id: z.string().uuid(),
  asset: z.string()
})

export const createPeerSchema = peerGeneralInfoSchema
  .merge(peerHttpInfoSchema)
  .merge(peerAssetInfoSchema)
  .omit({ id: true })

export const updateAssetSchema = z.object({
  id: z.string().uuid(),
  withdrawalThreshold: z.coerce
    .number({
      invalid_type_error: 'Max packet amount is expected to be a number.'
    })
    .optional()
})
