mock_provider "google" {}

variables {
  project_id       = "boba-test"
  region           = "us-central1"
  environment      = "dev"
  enqueuer_members = ["serviceAccount:boba-api-gw-dev@boba-test.iam.gserviceaccount.com"]
}

run "three_processing_queues" {
  command = plan

  assert {
    condition     = length(google_cloud_tasks_queue.queues) == 3
    error_message = "Exactly three processing queues must exist."
  }

  assert {
    condition     = google_cloud_tasks_queue.queues["file-processing"].name == "boba-file-processing-dev"
    error_message = "file-processing queue must be named per environment."
  }
}

run "per_queue_rate_limits" {
  command = plan

  assert {
    condition     = google_cloud_tasks_queue.queues["file-processing"].rate_limits[0].max_dispatches_per_second == 10
    error_message = "file-processing must dispatch at 10/s."
  }

  assert {
    condition     = google_cloud_tasks_queue.queues["embedding-generation"].rate_limits[0].max_dispatches_per_second == 5
    error_message = "embedding-generation must dispatch at 5/s."
  }

  assert {
    condition     = google_cloud_tasks_queue.queues["insight-analysis"].rate_limits[0].max_dispatches_per_second == 2
    error_message = "insight-analysis must dispatch at 2/s."
  }
}

run "retry_policy" {
  command = plan

  assert {
    condition     = google_cloud_tasks_queue.queues["file-processing"].retry_config[0].max_attempts == 5
    error_message = "Retry must allow max 5 attempts."
  }

  assert {
    condition     = google_cloud_tasks_queue.queues["file-processing"].retry_config[0].min_backoff == "10s"
    error_message = "Min backoff must be 10s."
  }

  assert {
    condition     = google_cloud_tasks_queue.queues["file-processing"].retry_config[0].max_backoff == "300s"
    error_message = "Max backoff must be 300s."
  }
}

run "dead_letter_queue" {
  command = plan

  assert {
    condition     = google_cloud_tasks_queue.dead_letter.name == "boba-dead-letter-dev"
    error_message = "A dead-letter queue must be provisioned."
  }

  assert {
    condition     = google_cloud_tasks_queue.dead_letter.retry_config[0].max_attempts == 1
    error_message = "Dead-letter queue must be a terminal sink (1 attempt)."
  }
}

run "enqueuer_iam_bindings" {
  command = plan

  # 3 queues x 1 member = 3 bindings on processing queues.
  assert {
    condition     = length(google_cloud_tasks_queue_iam_member.enqueuers) == 3
    error_message = "Each processing queue must grant enqueuer to each member."
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
