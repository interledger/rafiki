variable project {
  type = string
  default = "rafiki-test-1"
}

variable env {
  type = string
  default = "test-001"
}

variable region {
  type = string
  default = "us-central1"
}

locals {
  env = var.env
  project = var.project
  kubernetes_zone = "us-west1-a"
  cluster = {
    enable_workload_identity = true
    node_pools = [
      {
        name = "us-west1"
        location = "us-west1-a"
        node_locations = ["us-west1-a", "us-west1-b","us-west1-c"]
        machine_type = "n2-standard-2"
        # the "node count" is actually "nodes per node location" count
        node_count = 1
        min_node_count = 1
        max_node_count = 8
        max_surge = 4
        max_unavailable = 0
      },
    ]
    maintenance_schedule = {
      start_time = "2021-05-26T11:00:00Z"
      end_time = "2021-05-26T16:00:00Z"
      recurrence = "FREQ=WEEKLY;BYDAY=TU,WE,TH"
    }
  }
}

variable apis {
  type = list(string)
  default = [
    "compute.googleapis.com",
    "container.googleapis.com",
    "containerregistry.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "storage-api.googleapis.com",
  ]
}

// yes it's a resource not a var but this is so trivial
// and unconnected to anything else that this is the least
// obtrusive space for it to occupy
resource "google_project_service" "apis" {
  for_each = toset(var.apis)
  project            = local.project
  service            = each.key
  disable_on_destroy = false
}
