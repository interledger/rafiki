import { updateCredential } from './requesters'

export async function updatePaymentPointerCredential(
  paymentPointerId: string,
  credentialId: string
): Promise<void> {
  await updateCredential(paymentPointerId, credentialId)
  return
}
