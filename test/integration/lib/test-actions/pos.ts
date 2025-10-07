import type { MockASE } from 'test-lib'
import { PaymentDetails, PaymentResponse } from 'test-lib/dist/pos-service'

interface POSActionsDeps {
  sendingASE: MockASE
  receivingASE: MockASE
}

export interface POSActions {
  createPayment(input: PaymentDetails): Promise<PaymentResponse>
}

export function createPOSActions(deps: POSActionsDeps): POSActions {
  return {
    createPayment: (input) => createPayment(deps, input)
  }
}

async function createPayment(
  deps: POSActionsDeps,
  input: PaymentDetails
): Promise<PaymentResponse> {
  return await deps.receivingASE.posService.createPayment(input)
}
