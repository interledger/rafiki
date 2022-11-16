notes on tigerbeetle pod allocation:

The node pool for the tigerbeetle pods is created by terraform. nodes must _already exist_
before applying the helm chart, because if the persistent volumes get scheduled on a single
node, the application pods will continue to be scheduled on that node even if other nodes
become available.

The persistent [disk types](https://cloud.google.com/compute/docs/disks/performance#regional-persistent-disks)
constrain I/O performance. There are several choices to make:

Zonal persistent disks vs regional persistent disks:

The [persistent volumes allocated in k8s in GKE](https://kubernetes.io/docs/concepts/storage/storage-classes/#gce-pd) 
are always AFAICT [networked](https://cloud.google.com/kubernetes-engine/docs/concepts/persistent-volumes), not local
to the node. The downside of this is the access times; the upside is that they can be [regional](https://cloud.google.com/compute/docs/disks/#repds)
and mirrored across two zones. I think that our best option is to use regional SSD PVs, but there's a [chart](https://cloud.google.com/compute/docs/disks/performance#zonal-persistent-disks)
comparing the performance. Weirdly, google's docs [elsewhere](https://cloud.google.com/compute/docs/disks) state that write
performance is less-good on regional disks, but that isn't reflected in the published performance chart.
