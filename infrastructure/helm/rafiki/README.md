### Helm Chart for Rafiki

This chart deploys

1. Rafiki backend
2. Rafiki auth service

Some general notes:

* Rafiki-backend uses io_uring. This is allowed in many k8s environments, but it doesn't work in GKE Autopilot clusters.
* This chart does not deploy the required redis and postgresql datastores. If you are deploying your databases in k8s, the bitnami [redis](https://github.com/bitnami/charts/tree/main/bitnami/redis) and [postgresql](https://github.com/bitnami/charts/tree/main/bitnami/postgresql) charts are recommended. Installing them separately will make it easier and safer to perform updates on this chart, which contains no stateful components.

Outstanding questions:

There are several URL parameters to backend that refer to the backend service itself: `PUBLIC_HOST`, `OPEN_PAYMENTS_URL`, `PAYMENT_POINTER_URL`. Attention should be paid to whether those are k8s-internal URLs or public URLs.
