export enum WebhookEventError {
  InvalidWithdrawalAccount = 'InvalidWithdrawalAccount',
  InvalidWithdrawalAsset = 'InvalidWithdrawalAsset'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isWebhookEventError = (o: any): o is WebhookEventError =>
  Object.values(WebhookEventError).includes(o)
