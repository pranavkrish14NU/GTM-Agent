mock_provider "google" {}
mock_provider "random" {}

variables {
  project_id  = "boba-test"
  region      = "us-central1"
  environment = "dev"
  network     = "projects/boba-test/global/networks/boba-vpc-dev"
}

run "postgres_15_plus" {
  command = plan

  assert {
    condition     = google_sql_database_instance.primary.database_version == "POSTGRES_15"
    error_message = "Primary must be PostgreSQL 15+ (pgvector support)."
  }
}

run "private_ip_only_and_ssl_enforced" {
  command = plan

  assert {
    condition     = google_sql_database_instance.primary.settings[0].ip_configuration[0].ipv4_enabled == false
    error_message = "Primary must not have a public IP."
  }

  assert {
    condition     = google_sql_database_instance.primary.settings[0].ip_configuration[0].ssl_mode == "ENCRYPTED_ONLY"
    error_message = "Primary must enforce SSL/TLS."
  }

  assert {
    condition     = google_sql_database_instance.primary.settings[0].ip_configuration[0].private_network == var.network
    error_message = "Primary must attach to the VPC for private connectivity."
  }
}

run "ha_and_backups_with_pitr" {
  command = plan

  assert {
    condition     = google_sql_database_instance.primary.settings[0].availability_type == "REGIONAL"
    error_message = "Primary must be REGIONAL (HA)."
  }

  assert {
    condition     = google_sql_database_instance.primary.settings[0].backup_configuration[0].enabled == true
    error_message = "Automated backups must be enabled."
  }

  assert {
    condition     = google_sql_database_instance.primary.settings[0].backup_configuration[0].point_in_time_recovery_enabled == true
    error_message = "Point-in-time recovery must be enabled."
  }

  assert {
    condition     = google_sql_database_instance.primary.settings[0].backup_configuration[0].backup_retention_settings[0].retained_backups == 7
    error_message = "Backups must retain 7 days."
  }
}

run "max_connections_flag" {
  command = plan

  assert {
    condition     = anytrue([for f in google_sql_database_instance.primary.settings[0].database_flags : f.name == "max_connections" && f.value == "100"])
    error_message = "max_connections must be set to 100 (PgBouncer pools beneath this)."
  }
}

run "read_replica_present" {
  command = plan

  assert {
    condition     = google_sql_database_instance.replica.replica_configuration[0].failover_target == false
    error_message = "A read replica (non-failover) must be provisioned."
  }

  assert {
    condition     = google_sql_database_instance.replica.settings[0].ip_configuration[0].ipv4_enabled == false
    error_message = "Replica must also be private-IP only."
  }
}

run "credentials_secret_created" {
  command = plan

  assert {
    condition     = google_secret_manager_secret.db.secret_id == "boba-db-credentials-dev"
    error_message = "DB credentials secret must be created in Secret Manager."
  }
}

run "rejects_old_postgres" {
  command = plan

  variables {
    database_version = "POSTGRES_13"
  }

  expect_failures = [
    var.database_version,
  ]
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
