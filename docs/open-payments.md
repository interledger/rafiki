# Open Payments

Open Payments is an API standard that allows third-parties (with the account holder's consent) to initiate payments and to view the transaction history on the account holder's account. Extensive documentation can be found on the [Open Payments website](https://openpayments.guide).

Rafiki implements the Open Payments APIs. Every request and response is validated against the [Open Payments API specification](https://github.com/interledger/open-payments/tree/main/openapi).

The specification version that Rafiki uses is configured in [fetch-schemas.sh](../scripts/fetch-schemas.sh). Currently, it is using the tagged version [v1.0](https://github.com/interledger/open-payments/tree/v1.0/openapi).

To update the API specification, create a Pull Request on the [Open Payments Github Repository](https://github.com/interledger/open-payments/). Changes will automatically be pushed to [Readme](https://readme.com/), which hosts the [API reference](https://docs.openpayments.guide/reference/) on the [Open Payments website](https://openpayments.guide).
