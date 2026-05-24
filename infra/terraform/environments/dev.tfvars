# Dev environment. Apply with:
#   terraform workspace select dev || terraform workspace new dev
#   terraform plan -var-file=environments/dev.tfvars
project_id  = "boba-dev-000000" # replace with the real dev project ID
region      = "us-central1"
environment = "dev"

network_name            = "boba-vpc"
app_subnet_cidr         = "10.10.0.0/20"
data_subnet_cidr        = "10.20.0.0/20"
pods_secondary_cidr     = "10.32.0.0/14"
services_secondary_cidr = "10.36.0.0/20"

enable_iap_ssh = true

# GKE (WO-002)
gke_master_ipv4_cidr        = "172.16.0.0/28"
gke_enable_private_endpoint = true
gke_deletion_protection     = false
# Replace with your CI/CD runner ranges (must be reachable to the private control plane).
gke_master_authorized_networks = [
  { cidr_block = "10.10.0.0/20", display_name = "dev-app-subnet" },
]

# Cloud SQL (WO-003)
cloud_sql_tier                = "db-custom-1-3840"
cloud_sql_deletion_protection = false

# Redis (WO-004)
redis_memory_size_gb = 1

# Monitoring / Observability (WO-012)
monitoring_notification_email = "ops-dev@boba.example.com" # replace with real ops email
monitoring_slack_channel_name = ""                          # set to Slack channel name to enable (e.g. "#ops-alerts-dev")
# monitoring_slack_auth_token managed via Secret Manager / CI env var
