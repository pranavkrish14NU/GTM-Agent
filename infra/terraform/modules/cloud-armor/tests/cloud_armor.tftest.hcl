mock_provider "google" {}

variables {
  project_id  = "boba-test"
  environment = "dev"
}

run "policy_created_with_rules" {
  command = plan

  assert {
    condition     = google_compute_security_policy.waf.name == "boba-waf-dev"
    error_message = "Security policy must be named per environment."
  }

  # 1 rate-limit + 1 log4shell (CVE-2021-44228) + 8 OWASP + 1 default = 11 rules.
  assert {
    condition     = length(google_compute_security_policy.waf.rule) == 11
    error_message = "Policy must have rate-limit, log4shell CVE rule, 8 OWASP rules, and a default rule."
  }
}

run "rate_limit_configured" {
  command = plan

  assert {
    condition     = anytrue([for r in google_compute_security_policy.waf.rule : r.action == "throttle"])
    error_message = "A throttle (rate-limit) rule must exist."
  }
}

run "owasp_and_ddos" {
  command = plan

  assert {
    condition     = anytrue([for r in google_compute_security_policy.waf.rule : can(regex("sqli", r.description))])
    error_message = "An OWASP SQLi rule must be present."
  }

  assert {
    condition     = google_compute_security_policy.waf.adaptive_protection_config[0].layer_7_ddos_defense_config[0].enable == true
    error_message = "Layer 7 DDoS adaptive protection must be enabled."
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
