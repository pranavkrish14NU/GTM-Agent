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
