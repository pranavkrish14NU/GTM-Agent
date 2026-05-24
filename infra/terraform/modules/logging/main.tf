locals {
  retention_seconds    = var.audit_log_retention_days * 24 * 60 * 60
  bucket_name          = "boba-audit-logs-${var.environment}-${var.project_id}"
  access_log_bucket    = "boba-audit-access-logs-${var.environment}-${var.project_id}"
}

# ---------------------------------------------------------------------------
# Access-log bucket — receives GCS access logs for the audit bucket.
# CKV_GCP_63: audit bucket must NOT log to itself; use a separate bucket.
# CKV_GCP_62 suppressed: this IS the access-log sink bucket.  Logging its own
# access would require a third bucket which itself needs a fourth, etc.
# The terminal bucket in the logging chain is an accepted industry exception.
# ---------------------------------------------------------------------------
resource "google_storage_bucket" "audit_access_logs" {
  #checkov:skip=CKV_GCP_62:Terminal access-log sink bucket. Logging its own access would require another bucket (infinite regression) and self-logging violates CKV_GCP_63.
  name     = local.access_log_bucket
  location = var.region
  project  = var.project_id

  force_destroy               = false
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  # CKV_GCP_78: Enable versioning on the access-log bucket too.
  versioning {
    enabled = true
  }
}

# ---------------------------------------------------------------------------
# Audit log storage bucket — 90-day retention (SOC 2 AC #3).
# ---------------------------------------------------------------------------
resource "google_storage_bucket" "audit_logs" {
  name     = local.bucket_name
  location = var.region
  project  = var.project_id

  # Prevent accidental deletion with logs inside.
  force_destroy = false

  # CKV_GCP_114: Block all public access — audit logs must never be public.
  public_access_prevention = "enforced"

  # Uniform bucket-level access — no legacy ACLs.
  uniform_bucket_level_access = true

  # CKV_GCP_78: Enable object versioning so previous log versions are recoverable.
  versioning {
    enabled = true
  }

  # CKV_GCP_62 + CKV_GCP_63: Log access to a SEPARATE dedicated bucket (not self).
  logging {
    log_bucket = google_storage_bucket.audit_access_logs.name
  }

  # Object-level retention: objects cannot be deleted before the retention window.
  # CKV2_GCP_4: Lock the retention policy (WORM) to prevent premature deletion.
  retention_policy {
    is_locked        = true
    retention_period = local.retention_seconds
  }

  # Auto-delete objects after the retention window has elapsed.
  lifecycle_rule {
    condition {
      age = var.audit_log_retention_days
    }
    action {
      type = "Delete"
    }
  }
}

# ---------------------------------------------------------------------------
# Log sink: route severity >= WARNING logs to the audit bucket.
# ---------------------------------------------------------------------------
resource "google_logging_project_sink" "audit_sink" {
  name        = "boba-audit-sink-${var.environment}"
  project     = var.project_id
  destination = "storage.googleapis.com/${google_storage_bucket.audit_logs.name}"

  # AC: route warning/error/critical logs for audit and compliance.
  filter = var.log_sink_filter

  # Each sink gets its own dedicated service account writer identity.
  unique_writer_identity = true
}

# Grant the sink's writer service account permission to create objects.
resource "google_storage_bucket_iam_member" "sink_writer" {
  bucket = google_storage_bucket.audit_logs.name
  role   = "roles/storage.objectCreator"
  member = google_logging_project_sink.audit_sink.writer_identity
}

# ---------------------------------------------------------------------------
# Log-based metric: error rate per service — AC #4.
# Counts log lines where jsonPayload.level == "error", labelled by service.
# ---------------------------------------------------------------------------
resource "google_logging_metric" "error_rate" {
  name    = "boba/error_rate_${var.environment}"
  project = var.project_id

  # Match structured JSON logs from GKE containers where level=error.
  filter = <<-EOT
    resource.type="k8s_container"
    jsonPayload.level="error"
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    display_name = "BOBA Error Rate per Service (${var.environment})"
    unit        = "1"
    labels {
      key         = "service"
      value_type  = "STRING"
      description = "Backend service name (e.g. api, worker)."
    }
  }

  # Extract the service label from the structured JSON payload.
  label_extractors = {
    "service" = "EXTRACT(jsonPayload.service)"
  }
}
