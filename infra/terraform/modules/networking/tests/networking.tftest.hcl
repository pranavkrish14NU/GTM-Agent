# Offline unit tests for the networking module. mock_provider lets `terraform
# test` plan resources without GCP credentials or a real project.

mock_provider "google" {}

variables {
  project_id  = "boba-test"
  region      = "us-central1"
  environment = "dev"
}

run "vpc_uses_custom_subnets" {
  command = plan

  assert {
    condition     = google_compute_network.vpc.auto_create_subnetworks == false
    error_message = "VPC must be custom-mode (auto_create_subnetworks = false) so each tier gets an explicit CIDR."
  }

  assert {
    condition     = google_compute_network.vpc.name == "boba-vpc-dev"
    error_message = "VPC name must be suffixed with the environment."
  }
}

run "two_private_subnets_app_and_data" {
  command = plan

  assert {
    condition     = google_compute_subnetwork.app.ip_cidr_range == var.app_subnet_cidr
    error_message = "App-tier subnet CIDR must match app_subnet_cidr."
  }

  assert {
    condition     = google_compute_subnetwork.data.ip_cidr_range == var.data_subnet_cidr
    error_message = "Data-tier subnet CIDR must match data_subnet_cidr."
  }

  assert {
    condition     = google_compute_subnetwork.app.private_ip_google_access == true
    error_message = "App subnet must enable Private Google Access."
  }

  assert {
    condition     = google_compute_subnetwork.data.private_ip_google_access == true
    error_message = "Data subnet must enable Private Google Access."
  }
}

run "app_subnet_has_gke_secondary_ranges" {
  command = plan

  assert {
    condition     = length(google_compute_subnetwork.app.secondary_ip_range) == 2
    error_message = "App subnet must expose two secondary ranges (pods, services) for the GKE module."
  }

  assert {
    condition     = google_compute_subnetwork.app.secondary_ip_range[0].range_name == "gke-pods"
    error_message = "First secondary range must be named gke-pods."
  }

  assert {
    condition     = google_compute_subnetwork.app.secondary_ip_range[1].range_name == "gke-services"
    error_message = "Second secondary range must be named gke-services."
  }
}

run "cloud_nat_covers_all_ranges" {
  command = plan

  assert {
    condition     = google_compute_router_nat.nat.source_subnetwork_ip_ranges_to_nat == "ALL_SUBNETWORKS_ALL_IP_RANGES"
    error_message = "Cloud NAT must provide egress for all subnet ranges."
  }

  assert {
    condition     = google_compute_router_nat.nat.nat_ip_allocate_option == "AUTO_ONLY"
    error_message = "Cloud NAT should auto-allocate external IPs."
  }
}

run "private_service_access_reserved" {
  command = plan

  assert {
    condition     = google_compute_global_address.psa_range.purpose == "VPC_PEERING"
    error_message = "PSA range must use VPC_PEERING purpose for Cloud SQL / Redis."
  }

  assert {
    condition     = google_compute_global_address.psa_range.address_type == "INTERNAL"
    error_message = "PSA range must be an INTERNAL address."
  }

  assert {
    condition     = google_service_networking_connection.psa.service == "servicenetworking.googleapis.com"
    error_message = "Service networking connection must target servicenetworking.googleapis.com."
  }
}

run "firewall_allows_https_to_app_tier" {
  command = plan

  assert {
    condition     = contains(google_compute_firewall.allow_lb_to_app.allow[0].ports, "443")
    error_message = "Load balancer firewall rule must allow TCP 443 to app-tier backends."
  }

  assert {
    condition     = google_compute_firewall.allow_lb_to_app.direction == "INGRESS"
    error_message = "LB rule must be an ingress rule."
  }
}

run "firewall_denies_everything_else" {
  command = plan

  assert {
    condition     = google_compute_firewall.deny_all_ingress.priority == 65534
    error_message = "Explicit deny-all ingress must sit just above the implied deny."
  }

  assert {
    condition     = google_compute_firewall.deny_all_ingress.deny[0].protocol == "all"
    error_message = "Deny-all rule must deny every protocol."
  }

  assert {
    condition     = contains(google_compute_firewall.deny_all_ingress.source_ranges, "0.0.0.0/0")
    error_message = "Deny-all rule must apply to all source ranges."
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
