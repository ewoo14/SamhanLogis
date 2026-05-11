################################################################################
# route53.tf — samhan-air.com subdomain + ALB 연결
#
# subdomain 목록 (project_domain_strategy.md):
#   api     → ALB (api-gateway :8080)
#   app     → ALB (desktop electron 다운로드 page)
#   order   → ALB (partner-order-service)
#   sign    → ALB (slip-service signature)
#   chat    → ALB (groupware-service)
#   files   → CloudFront → S3 (file CDN)
#   monitor → ALB (Grafana :3000 — 내부용)
#   quote   → ALB (estimate-app)
#
# Hosted Zone: 사전 생성 필요 (var.route53_zone_id)
################################################################################

# ─── Hosted Zone (사전 생성 또는 data source로 참조) ─────────────────────────

# 주의: Hosted Zone 은 도메인 등록 기관에서 NS 레코드를 먼저 설정해야 함.
# 신규 생성 시 아래 resource 사용. 이미 존재하면 data source 로 교체.

resource "aws_route53_zone" "main" {
  name    = var.domain_name
  comment = "SamhanLogis Phase 11 Production"

  tags = {
    Name = "${local.name_prefix}-hosted-zone"
  }
}

# ─── ACM 인증서 DNS 검증 레코드 ──────────────────────────────────────────────

resource "aws_route53_record" "acm_validation" {
  for_each = {
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = aws_route53_zone.main.zone_id
}

resource "aws_acm_certificate_validation" "main" {
  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = [for record in aws_route53_record.acm_validation : record.fqdn]
}

# ─── ALB 연결 Route 53 레코드 ─────────────────────────────────────────────────
# ALB DNS 이름 → samhan-air.com 각 subdomain ALIAS 레코드

# api.samhan-air.com (api-gateway — 주 엔드포인트)
resource "aws_route53_record" "api" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "api.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

# app.samhan-air.com (desktop 다운로드 page)
resource "aws_route53_record" "app" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "app.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

# order.samhan-air.com (partner-order 웹앱)
resource "aws_route53_record" "order" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "order.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

# sign.samhan-air.com (slip-service signature)
resource "aws_route53_record" "sign" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "sign.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

# chat.samhan-air.com (groupware-service)
resource "aws_route53_record" "chat" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "chat.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

# monitor.samhan-air.com (Grafana — 내부 관리용)
resource "aws_route53_record" "monitor" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "monitor.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

# quote.samhan-air.com (estimate-app)
resource "aws_route53_record" "quote" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "quote.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

# files.samhan-air.com (S3 정적 CDN — CloudFront 추가 시 교체)
# 현재는 ALB 경유, Phase 12 이후 CloudFront distribution 연결
resource "aws_route53_record" "files" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "files.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

# ─── TTL 60s 단축 (cutover D-1 day 설정 — 주석 해제 후 적용) ─────────────────
# cutover 전날 TTL 을 60s 로 단축하여 rollback 시 빠른 전환 지원.
# 정상 운영 시 TTL = 300s (기본값).
# 위 A record 들의 ttl 파라미터는 alias 레코드라 직접 설정 불가 (AWS 관리).
# A record alias 는 TTL 을 AWS 가 자동 관리 (60s 고정).

# ─── Outputs ─────────────────────────────────────────────────────────────────

output "route53_zone_id" {
  description = "Route 53 Hosted Zone ID"
  value       = aws_route53_zone.main.zone_id
}

output "route53_name_servers" {
  description = "Route 53 NS 레코드 (도메인 등록기관에 등록 필요)"
  value       = aws_route53_zone.main.name_servers
}

output "api_endpoint" {
  description = "API 엔드포인트 (api.samhan-air.com)"
  value       = "https://api.${var.domain_name}"
}
