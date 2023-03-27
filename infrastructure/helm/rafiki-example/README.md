### Example Rafiki deployment

This chart is a wrapper around the [rafiki chart in this repo](../rafiki) and the Bitnami
Postgres and Redis charts. The [values.yaml](./values.yaml) file shows how to configure the
database connections for the services, assuming the chart is deployed with the name `rafiki-example`.
