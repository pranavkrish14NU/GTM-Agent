output "queue_names" {
  description = "Map of logical queue key -> Cloud Tasks queue name."
  value       = { for k, q in google_cloud_tasks_queue.queues : k => q.name }
}

output "queue_ids" {
  description = "Map of logical queue key -> fully-qualified queue ID."
  value       = { for k, q in google_cloud_tasks_queue.queues : k => q.id }
}

output "dead_letter_queue_name" {
  description = "Name of the dead-letter (terminal sink) queue."
  value       = google_cloud_tasks_queue.dead_letter.name
}
