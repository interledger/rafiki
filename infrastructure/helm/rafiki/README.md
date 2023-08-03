# Example Rafiki deployment

This [helm](https://helm.sh/docs/intro/install/) chart is a wrapper around the Rafiki backend, auth, and frontend charts in the [Interledger Helm Charts repo](https://github.com/interledger/helm-charts) and the Bitnami Postgres and Redis charts. The [values.yaml](./values.yaml) file shows how to configure the database connections for the services, assuming this chart is deployed with the name `rafiki`.

To install this chart with [helm](https://helm.sh/docs/intro/install/) in a k8s cluster, the folowing dependencies are required:

- [Kubernetes](https://kubernetes.io/releases/download/)
- [kubectl](https://kubernetes.io/docs/tasks/tools/#kubectl)
- [helm](https://helm.sh/docs/intro/install/)

After installing the dependencies, pull this git repo, update the [values.yaml](./values.yaml) file with values appropriate to your environment, and run 
```sh 
helm install rafiki PATH_TO_RAFIKI_REPO/infrastructure/helm/rafiki
```
