mock_provider "google" {}

variables {
  project_id           = "boba-test"
  region               = "us-central1"
  environment          = "dev"
  network              = "projects/boba-test/global/networks/boba-vpc-dev"
  subnetwork           = "projects/boba-test/regions/us-central1/subnetworks/boba-vpc-app-dev"
  node_service_account = "boba-worker-dev@boba-test.iam.gserviceaccount.com"
}

run "cluster_is_private_vpc_native" {
  command = plan

  assert {
    condition     = google_container_cluster.this.private_cluster_config[0].enable_private_nodes == true
    error_message = "Cluster must have private nodes."
  }

  assert {
    condition     = google_container_cluster.this.private_cluster_config[0].enable_private_endpoint == true
    error_message = "Cluster must have no public control-plane endpoint by default."
  }

  assert {
    condition     = google_container_cluster.this.networking_mode == "VPC_NATIVE"
    error_message = "Cluster must be VPC-native to use the subnet secondary ranges."
  }

  assert {
    condition     = google_container_cluster.this.remove_default_node_pool == true
    error_message = "Default node pool must be removed; pools are managed explicitly."
  }
}

run "uses_wo001_secondary_ranges" {
  command = plan

  assert {
    condition     = google_container_cluster.this.ip_allocation_policy[0].cluster_secondary_range_name == var.pods_range_name
    error_message = "Cluster must attach pods to the gke-pods secondary range from WO-001."
  }

  assert {
    condition     = google_container_cluster.this.ip_allocation_policy[0].services_secondary_range_name == var.services_range_name
    error_message = "Cluster must attach services to the gke-services secondary range from WO-001."
  }
}

run "workload_identity_and_dataplane_v2" {
  command = plan

  assert {
    condition     = google_container_cluster.this.workload_identity_config[0].workload_pool == "boba-test.svc.id.goog"
    error_message = "Workload Identity pool must be PROJECT.svc.id.goog."
  }

  assert {
    condition     = google_container_cluster.this.datapath_provider == "ADVANCED_DATAPATH"
    error_message = "Dataplane V2 must be enabled for network policy enforcement."
  }

  assert {
    condition     = google_service_account_iam_member.workload_identity.role == "roles/iam.workloadIdentityUser"
    error_message = "A KSA must be bound to the GCP SA via roles/iam.workloadIdentityUser."
  }
}

run "general_node_pool_sizing" {
  command = plan

  assert {
    condition     = google_container_node_pool.general.node_config[0].machine_type == "e2-standard-4"
    error_message = "General pool must use e2-standard-4."
  }

  assert {
    condition     = google_container_node_pool.general.autoscaling[0].total_min_node_count == 2 && google_container_node_pool.general.autoscaling[0].total_max_node_count == 10
    error_message = "General pool must autoscale 2-10 nodes."
  }
}

run "worker_node_pool_sizing_and_taint" {
  command = plan

  assert {
    condition     = google_container_node_pool.worker.node_config[0].machine_type == "e2-highmem-4"
    error_message = "Worker pool must use e2-highmem-4."
  }

  assert {
    condition     = google_container_node_pool.worker.autoscaling[0].total_min_node_count == 2 && google_container_node_pool.worker.autoscaling[0].total_max_node_count == 20
    error_message = "Worker pool must autoscale 2-20 nodes."
  }

  assert {
    condition     = google_container_node_pool.worker.node_config[0].taint[0].key == "workload"
    error_message = "Worker pool must be tainted so only worker workloads schedule there."
  }
}

run "both_pools_use_workload_identity_metadata" {
  command = plan

  assert {
    condition     = google_container_node_pool.general.node_config[0].workload_metadata_config[0].mode == "GKE_METADATA"
    error_message = "General pool nodes must expose GKE_METADATA for Workload Identity."
  }

  assert {
    condition     = google_container_node_pool.worker.node_config[0].workload_metadata_config[0].mode == "GKE_METADATA"
    error_message = "Worker pool nodes must expose GKE_METADATA for Workload Identity."
  }
}

run "hardening_settings" {
  command = plan

  assert {
    condition     = google_container_cluster.this.enable_intranode_visibility == true
    error_message = "Intranode visibility must be enabled."
  }

  assert {
    condition     = google_container_cluster.this.master_auth[0].client_certificate_config[0].issue_client_certificate == false
    error_message = "Client certificate authentication must be disabled."
  }
}

run "rejects_invalid_environment" {
  command = plan

  variables {
    environment = "qa"
  }

  expect_failures = [
    var.environment,
  ]
}
