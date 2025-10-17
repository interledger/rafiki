import { SeedInstance } from 'mock-account-service-lib'
import type { z } from 'zod'

export type AccessAction = 'create' | 'read' | 'list' | 'complete'

export type AccessType =
  | 'account'
  | 'incoming-payment'
  | 'outgoing-payment'
  | 'quote'

export interface PaymentAmount {
  value: string
  assetCode: string
  assetScale: number
}

export interface AccessLimit {
  receiver: string
  debitAmount?: PaymentAmount
  receiveAmount?: PaymentAmount
}

export interface Access {
  grantId: string
  type: AccessType
  actions: Array<AccessAction>
  limits?: AccessLimit
}

export type InstanceConfig = {
  name: string
  logo: string
  background: string
}

export type TenantInstanceConfig = {
  isTenant: boolean
  seed: SeedInstance
}

export type JSONError<T extends z.ZodTypeAny> = {
  errors: z.typeToFlattenedError<z.infer<T>>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Keys<T> = T extends any ? keyof T : never

export type ZodFieldErrors<T extends z.ZodTypeAny> = {
  [P in Keys<z.TypeOf<T>>]?: string[] | undefined
}

export type TenantOptions = {
  tenantId: string
  apiSecret: string
  walletAddressPrefix?: string
}
