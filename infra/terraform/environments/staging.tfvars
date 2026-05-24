# Staging environment. Apply with:
#   terraform workspace select staging || terraform workspace new staging
#   terraform plan -var-file=environments/staging.tfvars
project_id  = "boba-staging-000000" # replace with the real staging project ID
region      = "us-central1"
environment = "staging"

network_name            = "boba-vpc"
app_subnet_cidr         = "10.110.0.0/20"
data_subnet_cidr        = "10.120.0.0/20"
pods_secondary_cidr     = "10.132.0.0/14"
services_secondary_cidr = "10.136.0.0/20"

enable_iap_ssh = true

# GKE (WO-002)
gke_master_ipv4_cidr        = "172.16.1.0/28"
gke_enable_private_endpoint = true
gke_deletion_protection     = false
# Replace with your CI/CD runner ranges (must be reachable to the private control plane).
gke_master_authorized_networks = [
  { cidr_block = "10.110.0.0/20", display_name = "staging-app-subnet" },
]

# Cloud SQL (WO-003)
cloud_sql_tier                = "db-custom-2-7680"
cloud_sql_deletion_protection = false

# Redis (WO-004)
redis_memory_size_gb = 2

# Monitoring / Observability (WO-012)
monitoring_notification_email = "ops-staging@boba.example.com" # replace with real ops email
monitoring_slack_channel_name = "#ops-alerts-staging"
# monitoring_slack_auth_token managed via Secret Manager / CI env var
