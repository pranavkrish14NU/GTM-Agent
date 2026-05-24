# Production environment. Apply with:
#   terraform workspace select production || terraform workspace new production
#   terraform plan -var-file=environments/production.tfvars
project_id  = "boba-prod-000000" # replace with the real production project ID
region      = "us-central1"
environment = "production"

network_name            = "boba-vpc"
app_subnet_cidr         = "10.210.0.0/20"
data_subnet_cidr        = "10.220.0.0/20"
pods_secondary_cidr     = "10.232.0.0/14"
services_secondary_cidr = "10.236.0.0/20"

# Production SSH is locked down; rely on a break-glass process instead of IAP SSH.
enable_iap_ssh = false

# GKE (WO-002)
gke_master_ipv4_cidr        = "172.16.2.0/28"
gke_enable_private_endpoint = true
gke_deletion_protection     = true
# Replace with your CI/CD runner ranges (must be reachable to the private control plane).
gke_master_authorized_networks = [
  { cidr_block = "10.210.0.0/20", display_name = "production-app-subnet" },
]

# Cloud SQL (WO-003)
cloud_sql_tier                = "db-custom-4-15360"
cloud_sql_deletion_protection = true

# Redis (WO-004)
redis_memory_size_gb = 4
