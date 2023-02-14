import { z } from 'zod'
import { isValidIlpAddress } from 'ilp-packet'

export const createPeerSchema = z.object({
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
    .optional(),
  incomingAuthTokens: z.string().optional(),
  outgoingAuthToken: z.string(),
  outgoingEndpoint: z
    .string()
    .url({ message: 'Invalid outgoing HTTP endpoint URL.' }),
  asset: z.string()
})

export const paginationSchema = z
  .object({
    after: z.string().uuid(),
    before: z.string().uuid(),
    first: z.coerce.number().positive(),
    last: z.coerce.number().positive()
  })
  .strict()
