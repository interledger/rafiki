### Helm Chart for Rafiki

This chart deploys

1. Rafiki backend
2. Rafiki auth service

Requirements:

1. A Postgres database with a user for the backend service.
2. A second postgres database with a user for the auth service
3. A redis collection for the backend.

This chart does not deploy the required Redis and Postgres datastores. Installing them separately will 
make it easier and safer to perform updates on this chart, which contains no stateful components.

If you are deploying your databases in k8s, the [example chart](../rafiki-example) in this repo shows one way of doing it,
by creating a parent chart that includes both this chart and stock Redis and Postgresql charts.

Some general notes:

* Rafiki-backend uses io_uring. This is allowed in many k8s environments, but it doesn't work in GKE Autopilot clusters.
* There are several URL parameters to backend that refer to the backend service itself: `PUBLIC_HOST`, `OPEN_PAYMENTS_URL`, `PAYMENT_POINTER_URL`. Attention should be paid to whether those are k8s-internal URLs or public URLs.
