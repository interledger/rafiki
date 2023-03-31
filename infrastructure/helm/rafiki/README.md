### Helm Chart for Rafiki

This chart deploys

1. Rafiki backend
2. Rafiki auth service

It also deploys dependent charts:

1. Postgres
2. Redis

Some general notes:

* Rafiki-backend uses io_uring. This is allowed in many k8s environments, but it doesn't work in GKE Autopilot clusters.
* Remember that `helm uninstall` will NOT delete PVCs (the data volumes associated with the dbs. If you delete this chart and reinstall it without manually deleting the PVCs, the databases will continue using the previous PVCs and specifically will not respect changes in postgres user/password/database settings.
