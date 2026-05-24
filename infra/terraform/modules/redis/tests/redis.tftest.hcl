mock_provider "google" {}

variables {
  project_id  = "boba-test"
  region      = "us-central1"
  environment = "dev"
  network     = "projects/boba-test/global/networks/boba-vpc-dev"
}

run "ha_tier_and_memory" {
  command = plan

  assert {
    condition     = google_redis_instance.this.tier == "STANDARD_HA"
    error_message = "Redis must use STANDARD_HA tier for automatic failover."
  }

  assert {
    condition     = google_redis_instance.this.memory_size_gb >= 1
    error_message = "Redis memory must be at least 1GB."
  }

  assert {
    condition     = google_redis_instance.this.redis_version == "REDIS_7_0"
    error_message = "Redis must be version 7.0+."
  }
}

run "private_and_secured" {
  command = plan

  assert {
    condition     = google_redis_instance.this.connect_mode == "PRIVATE_SERVICE_ACCESS"
    error_message = "Redis must connect via Private Service Access (private only)."
  }

  assert {
    condition     = google_redis_instance.this.authorized_network == var.network
    error_message = "Redis must be authorized on the VPC."
  }

  assert {
    condition     = google_redis_instance.this.auth_enabled == true
    error_message = "Redis AUTH must be enabled."
  }

  assert {
    condition     = google_redis_instance.this.transit_encryption_mode == "SERVER_AUTHENTICATION"
    error_message = "Redis in-transit TLS must be enabled."
  }
}

run "credentials_secret_created" {
  command = plan

  assert {
    condition     = google_secret_manager_secret.redis.secret_id == "boba-redis-credentials-dev"
    error_message = "Redis credentials secret must be created."
  }
}

run "production_sizing" {
  command = plan

  variables {
    environment    = "production"
    memory_size_gb = 4
  }

  assert {
    condition     = google_redis_instance.this.memory_size_gb == 4
    error_message = "Production Redis must be 4GB."
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

run "rejects_zero_memory" {
  command = plan

  variables {
    memory_size_gb = 0
  }

  expect_failures = [
    var.memory_size_gb,
  ]
}
