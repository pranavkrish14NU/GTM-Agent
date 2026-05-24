locals {
  # 30-day rolling SLO window in hours.
  slo_period_hours = 720

  # Burn-rate thresholds (Google SRE Workbook §5):
  #   fast burn:  2% of monthly budget consumed in fast_burn_lookback_seconds
  #   slow burn:  5% of monthly budget consumed in slow_burn_lookback_seconds
  # For a 99.9% SLO the default values resolve to 14.4× and 6.0×.
  fast_burn_rate_threshold = 0.02 * (local.slo_period_hours / (var.fast_burn_lookback_seconds / 3600.0))
  slow_burn_rate_threshold = 0.05 * (local.slo_period_hours / (var.slow_burn_lookback_seconds / 3600.0))

  # Combined list of notification channel IDs (email always present; Slack optional).
  notification_channels = concat(
    [google_monitoring_notification_channel.email.id],
    google_monitoring_notification_channel.slack[*].id,
  )

  # Reusable label filter fragments for common resource types.
  lb_project_filter  = "resource.labels.project_id=\"${var.project_id}\""
  gke_project_filter = "resource.labels.project_id=\"${var.project_id}\""
  sql_project_filter = "resource.labels.project_id=\"${var.project_id}\""
}

# ---------------------------------------------------------------------------
# Notification channels
# ---------------------------------------------------------------------------

# Email alert channel — always created.
resource "google_monitoring_notification_channel" "email" {
  display_name = "BOBA Email Alerts (${var.environment})"
  type         = "email"
  project      = var.project_id

  labels = {
    email_address = var.notification_email
  }
}

# Slack/webhook channel — created only when a channel name is supplied.
resource "google_monitoring_notification_channel" "slack" {
  count        = var.slack_channel_name != "" ? 1 : 0
  display_name = "BOBA Slack Alerts (${var.environment})"
  type         = "slack"
  project      = var.project_id

  labels = {
    channel_name = var.slack_channel_name
  }

  sensitive_labels {
    auth_token = var.slack_auth_token
  }
}

# ---------------------------------------------------------------------------
# Custom monitoring service — basis for SLO definitions.
# One service covers the BOBA API tier; all SLOs are attached to this service.
# ---------------------------------------------------------------------------
resource "google_monitoring_custom_service" "api" {
  service_id   = "boba-api-${var.environment}"
  display_name = "BOBA API Service (${var.environment})"
  project      = var.project_id
}

# ---------------------------------------------------------------------------
# SLO 1: API Availability >= 99.9%  (REQ-020 / AC: availability 99.9%)
# Request-based SLI: good = HTTP 2xx from the HTTPS LB rule.
# ---------------------------------------------------------------------------
resource "google_monitoring_slo" "api_availability" {
  service      = google_monitoring_custom_service.api.service_id
  slo_id       = "api-availability-${var.environment}"
  display_name = "API Availability >= 99.9% (${var.environment})"
  project      = var.project_id

  goal                = 0.999
  rolling_period_days = 30

  request_based_sli {
    good_total_ratio {
      # Good requests: HTTP 2xx responses from the GKE Ingress load balancer.
      good_service_filter = join(" AND ", [
        "metric.type=\"loadbalancing.googleapis.com/https/request_count\"",
        "resource.type=\"https_lb_rule\"",
        local.lb_project_filter,
        "metric.labels.response_code_class=\"200\"",
      ])
      # Total requests: all responses from the same LB rule.
      total_service_filter = join(" AND ", [
        "metric.type=\"loadbalancing.googleapis.com/https/request_count\"",
        "resource.type=\"https_lb_rule\"",
        local.lb_project_filter,
      ])
    }
  }
}

# ---------------------------------------------------------------------------
# SLO 2: API Latency p95 <= 500ms  (REQ-020 / AC: API latency p95 <500ms)
# Window-based SLI: a 60-second window is "good" when mean backend latency
# is under 500ms. Approximates the p95 target at the window granularity.
# ---------------------------------------------------------------------------
resource "google_monitoring_slo" "api_latency" {
  service      = google_monitoring_custom_service.api.service_id
  slo_id       = "api-latency-p95-${var.environment}"
  display_name = "API Latency p95 <= 500ms (${var.environment})"
  project      = var.project_id

  goal                = 0.999
  rolling_period_days = 30

  windows_based_sli {
    window_period = "60s"

    metric_mean_in_range {
      time_series = join(" AND ", [
        "metric.type=\"loadbalancing.googleapis.com/https/backend_latencies\"",
        "resource.type=\"https_lb_rule\"",
        local.lb_project_filter,
      ])
      range {
        min = 0
        max = 500 # milliseconds
      }
    }
  }
}

# ---------------------------------------------------------------------------
# SLO 3: Search Latency p95 <= 2s  (REQ-020 / AC: search latency p95 <2s)
# The 2000ms threshold accommodates LLM synthesis in the RAG pipeline.
# ---------------------------------------------------------------------------
resource "google_monitoring_slo" "search_latency" {
  service      = google_monitoring_custom_service.api.service_id
  slo_id       = "search-latency-p95-${var.environment}"
  display_name = "Search Latency p95 <= 2s (${var.environment})"
  project      = var.project_id

  goal                = 0.999
  rolling_period_days = 30

  windows_based_sli {
    window_period = "60s"

    metric_mean_in_range {
      time_series = join(" AND ", [
        "metric.type=\"loadbalancing.googleapis.com/https/backend_latencies\"",
        "resource.type=\"https_lb_rule\"",
        local.lb_project_filter,
      ])
      range {
        min = 0
        max = 2000 # milliseconds — 2 s p95 target for RAG / Ask BOBA
      }
    }
  }
}

# ---------------------------------------------------------------------------
# Alerting policies — SLO burn-rate (fast + slow) per SLO.
#
# Pattern (Google SRE Workbook §5 §6.1):
#   • Fast burn: 1-hour window, burn rate > 14.4× (2% budget / 1 h)
#   • Slow burn: 6-hour window, burn rate > 6×  (5% budget / 6 h)
# Both conditions are ORed within a single policy so one alert fires
# regardless of which burn pattern is detected first.
# ---------------------------------------------------------------------------

resource "google_monitoring_alert_policy" "api_availability_burn_rate" {
  display_name          = "BOBA SLO: API Availability Burn Rate (${var.environment})"
  project               = var.project_id
  combiner              = "OR"
  notification_channels = local.notification_channels

  # Fast burn — 2% budget in 1 hour.
  conditions {
    display_name = "Fast burn: >2% error budget in ${var.fast_burn_lookback_seconds}s"

    condition_threshold {
      filter          = "select_slo_burn_rate(\"${google_monitoring_slo.api_availability.id}\", ${var.fast_burn_lookback_seconds})"
      comparison      = "COMPARISON_GT"
      threshold_value = local.fast_burn_rate_threshold
      duration        = "0s"

      aggregations {
        alignment_period   = "${var.fast_burn_lookback_seconds}s"
        per_series_aligner = "ALIGN_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }

  # Slow burn — 5% budget in 6 hours.
  conditions {
    display_name = "Slow burn: >5% error budget in ${var.slow_burn_lookback_seconds}s"

    condition_threshold {
      filter          = "select_slo_burn_rate(\"${google_monitoring_slo.api_availability.id}\", ${var.slow_burn_lookback_seconds})"
      comparison      = "COMPARISON_GT"
      threshold_value = local.slow_burn_rate_threshold
      duration        = "0s"

      aggregations {
        alignment_period   = "${var.slow_burn_lookback_seconds}s"
        per_series_aligner = "ALIGN_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }
}

resource "google_monitoring_alert_policy" "api_latency_burn_rate" {
  display_name          = "BOBA SLO: API Latency Burn Rate (${var.environment})"
  project               = var.project_id
  combiner              = "OR"
  notification_channels = local.notification_channels

  conditions {
    display_name = "Fast burn: >2% latency budget in ${var.fast_burn_lookback_seconds}s"

    condition_threshold {
      filter          = "select_slo_burn_rate(\"${google_monitoring_slo.api_latency.id}\", ${var.fast_burn_lookback_seconds})"
      comparison      = "COMPARISON_GT"
      threshold_value = local.fast_burn_rate_threshold
      duration        = "0s"

      aggregations {
        alignment_period   = "${var.fast_burn_lookback_seconds}s"
        per_series_aligner = "ALIGN_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }

  conditions {
    display_name = "Slow burn: >5% latency budget in ${var.slow_burn_lookback_seconds}s"

    condition_threshold {
      filter          = "select_slo_burn_rate(\"${google_monitoring_slo.api_latency.id}\", ${var.slow_burn_lookback_seconds})"
      comparison      = "COMPARISON_GT"
      threshold_value = local.slow_burn_rate_threshold
      duration        = "0s"

      aggregations {
        alignment_period   = "${var.slow_burn_lookback_seconds}s"
        per_series_aligner = "ALIGN_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }
}

resource "google_monitoring_alert_policy" "search_latency_burn_rate" {
  display_name          = "BOBA SLO: Search Latency Burn Rate (${var.environment})"
  project               = var.project_id
  combiner              = "OR"
  notification_channels = local.notification_channels

  conditions {
    display_name = "Fast burn: >2% search latency budget in ${var.fast_burn_lookback_seconds}s"

    condition_threshold {
      filter          = "select_slo_burn_rate(\"${google_monitoring_slo.search_latency.id}\", ${var.fast_burn_lookback_seconds})"
      comparison      = "COMPARISON_GT"
      threshold_value = local.fast_burn_rate_threshold
      duration        = "0s"

      aggregations {
        alignment_period   = "${var.fast_burn_lookback_seconds}s"
        per_series_aligner = "ALIGN_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }

  conditions {
    display_name = "Slow burn: >5% search latency budget in ${var.slow_burn_lookback_seconds}s"

    condition_threshold {
      filter          = "select_slo_burn_rate(\"${google_monitoring_slo.search_latency.id}\", ${var.slow_burn_lookback_seconds})"
      comparison      = "COMPARISON_GT"
      threshold_value = local.slow_burn_rate_threshold
      duration        = "0s"

      aggregations {
        alignment_period   = "${var.slow_burn_lookback_seconds}s"
        per_series_aligner = "ALIGN_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }
}

# ---------------------------------------------------------------------------
# Dashboards
# Three dashboards cover all required metric categories (AC: REQ-020):
#   1. API Service  — request rate, latency p50/p95/p99, error rate,
#                     GKE pod CPU / memory / restart count
#   2. Worker       — queue depth, task rate, failure rate,
#                     GKE worker CPU / memory / restart count
#   3. Database     — connection count, query latency, replication lag
#
# Tile layout uses mosaicLayout with a 12-column grid; each tile is 6×4
# unless noted otherwise.
# ---------------------------------------------------------------------------

# Helper local: shared xyChart aggregation builder.
locals {
  # Convenience function for a standard 60-second ALIGN_RATE aggregation.
  agg_rate = {
    alignmentPeriod    = "60s"
    perSeriesAligner   = "ALIGN_RATE"
    crossSeriesReducer = "REDUCE_SUM"
    groupByFields      = []
  }
  agg_mean = {
    alignmentPeriod    = "60s"
    perSeriesAligner   = "ALIGN_MEAN"
    crossSeriesReducer = "REDUCE_MEAN"
    groupByFields      = []
  }
  agg_p50 = {
    alignmentPeriod  = "60s"
    perSeriesAligner = "ALIGN_PERCENTILE_50"
  }
  agg_p95 = {
    alignmentPeriod  = "60s"
    perSeriesAligner = "ALIGN_PERCENTILE_95"
  }
  agg_p99 = {
    alignmentPeriod  = "60s"
    perSeriesAligner = "ALIGN_PERCENTILE_99"
  }
}

resource "google_monitoring_dashboard" "api_service" {
  project = var.project_id

  dashboard_json = jsonencode({
    displayName = "BOBA API Service (${var.environment})"
    mosaicLayout = {
      columns = 12
      tiles = [
        # Row 0: request rate + error rate
        {
          xPos   = 0
          yPos   = 0
          width  = 6
          height = 4
          widget = {
            title = "Request Rate (req/s)"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"loadbalancing.googleapis.com/https/request_count\" resource.type=\"https_lb_rule\" ${local.lb_project_filter}"
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_RATE"
                      crossSeriesReducer = "REDUCE_SUM"
                      groupByFields      = []
                    }
                  }
                }
                plotType   = "LINE"
                targetAxis = "Y1"
              }]
              yAxis = { label = "req/s", scale = "LINEAR" }
            }
          }
        },
        {
          xPos   = 6
          yPos   = 0
          width  = 6
          height = 4
          widget = {
            title = "Error Rate — 5xx (req/s)"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"loadbalancing.googleapis.com/https/request_count\" resource.type=\"https_lb_rule\" ${local.lb_project_filter} metric.labels.response_code_class=\"500\""
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_RATE"
                      crossSeriesReducer = "REDUCE_SUM"
                      groupByFields      = []
                    }
                  }
                }
                plotType   = "LINE"
                targetAxis = "Y1"
              }]
              yAxis = { label = "errors/s", scale = "LINEAR" }
            }
          }
        },
        # Row 1: latency p50 / p95 / p99
        {
          xPos   = 0
          yPos   = 4
          width  = 4
          height = 4
          widget = {
            title = "Backend Latency p50 (ms)"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter      = "metric.type=\"loadbalancing.googleapis.com/https/backend_latencies\" resource.type=\"https_lb_rule\" ${local.lb_project_filter}"
                    aggregation = { alignmentPeriod = "60s", perSeriesAligner = "ALIGN_PERCENTILE_50" }
                  }
                }
                plotType   = "LINE"
                targetAxis = "Y1"
              }]
              yAxis = { label = "ms", scale = "LINEAR" }
            }
          }
        },
        {
          xPos   = 4
          yPos   = 4
          width  = 4
          height = 4
          widget = {
            title = "Backend Latency p95 (ms)"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter      = "metric.type=\"loadbalancing.googleapis.com/https/backend_latencies\" resource.type=\"https_lb_rule\" ${local.lb_project_filter}"
                    aggregation = { alignmentPeriod = "60s", perSeriesAligner = "ALIGN_PERCENTILE_95" }
                  }
                }
                plotType   = "LINE"
                targetAxis = "Y1"
              }]
              yAxis = { label = "ms", scale = "LINEAR" }
            }
          }
        },
        {
          xPos   = 8
          yPos   = 4
          width  = 4
          height = 4
          widget = {
            title = "Backend Latency p99 (ms)"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter      = "metric.type=\"loadbalancing.googleapis.com/https/backend_latencies\" resource.type=\"https_lb_rule\" ${local.lb_project_filter}"
                    aggregation = { alignmentPeriod = "60s", perSeriesAligner = "ALIGN_PERCENTILE_99" }
                  }
                }
                plotType   = "LINE"
                targetAxis = "Y1"
              }]
              yAxis = { label = "ms", scale = "LINEAR" }
            }
          }
        },
        # Row 2: GKE pod CPU / memory / restarts
        {
          xPos   = 0
          yPos   = 8
          width  = 4
          height = 4
          widget = {
            title = "GKE Pod CPU Utilization"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"kubernetes.io/container/cpu/limit_utilization\" resource.type=\"k8s_container\" ${local.gke_project_filter}"
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_MEAN"
                      crossSeriesReducer = "REDUCE_MEAN"
                      groupByFields      = []
                    }
                  }
                }
                plotType   = "LINE"
                targetAxis = "Y1"
              }]
              yAxis = { label = "utilization", scale = "LINEAR" }
            }
          }
        },
        {
          xPos   = 4
          yPos   = 8
          width  = 4
          height = 4
          widget = {
            title = "GKE Pod Memory Utilization"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"kubernetes.io/container/memory/limit_utilization\" resource.type=\"k8s_container\" ${local.gke_project_filter}"
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_MEAN"
                      crossSeriesReducer = "REDUCE_MEAN"
                      groupByFields      = []
                    }
                  }
                }
                plotType   = "LINE"
                targetAxis = "Y1"
              }]
              yAxis = { label = "utilization", scale = "LINEAR" }
            }
          }
        },
        {
          xPos   = 8
          yPos   = 8
          width  = 4
          height = 4
          widget = {
            title = "GKE Pod Restart Count"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"kubernetes.io/container/restart_count\" resource.type=\"k8s_container\" ${local.gke_project_filter}"
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_RATE"
                      crossSeriesReducer = "REDUCE_SUM"
                      groupByFields      = ["resource.labels.\"container_name\""]
                    }
                  }
                }
                plotType   = "LINE"
                targetAxis = "Y1"
              }]
              yAxis = { label = "restarts/s", scale = "LINEAR" }
            }
          }
        },
      ]
    }
  })
}

resource "google_monitoring_dashboard" "worker_service" {
  project = var.project_id

  dashboard_json = jsonencode({
    displayName = "BOBA Worker Service (${var.environment})"
    mosaicLayout = {
      columns = 12
      tiles = [
        # Row 0: queue depth + task rate
        {
          xPos   = 0
          yPos   = 0
          width  = 6
          height = 4
          widget = {
            title = "Cloud Tasks Queue Depth"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"cloudtasks.googleapis.com/queue/depth\" resource.type=\"cloud_tasks_queue\" ${local.gke_project_filter}"
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_MEAN"
                      crossSeriesReducer = "REDUCE_SUM"
                      groupByFields      = ["resource.labels.\"queue_id\""]
                    }
                  }
                }
                plotType   = "LINE"
                targetAxis = "Y1"
              }]
              yAxis = { label = "tasks", scale = "LINEAR" }
            }
          }
        },
        {
          xPos   = 6
          yPos   = 0
          width  = 6
          height = 4
          widget = {
            title = "Task Processing Rate (attempts/s)"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"cloudtasks.googleapis.com/queue/task_attempt_count\" resource.type=\"cloud_tasks_queue\" ${local.gke_project_filter}"
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_RATE"
                      crossSeriesReducer = "REDUCE_SUM"
                      groupByFields      = []
                    }
                  }
                }
                plotType   = "LINE"
                targetAxis = "Y1"
              }]
              yAxis = { label = "attempts/s", scale = "LINEAR" }
            }
          }
        },
        # Row 1: failed tasks + worker CPU
        {
          xPos   = 0
          yPos   = 4
          width  = 6
          height = 4
          widget = {
            title = "Failed Task Rate (failures/s)"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"cloudtasks.googleapis.com/queue/task_attempt_failures\" resource.type=\"cloud_tasks_queue\" ${local.gke_project_filter}"
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_RATE"
                      crossSeriesReducer = "REDUCE_SUM"
                      groupByFields      = []
                    }
                  }
                }
                plotType   = "LINE"
                targetAxis = "Y1"
              }]
              yAxis = { label = "failures/s", scale = "LINEAR" }
            }
          }
        },
        {
          xPos   = 6
          yPos   = 4
          width  = 6
          height = 4
          widget = {
            title = "Worker GKE CPU Utilization"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"kubernetes.io/container/cpu/limit_utilization\" resource.type=\"k8s_container\" ${local.gke_project_filter} resource.labels.container_name=\"worker\""
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_MEAN"
                      crossSeriesReducer = "REDUCE_MEAN"
                      groupByFields      = []
                    }
                  }
                }
                plotType   = "LINE"
                targetAxis = "Y1"
              }]
              yAxis = { label = "utilization", scale = "LINEAR" }
            }
          }
        },
        # Row 2: worker memory + restarts
        {
          xPos   = 0
          yPos   = 8
          width  = 6
          height = 4
          widget = {
            title = "Worker GKE Memory Utilization"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"kubernetes.io/container/memory/limit_utilization\" resource.type=\"k8s_container\" ${local.gke_project_filter} resource.labels.container_name=\"worker\""
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_MEAN"
                      crossSeriesReducer = "REDUCE_MEAN"
                      groupByFields      = []
                    }
                  }
                }
                plotType   = "LINE"
                targetAxis = "Y1"
              }]
              yAxis = { label = "utilization", scale = "LINEAR" }
            }
          }
        },
        {
          xPos   = 6
          yPos   = 8
          width  = 6
          height = 4
          widget = {
            title = "Worker Pod Restart Count"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"kubernetes.io/container/restart_count\" resource.type=\"k8s_container\" ${local.gke_project_filter} resource.labels.container_name=\"worker\""
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_RATE"
                      crossSeriesReducer = "REDUCE_SUM"
                      groupByFields      = []
                    }
                  }
                }
                plotType   = "LINE"
                targetAxis = "Y1"
              }]
              yAxis = { label = "restarts/s", scale = "LINEAR" }
            }
          }
        },
      ]
    }
  })
}

resource "google_monitoring_dashboard" "database" {
  project = var.project_id

  dashboard_json = jsonencode({
    displayName = "BOBA Database (${var.environment})"
    mosaicLayout = {
      columns = 12
      tiles = [
        # Row 0: connections + query latency p95
        {
          xPos   = 0
          yPos   = 0
          width  = 6
          height = 4
          widget = {
            title = "Cloud SQL Active Connections"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"cloudsql.googleapis.com/database/network/connections\" resource.type=\"cloudsql_database\" ${local.sql_project_filter}"
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_MEAN"
                      crossSeriesReducer = "REDUCE_SUM"
                      groupByFields      = []
                    }
                  }
                }
                plotType   = "LINE"
                targetAxis = "Y1"
              }]
              yAxis = { label = "connections", scale = "LINEAR" }
            }
          }
        },
        {
          xPos   = 6
          yPos   = 0
          width  = 6
          height = 4
          widget = {
            title = "Cloud SQL Query Latency p95 (ms)"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter      = "metric.type=\"cloudsql.googleapis.com/database/query/latency\" resource.type=\"cloudsql_database\" ${local.sql_project_filter}"
                    aggregation = { alignmentPeriod = "60s", perSeriesAligner = "ALIGN_PERCENTILE_95" }
                  }
                }
                plotType   = "LINE"
                targetAxis = "Y1"
              }]
              yAxis = { label = "ms", scale = "LINEAR" }
            }
          }
        },
        # Row 1: replication lag + DB CPU
        {
          xPos   = 0
          yPos   = 4
          width  = 6
          height = 4
          widget = {
            title = "Cloud SQL Replication Lag (s)"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"cloudsql.googleapis.com/database/replication/replica_lag\" resource.type=\"cloudsql_database\" ${local.sql_project_filter}"
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_MEAN"
                      crossSeriesReducer = "REDUCE_MAX"
                      groupByFields      = []
                    }
                  }
                }
                plotType   = "LINE"
                targetAxis = "Y1"
              }]
              yAxis = { label = "seconds", scale = "LINEAR" }
            }
          }
        },
        {
          xPos   = 6
          yPos   = 4
          width  = 6
          height = 4
          widget = {
            title = "Cloud SQL CPU Utilization"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"cloudsql.googleapis.com/database/cpu/utilization\" resource.type=\"cloudsql_database\" ${local.sql_project_filter}"
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_MEAN"
                      crossSeriesReducer = "REDUCE_MEAN"
                      groupByFields      = []
                    }
                  }
                }
                plotType   = "LINE"
                targetAxis = "Y1"
              }]
              yAxis = { label = "utilization", scale = "LINEAR" }
            }
          }
        },
      ]
    }
  })
}
