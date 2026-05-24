locals {
  # Per-queue dispatch rate limits (AC: file 10/s, embedding 5/s, insight 2/s).
  queues = {
    "file-processing"      = { rate = 10, concurrent = 100 }
    "embedding-generation" = { rate = 5, concurrent = 50 }
    "insight-analysis"     = { rate = 2, concurrent = 20 }
  }

  # Flatten {queue x member} into a unique-keyed map for IAM bindings. Keys are
  # static (known at plan) so for_each is stable.
  iam_pairs = merge([
    for qk in keys(local.queues) : {
      for m in var.enqueuer_members : "${qk}::${m}" => { queue_key = qk, member = m }
    }
  ]...)
}

resource "google_cloud_tasks_queue" "queues" {
  for_each = local.queues

  name     = "boba-${each.key}-${var.environment}"
  project  = var.project_id
  location = var.region

  rate_limits {
    max_dispatches_per_second = each.value.rate
    max_concurrent_dispatches = each.value.concurrent
  }

  retry_config {
    max_attempts  = var.max_attempts
    min_backoff   = "${var.min_backoff_seconds}s"
    max_backoff   = "${var.max_backoff_seconds}s"
    max_doublings = var.max_doublings
  }
}

# Holding queue for tasks that exhaust their retries. Cloud Tasks has no native
# dead-letter routing, so handlers re-enqueue terminally-failed tasks here for
# inspection/replay (max_attempts = 1 keeps it a terminal sink).
resource "google_cloud_tasks_queue" "dead_letter" {
  name     = "boba-dead-letter-${var.environment}"
  project  = var.project_id
  location = var.region

  rate_limits {
    max_dispatches_per_second = 1
    max_concurrent_dispatches = 5
  }

  retry_config {
    max_attempts = 1
  }
}

# Allow the API gateway and worker pods (via Workload Identity) to enqueue tasks.
resource "google_cloud_tasks_queue_iam_member" "enqueuers" {
  for_each = local.iam_pairs

  project  = var.project_id
  location = var.region
  name     = google_cloud_tasks_queue.queues[each.value.queue_key].name
  role     = "roles/cloudtasks.enqueuer"
  member   = each.value.member
}

resource "google_cloud_tasks_queue_iam_member" "dead_letter_enqueuers" {
  for_each = toset(var.enqueuer_members)

  project  = var.project_id
  location = var.region
  name     = google_cloud_tasks_queue.dead_letter.name
  role     = "roles/cloudtasks.enqueuer"
  member   = each.value
}
