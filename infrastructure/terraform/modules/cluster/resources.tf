data "google_container_engine_versions" "default" {
  project  = var.project
  location = var.zone
}

resource "google_container_cluster" "cluster" {
  project                  = var.project
  name                     = var.name
  description              = "${var.name} created by terraform for ${var.env}"
  location                 = var.zone
  min_master_version       = data.google_container_engine_versions.default.release_channel_default_version[var.release_channel]
  enable_legacy_abac       = false
  initial_node_count       = 1
  remove_default_node_pool = true
  enable_shielded_nodes    = true
  # Throws an error if the AZ of the cluster itself is included in the list 
  # (also the location of the cluster could be a region, which would also be
  # invalid as a node location)
  node_locations = setsubtract(distinct(flatten([for pool in var.node_pools : pool.node_locations])), [var.zone])
  networking_mode = var.networking_mode

  // https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/container_cluster#nested_ip_allocation_policy
  // the upshot is, this will be an ok
  // default until we have a reason
  // to change it.
  ip_allocation_policy {
    cluster_ipv4_cidr_block = ""
    services_ipv4_cidr_block = ""
  }

  maintenance_policy {
    recurring_window {
      start_time = var.maintenance_schedule.start_time
      end_time   = var.maintenance_schedule.end_time
      recurrence = var.maintenance_schedule.recurrence
    }
  }

  dynamic workload_identity_config {
    for_each = var.enable_workload_identity ? [1] : []
    content {
      workload_pool = "${var.project}.svc.id.goog"
    }
  }

  release_channel {
    channel = var.release_channel
  }
}

resource "google_container_node_pool" "pools" {
  count             = length(var.node_pools)
  project           = var.project
  name              = var.node_pools[count.index].name
  location          = var.node_pools[count.index].location
  node_locations    = var.node_pools[count.index].node_locations
  cluster           = google_container_cluster.cluster.name
  max_pods_per_node = 110 # default
  node_count        = var.node_pools[count.index].node_count

  node_config {
    machine_type = var.node_pools[count.index].machine_type

    metadata = {
      disable-legacy-endpoints = "true"
    }
  }

  autoscaling {
    min_node_count = var.node_pools[count.index].min_node_count
    max_node_count = var.node_pools[count.index].max_node_count
  }

  management {
    auto_upgrade = true
    auto_repair  = true
  }

  upgrade_settings {
    max_surge = var.node_pools[count.index].max_surge
    max_unavailable = var.node_pools[count.index].max_unavailable
  }
}

output cluster_name {
  value = var.name
}
