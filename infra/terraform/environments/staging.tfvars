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
