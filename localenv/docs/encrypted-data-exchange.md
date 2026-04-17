# Run with Encrypted Data Exchange

Start the env with the feature flag enabled on the receiver:

```bash
pnpm localenv:compose:partial-payment up
```

# Manually Test the Encrypted Data Exchange Flow (Happy Path)

## Steps

- Run the **Open Payments** example requests in Bruno.

- Run the **Get Outgoing Payment** request in the GraphQL admin api for the state. The Open Payments `GET /outgoing-payments/:id` request is insufficient because it does not have the `state`.

## Verification

Check logs to ensure the encrypted data exchange flow is working as expected:

- `incoming_payment.partial_payment_received` fires on the `happy-life-bank-mock-ase` logs — payload has `partialIncomingPaymentId` and the `dataToTransmit` defined by the mock ase.
- `confirmPartialIncomingPayment` is called after by mock-ase
- Outgoing payment `state` from the `outgoingPayment` graphql resolver is `COMPLETED`
