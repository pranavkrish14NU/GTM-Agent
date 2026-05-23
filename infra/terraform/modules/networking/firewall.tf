# Least-privilege ingress. GCP applies an implied deny-all ingress at the
# lowest priority; the rules below open only what BOBA needs and an explicit
# deny-all rule makes the default posture auditable.

# East-west traffic between app/data subnets and GKE pod/service ranges.
resource "google_compute_firewall" "allow_internal" {
  name      = "${var.network_name}-allow-internal-${var.environment}"
  project   = var.project_id
  network   = google_compute_network.vpc.id
  direction = "INGRESS"
  priority  = 1000

  allow {
    protocol = "tcp"
  }
  allow {
    protocol = "udp"
  }
  allow {
    protocol = "icmp"
  }

  source_ranges = [
    var.app_subnet_cidr,
    var.data_subnet_cidr,
    var.pods_secondary_cidr,
    var.services_secondary_cidr,
  ]

  log_config {
    metadata = "INCLUDE_ALL_METADATA"
  }
}

# External HTTPS load balancer -> app-tier backends. Sources are the Google
# Front End / health-check ranges that proxy public 443 traffic.
resource "google_compute_firewall" "allow_lb_to_app" {
  name      = "${var.network_name}-allow-lb-https-${var.environment}"
  project   = var.project_id
  network   = google_compute_network.vpc.id
  direction = "INGRESS"
  priority  = 1000

  allow {
    protocol = "tcp"
    ports    = var.app_ingress_ports
  }

  source_ranges = var.lb_source_ranges
  target_tags   = var.app_target_tags

  log_config {
    metadata = "INCLUDE_ALL_METADATA"
  }
}

# Administrative SSH via IAP TCP forwarding only — no public SSH exposure.
resource "google_compute_firewall" "allow_iap_ssh" {
  count = var.enable_iap_ssh ? 1 : 0

  name      = "${var.network_name}-allow-iap-ssh-${var.environment}"
  project   = var.project_id
  network   = google_compute_network.vpc.id
  direction = "INGRESS"
  priority  = 1000

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  # Fixed range published by Google for Identity-Aware Proxy TCP forwarding.
  source_ranges = ["35.235.240.0/20"]
  target_tags   = var.app_target_tags

  log_config {
    metadata = "INCLUDE_ALL_METADATA"
  }
}

# Explicit catch-all deny just above the implied rule, so "deny everything
# else" is visible in config and emits flow logs for denied attempts.
resource "google_compute_firewall" "deny_all_ingress" {
  name      = "${var.network_name}-deny-all-ingress-${var.environment}"
  project   = var.project_id
  network   = google_compute_network.vpc.id
  direction = "INGRESS"
  priority  = 65534

  deny {
    protocol = "all"
  }

  source_ranges = ["0.0.0.0/0"]

  log_config {
    metadata = "INCLUDE_ALL_METADATA"
  }
}
