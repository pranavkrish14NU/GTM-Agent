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
