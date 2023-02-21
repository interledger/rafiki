# Open Payments

Open Payments is an API standard that allows third-parties (with the account holder's consent) to initiate payments and to view the transaction history on the account holder's account. Extensive documentation can be found on the [Open Payments website](https://openpayments.guide).

Rafiki implements the Open Payments APIs. Every request and response is validated against the [Open Payments API specification](https://github.com/interledger/open-payments/tree/main/openapi).

The specification version that Rafiki uses is configured in [fetch-schemas.sh](../packages/open-payments/scripts/fetch-schemas.sh). Currently, it is using the version with commit hash [146ff684cc003149fb7362861a3b24b40dddb31c](https://github.com/interledger/open-payments/tree/146ff684cc003149fb7362861a3b24b40dddb31c/openapi).

<!-- TODO: change commit hash to tagged version -->

To update the API specification, create a Pull Request on the [Open Payments Github Repository](https://github.com/interledger/open-payments/). Changes will automatically be pushed to [Readme](https://readme.com/), which hosts the [API reference](https://docs.openpayments.guide/reference/) on the [Open Payments website](https://openpayments.guide).
