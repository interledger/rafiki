import { z } from 'zod'
import { isValidIlpAddress } from 'ilp-packet'

export const uuidSchema = z.object({
  id: z.string().uuid()
})

export const paginationSchema = z
  .object({
    after: z.string().uuid(),
    before: z.string().uuid(),
    first: z.coerce.number().int().positive(),
    last: z.coerce.number().int().positive()
  })
  .partial()

export const peerGeneralInfoSchema = z
  .object({
    name: z.string().optional(),
    staticIlpAddress: z
      .string()
      .refine((ilpAddress) => isValidIlpAddress(ilpAddress), {
        message: 'The provided ILP Address is not valid.'
      }),
    maxPacketAmount: z.coerce
      .bigint({
        invalid_type_error: 'Max packet amount is expected to be a number.'
      })
      .optional()
  })
  .merge(uuidSchema)

export const peerHttpInfoSchema = z
  .object({
    incomingAuthTokens: z.string().optional(),
    outgoingAuthToken: z.string(),
    outgoingEndpoint: z
      .string()
      .url({ message: 'Invalid outgoing HTTP endpoint URL.' })
  })
  .merge(uuidSchema)

export const peerAssetInfoSchema = z
  .object({
    asset: z.string()
  })
  .merge(uuidSchema)

export const createPeerSchema = peerGeneralInfoSchema
  .merge(peerHttpInfoSchema)
  .merge(peerAssetInfoSchema)
  .omit({ id: true })

export const updateAssetSchema = z
  .object({
    withdrawalThreshold: z.coerce
      .bigint({
        invalid_type_error: 'Max packet amount is expected to be a number.'
      })
      .optional()
  })
  .merge(uuidSchema)

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
  })
  .merge(updateAssetSchema)
  .omit({ id: true })
