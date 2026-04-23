# Run with Encrypted Data Exchange

Start the env with the feature flag enabled on the receiver:

```bash
pnpm localenv:compose:partial-payment up
```

# Manually Test the Encrypted Data Exchange Flow (Happy Path)

## Steps

- Run the **Examples > Admin API > Open Payments** or the **Examples > Open Payments > Peer-to-Peer Payment** requests in Bruno.

## Verification

In the `happy-life-bank-mock-ase` logs:

- `incoming_payment.partial_payment_received` webhook was received, with `partialIncomingPaymentId` and the `dataToTransmit` defined in the payload
- `confirmPartialIncomingPayment` was called

In Bruno:

- Confirm the Outgoing Payment is completed by calling the `Get Outgoing Payment` request, and verifying a positive `sentAmount`.
