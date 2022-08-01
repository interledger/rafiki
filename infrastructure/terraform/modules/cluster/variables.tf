variable project {
  type = string
}

variable env {
  type = string
}

variable name {
  type = string
}

variable zone {
  type = string
  default = "us-central1-a"
}

variable networking_mode {
  type = string
  default = "VPC_NATIVE"
}

variable enable_workload_identity {
  type = bool
  default = false
}

variable release_channel {
  type = string
  default = "REGULAR"
}

variable node_pools {
  type = list(object({
    name = string
    machine_type = string
    location = string
    node_locations = list(string)
    # the "node count" is actually "nodes per node location" count
    node_count = number
    min_node_count = number
    max_node_count = number
    max_surge = number
    max_unavailable = number
  }))
  default = [
    {
      name = "default"
      machine_type = "n1-standard-1"
      node_count = 1
      min_node_count = 0
      location = "us-central1-a"
      node_locations = ["us-central1-a"]
      max_node_count = 8
      max_surge = 4
      max_unavailable = 0
    }
  ]
}

variable maintenance_schedule {
  type = object({
    start_time = string // e.g "03:00"
    end_time = string // e.g "03:00"
    recurrence = string // https://datatracker.ietf.org/doc/html/rfc5545#section-3.8.5.3
  })
  default = {
    start_time = "2021-05-26T11:00:00.000Z"
    end_time = "2021-05-26T12:00:00.000Z"
    recurrence = "FREQ=WEEKLY;BYDAY=TU,WE,TH"
  }
}
