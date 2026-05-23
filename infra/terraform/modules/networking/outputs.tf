output "network_id" {
  description = "Fully-qualified VPC network ID."
  value       = google_compute_network.vpc.id
}

output "network_name" {
  description = "VPC network name."
  value       = google_compute_network.vpc.name
}

output "network_self_link" {
  description = "VPC network self link, used by GKE and other consumers."
  value       = google_compute_network.vpc.self_link
}

output "app_subnet_id" {
  description = "App-tier subnet ID."
  value       = google_compute_subnetwork.app.id
}

output "app_subnet_self_link" {
  description = "App-tier subnet self link (GKE node subnet)."
  value       = google_compute_subnetwork.app.self_link
}

output "data_subnet_id" {
  description = "Data-tier subnet ID."
  value       = google_compute_subnetwork.data.id
}

output "data_subnet_self_link" {
  description = "Data-tier subnet self link."
  value       = google_compute_subnetwork.data.self_link
}

output "pods_secondary_range_name" {
  description = "Secondary range name for GKE pods (consumed by WO-002)."
  value       = google_compute_subnetwork.app.secondary_ip_range[0].range_name
}

output "services_secondary_range_name" {
  description = "Secondary range name for GKE services (consumed by WO-002)."
  value       = google_compute_subnetwork.app.secondary_ip_range[1].range_name
}

output "nat_name" {
  description = "Cloud NAT name."
  value       = google_compute_router_nat.nat.name
}

output "psa_range_name" {
  description = "Reserved Private Service Access range name (consumed by WO-003/WO-004)."
  value       = google_compute_global_address.psa_range.name
}

output "private_vpc_connection_peering" {
  description = "Service networking peering created for Private Service Access."
  value       = google_service_networking_connection.psa.peering
}
