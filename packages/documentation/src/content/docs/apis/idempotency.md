---
title: Idempotency
---

Several mutations utilize an idempotency key to allow safely retrying requests without performing operations multiple times. This should be a unique key (typically, a V4 UUID).

For Rafiki's GraphQL API, whenever a mutation with an idempotency key is called, the request payload and the request response are saved under that key. Any following requests with the same idempotency key would return the original response of the request. These are cached for a default of 24 hours, and can be configured via the `GRAPHQL_IDEMPOTENCY_KEY_TTL_MS` `backend` service's environment flag. Additionally, in the possible chance that a request is made while still concurrently processing the first under the same `idempotencyKey`, the API would return an error. This further safeguards from potential errors in the system. The timing to prevent processing concurrent requests can be configured via the `GRAPHQL_IDEMPOTENCY_KEY_LOCK_MS` flag (which is 2 seconds by default).

For more information on idempotency, [see more](https://en.wikipedia.org/wiki/Idempotence).
