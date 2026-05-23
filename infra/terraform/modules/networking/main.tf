# Custom-mode VPC: subnets are declared explicitly so each tier gets a
# least-privilege CIDR rather than the wide auto-created defaults.
resource "google_compute_network" "vpc" {
  name                    = "${var.network_name}-${var.environment}"
  project                 = var.project_id
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"
}

# App tier hosts GKE nodes and the API gateway. Secondary ranges are reserved
# here so the private GKE cluster (WO-002) can attach pods/services without
# re-planning the network.
resource "google_compute_subnetwork" "app" {
  name                     = "${var.network_name}-app-${var.environment}"
  project                  = var.project_id
  region                   = var.region
  network                  = google_compute_network.vpc.id
  ip_cidr_range            = var.app_subnet_cidr
  private_ip_google_access = true

  secondary_ip_range {
    range_name    = "gke-pods"
    ip_cidr_range = var.pods_secondary_cidr
  }

  secondary_ip_range {
    range_name    = "gke-services"
    ip_cidr_range = var.services_secondary_cidr
  }

  log_config {
    aggregation_interval = "INTERVAL_5_SEC"
    flow_sampling        = var.flow_logs_sampling
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

# Data tier isolates managed data services (Cloud SQL, Redis) reachable only
# over private IP. No secondary ranges — those services use Private Service
# Access peering rather than in-subnet IPs.
resource "google_compute_subnetwork" "data" {
  name                     = "${var.network_name}-data-${var.environment}"
  project                  = var.project_id
  region                   = var.region
  network                  = google_compute_network.vpc.id
  ip_cidr_range            = var.data_subnet_cidr
  private_ip_google_access = true

  log_config {
    aggregation_interval = "INTERVAL_5_SEC"
    flow_sampling        = var.flow_logs_sampling
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

# Cloud Router + NAT give private-subnet workloads outbound internet (LLM
# providers, Google Drive API, package registries) without public IPs.
resource "google_compute_router" "router" {
  name    = "${var.network_name}-router-${var.environment}"
  project = var.project_id
  region  = var.region
  network = google_compute_network.vpc.id
}

resource "google_compute_router_nat" "nat" {
  name                               = "${var.network_name}-nat-${var.environment}"
  project                            = var.project_id
  region                             = var.region
  router                             = google_compute_router.router.name
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

# Private Service Access: a reserved internal range peered with Google's
# service-producer network. Cloud SQL (WO-003) and Memorystore Redis (WO-004)
# both require this connection to expose private IPs inside the VPC.
resource "google_compute_global_address" "psa_range" {
  name          = "${var.network_name}-psa-${var.environment}"
  project       = var.project_id
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = var.psa_prefix_length
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "psa" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.psa_range.name]
}
