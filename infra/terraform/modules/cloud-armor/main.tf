locals {
  # OWASP Top 10 preconfigured WAF rule sets, each on its own priority.
  owasp_rules = {
    "sqli"             = { priority = 2000, expr = "sqli-v33-stable" }
    "xss"              = { priority = 2001, expr = "xss-v33-stable" }
    "lfi"              = { priority = 2002, expr = "lfi-v33-stable" }
    "rce"              = { priority = 2003, expr = "rce-v33-stable" }
    "rfi"              = { priority = 2004, expr = "rfi-v33-stable" }
    "scannerdetection" = { priority = 2005, expr = "scannerdetection-v33-stable" }
    "protocolattack"   = { priority = 2006, expr = "protocolattack-v33-stable" }
    "sessionfixation"  = { priority = 2007, expr = "sessionfixation-v33-stable" }
  }
}

resource "google_compute_security_policy" "waf" {
  name        = "boba-waf-${var.environment}"
  project     = var.project_id
  description = "OWASP Top 10 WAF + per-IP rate limiting for BOBA (${var.environment})"

  # Per-IP rate limiting: throttle clients exceeding the threshold.
  rule {
    action      = "throttle"
    priority    = 1000
    description = "Rate limit ${var.rate_limit_count} requests / ${var.rate_limit_interval_sec}s per IP"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      enforce_on_key = "IP"
      rate_limit_threshold {
        count        = var.rate_limit_count
        interval_sec = var.rate_limit_interval_sec
      }
    }
  }

  # CKV_GCP_73: Explicit Log4Shell (CVE-2021-44228) block rule.
  # Uses the cve-canary preconfigured WAF expression to block JNDI lookup exploitation.
  rule {
    action      = "deny(403)"
    priority    = 1999
    preview     = false
    description = "CVE-2021-44228: Block Log4j2 JNDI injection (log4shell)"
    match {
      expr {
        expression = "evaluatePreconfiguredWaf('cve-canary')"
      }
    }
  }

  # OWASP preconfigured WAF rules — deny matching malicious requests.
  dynamic "rule" {
    for_each = local.owasp_rules
    content {
      action      = "deny(403)"
      priority    = rule.value.priority
      description = "OWASP: ${rule.key}"
      match {
        expr {
          expression = "evaluatePreconfiguredWaf('${rule.value.expr}', {'sensitivity': ${var.waf_sensitivity}})"
        }
      }
    }
  }

  # Default: allow everything not blocked above.
  rule {
    action      = "allow"
    priority    = 2147483647
    description = "Default allow"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
  }

  # Surface adaptive protection for L7 DDoS.
  adaptive_protection_config {
    layer_7_ddos_defense_config {
      enable = true
    }
  }

  # CKV_GCP_73: Enable request logging so blocked traffic is visible in Cloud Logging.
  log_config {
    enable = true
  }
}
