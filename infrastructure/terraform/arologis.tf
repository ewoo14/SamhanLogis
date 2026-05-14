################################################################################
# arologis.tf — 아로로지스 독립 분리 (spec §8.2 — 2026-05-14)
#
# 추가 Route 53 record 3개:
#   - api.arologis.samhan-air.com    → ALB (Nginx host-header 라우팅 → arologis-service:8097)
#   - app.arologis.samhan-air.com    → ALB (Electron installer 다운로드 페이지)
#   - mobile.arologis.samhan-air.com → ALB (Store deeplink 페이지)
#
# 자원 영향:
#   - aws_route53_zone.main          (route53.tf) 그대로 재사용.
#   - aws_acm_certificate.main       (wildcard *.samhan-air.com) 그대로 — *.samhan-air.com 이
#     *.arologis.samhan-air.com 까지 커버하지 않으므로 SAN 추가 필요 (별도 PR 또는 본 분리 시
#     수동 ACM 검증). 본 .tf 는 Route 53 record 만 추가 — ACM 갱신은 별도 작업.
#   - aws_lb.main                    그대로 재사용 (host-header 라우팅 = Nginx 가 처리).
#
# 비용 영향: Route 53 record 3개 추가만 — 월 ₩0 (Hosted Zone 이미 존재).
################################################################################

# ─── api.arologis.samhan-air.com (REST API — arologis-service:8097) ──────────
resource "aws_route53_record" "arologis_api" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "api.arologis.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

# ─── app.arologis.samhan-air.com (Electron installer 다운로드 페이지) ────────
resource "aws_route53_record" "arologis_app" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "app.arologis.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

# ─── mobile.arologis.samhan-air.com (Store deeplink 페이지) ──────────────────
resource "aws_route53_record" "arologis_mobile" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "mobile.arologis.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

# ─── Outputs ─────────────────────────────────────────────────────────────────
output "arologis_api_endpoint" {
  description = "아로로지스 API 엔드포인트"
  value       = "https://api.arologis.${var.domain_name}"
}

output "arologis_app_endpoint" {
  description = "아로로지스 데스크톱 installer 다운로드 페이지"
  value       = "https://app.arologis.${var.domain_name}"
}

output "arologis_mobile_endpoint" {
  description = "아로로지스 모바일 store deeplink 페이지"
  value       = "https://mobile.arologis.${var.domain_name}"
}
