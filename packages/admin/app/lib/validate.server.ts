import { z } from 'zod'
import { isValidIlpAddress } from 'ilp-packet'

export const paginationSchema = z
  .object({
    after: z.string().uuid(),
    before: z.string().uuid(),
    first: z.coerce.number().int().positive(),
    last: z.coerce.number().int().positive()
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
    .int()
    .positive()
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
    .int()
    .positive()
    .optional()
})

export const createAssetSchema = z
  .object({
    code: z
      .string()
      .length(3, { message: 'Code should be 3 characters long' })
      .regex(/^[a-zA-Z]+$/, { message: 'Code should only contain letters.' })
      .transform((code) => code.toUpperCase()),
    scale: z.coerce
      .number({
        invalid_type_error: 'Max packet amount is expected to be a number.'
      })
      .int()
      .positive()
      .max(255, { message: 'Scale should be between 0 and 255' })
      .optional()
  })
  .merge(updateAssetSchema)
  .omit({ id: true })
