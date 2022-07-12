
module cluster {
  source = "../modules/cluster"
  project = local.project
  enable_workload_identity = local.cluster.enable_workload_identity
  env = local.env
  name = local.env
  zone = local.kubernetes_zone
  node_pools = local.cluster.node_pools
  maintenance_schedule = local.cluster.maintenance_schedule
  depends_on = [google_project_service.apis]
}
