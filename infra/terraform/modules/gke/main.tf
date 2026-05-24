locals {
  workload_pool = "${var.project_id}.svc.id.goog"
}

# Regional, VPC-native, private GKE cluster. The default node pool is removed
# so node pools are managed explicitly below.
resource "google_container_cluster" "this" {
  name     = "${var.cluster_name}-${var.environment}"
  project  = var.project_id
  location = var.region

  network    = var.network
  subnetwork = var.subnetwork

  remove_default_node_pool = true
  initial_node_count       = 1
  networking_mode          = "VPC_NATIVE"
  deletion_protection      = var.deletion_protection

  # Pod-to-pod traffic on the same node is routed through the VPC so it is
  # visible to firewall logging/flow logs.
  enable_intranode_visibility = true

  resource_labels = {
    environment = var.environment
    managed-by  = "terraform"
    component   = "gke"
  }

  # No basic-auth and no client certificate — authenticate via IAM/OIDC only.
  master_auth {
    client_certificate_config {
      issue_client_certificate = false
    }
  }

  # Attach pods/services to the secondary ranges reserved by the networking
  # module (WO-001) rather than carving new ranges.
  ip_allocation_policy {
    cluster_secondary_range_name  = var.pods_range_name
    services_secondary_range_name = var.services_range_name
  }

  # Private nodes always; control plane public endpoint is disabled by default
  # so the cluster has no public endpoint (reachable only from the VPC /
  # authorized networks).
  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = var.enable_private_endpoint
    master_ipv4_cidr_block  = var.master_ipv4_cidr
  }

  master_authorized_networks_config {
    dynamic "cidr_blocks" {
      for_each = var.master_authorized_networks
      content {
        cidr_block   = cidr_blocks.value.cidr_block
        display_name = cidr_blocks.value.display_name
      }
    }
  }

  # Workload Identity: pods authenticate as GCP service accounts without node
  # key files.
  workload_identity_config {
    workload_pool = local.workload_pool
  }

  # Dataplane V2 (eBPF) provides Kubernetes network policy enforcement; do not
  # also set the legacy network_policy block (mutually exclusive).
  datapath_provider = "ADVANCED_DATAPATH"

  release_channel {
    channel = var.release_channel
  }

  # Managed, auto-upgraded control plane via the release channel above.
  lifecycle {
    ignore_changes = [initial_node_count]
  }
}

# General-purpose pool for stateless application services and the API gateway.
resource "google_container_node_pool" "general" {
  name     = "general"
  project  = var.project_id
  location = var.region
  cluster  = google_container_cluster.this.name

  autoscaling {
    total_min_node_count = var.general_min_nodes
    total_max_node_count = var.general_max_nodes
    location_policy      = "BALANCED"
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }

  node_config {
    machine_type    = var.general_machine_type
    service_account = var.node_service_account
    oauth_scopes    = ["https://www.googleapis.com/auth/cloud-platform"]

    workload_metadata_config {
      mode = "GKE_METADATA"
    }

    shielded_instance_config {
      enable_secure_boot          = true
      enable_integrity_monitoring = true
    }

    labels = {
      pool = "general"
    }

    metadata = {
      disable-legacy-endpoints = "true"
    }
  }
}

# High-memory pool dedicated to worker pods (embedding/indexing jobs). Tainted
# so only tolerating worker workloads schedule here.
resource "google_container_node_pool" "worker" {
  name     = "worker"
  project  = var.project_id
  location = var.region
  cluster  = google_container_cluster.this.name

  autoscaling {
    total_min_node_count = var.worker_min_nodes
    total_max_node_count = var.worker_max_nodes
    location_policy      = "BALANCED"
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }

  node_config {
    machine_type    = var.worker_machine_type
    service_account = var.node_service_account
    oauth_scopes    = ["https://www.googleapis.com/auth/cloud-platform"]

    workload_metadata_config {
      mode = "GKE_METADATA"
    }

    shielded_instance_config {
      enable_secure_boot          = true
      enable_integrity_monitoring = true
    }

    labels = {
      pool = "worker"
    }

    taint {
      key    = "workload"
      value  = "worker"
      effect = "NO_SCHEDULE"
    }

    metadata = {
      disable-legacy-endpoints = "true"
    }
  }
}

# Map the Kubernetes service account to the GCP service account so pods using
# that KSA inherit the node SA's GCP permissions via Workload Identity.
resource "google_service_account_iam_member" "workload_identity" {
  service_account_id = "projects/${var.project_id}/serviceAccounts/${var.node_service_account}"
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${local.workload_pool}[${var.workload_identity_namespace}/${var.workload_identity_ksa}]"
}
