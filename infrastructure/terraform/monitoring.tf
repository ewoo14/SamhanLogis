################################################################################
# monitoring.tf — CloudWatch 알람 + 대시보드
#
# 알람 매트릭스 (M-AWS-MIGRATION-DRY-RUN.md § 6 일관):
#   1. ALB 5xx 비율 > 1% (5분 평균) → Slack + email
#   2. ALB 응답시간 p99 > 500ms      → Slack
#   3. RDS CPU > 80% (5분 평균)      → Slack + email
#   4. RDS DB 연결 수 > 80%           → Slack + email
#   5. RDS Disk > 85%                → Slack + email
#   6. EC2 CPU > 80% (5분 평균)       → Slack
#   7. EC2 메모리 > 85%               → Slack (CloudWatch Agent custom metric)
#   8. EC2 Disk > 85%                → Slack + email (CloudWatch Agent custom metric)
################################################################################

# ─── CloudWatch Log Group (17 service 통합) ───────────────────────────────────

resource "aws_cloudwatch_log_group" "application" {
  name              = "/samhanlogis/production/application"
  retention_in_days = 14

  tags = {
    Name = "${local.name_prefix}-application-logs"
  }
}

resource "aws_cloudwatch_log_group" "docker" {
  name              = "/samhanlogis/production/docker"
  retention_in_days = 14

  tags = {
    Name = "${local.name_prefix}-docker-logs"
  }
}

# ─── slip-service 가격기억 fail-soft 감지 (#809, CUTOVER M-19) ────────────────
# 애플리케이션 WARN 문자열을 메트릭으로 변환해 health=UP 인 조용한 기능 저하도
# 운영 알람으로 승격한다.
#
# 로그 원천 (R6-H5 재설계): slip-service 로그는 docker-compose.prod.yml 의 awslogs
# driver 가 위 docker log group 의 stream "slip-service" 로 직접 전달한다.
# user_data.sh CloudWatch Agent 의 json 와일드카드 tail 은 AWS 문서상 "최신 수정
# 파일만 push" 라 17개 컨테이너 동시 기록에서 라인 유실이 가능해 alarm 원천으로
# 쓰지 않는다 (나머지 컨테이너 best-effort 수집 전용).
#
# 잔여 한계 (정직 기록): treat_missing_data=notBreaching 이므로 전달 경로 자체가
# 끊기면 datapoint 부재로 alarm 이 계속 OK 로 남는다. 보상 통제 = CUTOVER.md M-19 의
# 양성 도달 검사(인위 감시 문자열 → filter-log-events 도달 + alarm 발화 확인).
# 상시 전달 heartbeat alarm 은 미구현이며, 실 EC2 부재로 라이브 실측은 cutover 시
# M-19 에서 최초 수행된다 (2026-07-16 기준 AWS 공식 문서 기반 설계 검증까지 완료).

resource "aws_cloudwatch_log_metric_filter" "slip_price_memory_upsert_failed" {
  name           = "slip-price-memory-upsert-failed"
  log_group_name = aws_cloudwatch_log_group.docker.name
  pattern        = "\"partner-product price memory batch upsert failed\""

  metric_transformation {
    name          = "SlipPriceMemoryUpsertFailed"
    namespace     = "SamhanLogis/Slip"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "slip_price_memory_queue_rejected" {
  name           = "slip-price-memory-queue-rejected"
  log_group_name = aws_cloudwatch_log_group.docker.name
  pattern        = "\"partner-product price memory queue rejected\""

  metric_transformation {
    name          = "SlipPriceMemoryQueueRejected"
    namespace     = "SamhanLogis/Slip"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "slip_price_memory_upsert_failed" {
  alarm_name        = "${local.name_prefix}-slip-price-memory-upsert-failure"
  alarm_description = "slip-service 가격기억 batch upsert 실패 감지"
  namespace         = "SamhanLogis/Slip"
  metric_name       = "SlipPriceMemoryUpsertFailed"

  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Name = "${local.name_prefix}-slip-price-memory-upsert-failure"
  }
}

resource "aws_cloudwatch_metric_alarm" "slip_price_memory_queue_rejected" {
  alarm_name        = "${local.name_prefix}-slip-price-memory-queue-rejected"
  alarm_description = "slip-service 가격기억 비동기 queue 포화 감지"
  namespace         = "SamhanLogis/Slip"
  metric_name       = "SlipPriceMemoryQueueRejected"

  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Name = "${local.name_prefix}-slip-price-memory-queue-rejected"
  }
}

# ─── partner-order 전표 발행 outbox 영구실패 알람 ─────────────────────────────

resource "aws_cloudwatch_log_metric_filter" "partner_order_outbox_failed_permanent" {
  name           = "partner-order-outbox-failed-permanent"
  log_group_name = aws_cloudwatch_log_group.docker.name
  pattern        = "\"Outbox FAILED_PERMANENT\""

  metric_transformation {
    name          = "PartnerOrderOutboxFailedPermanent"
    namespace     = "SamhanLogis/PartnerOrder"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "partner_order_outbox_failed_permanent" {
  alarm_name        = "${local.name_prefix}-partner-order-outbox-failed-permanent"
  alarm_description = "partner-order-service 전표 발행 outbox 영구실패 감지"
  namespace         = "SamhanLogis/PartnerOrder"
  metric_name       = "PartnerOrderOutboxFailedPermanent"

  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Name = "${local.name_prefix}-partner-order-outbox-failed-permanent"
  }
}

# ─── ALB 5xx 알람 ──────────────────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name        = "${local.name_prefix}-alb-5xx-rate"
  alarm_description = "ALB 5xx 비율 > 1% (5분 평균) — 서비스 오류 가능성"
  namespace         = "AWS/ApplicationELB"
  metric_name       = "HTTPCode_Target_5XX_Count"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
  }

  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  period              = 300
  statistic           = "Sum"
  threshold           = 10 # 5분간 5xx 10건 이상
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Name = "${local.name_prefix}-alb-5xx-alarm"
  }
}

# ─── ALB 응답시간 알람 ────────────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "alb_response_time" {
  alarm_name        = "${local.name_prefix}-alb-response-time-p99"
  alarm_description = "ALB 응답시간 p99 > 500ms"
  namespace         = "AWS/ApplicationELB"
  metric_name       = "TargetResponseTime"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
  }

  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  period              = 60
  extended_statistic  = "p99"
  threshold           = 0.5 # 500ms
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]

  tags = {
    Name = "${local.name_prefix}-alb-response-time-alarm"
  }
}

# ─── RDS CPU 알람 ─────────────────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name        = "${local.name_prefix}-rds-cpu-high"
  alarm_description = "RDS CPU > 80% (5분 평균)"
  namespace         = "AWS/RDS"
  metric_name       = "CPUUtilization"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.identifier
  }

  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  period              = 300
  statistic           = "Average"
  threshold           = 80
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Name = "${local.name_prefix}-rds-cpu-alarm"
  }
}

# ─── RDS DB 연결 수 알람 ─────────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "rds_connections" {
  alarm_name        = "${local.name_prefix}-rds-connections-high"
  alarm_description = "RDS DB 연결 수 > 240 (max_connections=300 의 80%, 17 service 대응)"
  namespace         = "AWS/RDS"
  metric_name       = "DatabaseConnections"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.identifier
  }

  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  period              = 300
  statistic           = "Average"
  threshold           = 240
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Name = "${local.name_prefix}-rds-connections-alarm"
  }
}

# ─── RDS Disk 알람 ───────────────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "rds_disk" {
  alarm_name        = "${local.name_prefix}-rds-disk-low"
  alarm_description = "RDS 여유 디스크 < 15GB (100GB 기준 85% 사용)"
  namespace         = "AWS/RDS"
  metric_name       = "FreeStorageSpace"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.identifier
  }

  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  period              = 300
  statistic           = "Minimum"
  threshold           = 15000000000 # 15 GB (bytes)
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Name = "${local.name_prefix}-rds-disk-alarm"
  }
}

# ─── EC2 CPU 알람 ─────────────────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "ec2_cpu" {
  alarm_name        = "${local.name_prefix}-ec2-cpu-high"
  alarm_description = "EC2 CPU > 80% (5분 평균)"
  namespace         = "AWS/EC2"
  metric_name       = "CPUUtilization"

  dimensions = {
    InstanceId = aws_instance.app.id
  }

  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  period              = 300
  statistic           = "Average"
  threshold           = 80
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Name = "${local.name_prefix}-ec2-cpu-alarm"
  }
}

# ─── EC2 메모리 알람 (CloudWatch Agent custom metric) ─────────────────────────

resource "aws_cloudwatch_metric_alarm" "ec2_memory" {
  alarm_name        = "${local.name_prefix}-ec2-memory-high"
  alarm_description = "EC2 메모리 사용률 > 85% (CloudWatch Agent)"
  namespace         = "SamhanLogis/EC2"
  metric_name       = "mem_used_percent"

  dimensions = {
    host = "${local.name_prefix}-app-server"
  }

  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  period              = 300
  statistic           = "Average"
  threshold           = 85
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]

  tags = {
    Name = "${local.name_prefix}-ec2-memory-alarm"
  }
}

# ─── EC2 Disk 알람 (CloudWatch Agent custom metric) ───────────────────────────

resource "aws_cloudwatch_metric_alarm" "ec2_disk" {
  alarm_name        = "${local.name_prefix}-ec2-disk-high"
  alarm_description = "EC2 Disk 사용률 > 85% (CloudWatch Agent)"
  namespace         = "SamhanLogis/EC2"
  metric_name       = "disk_used_percent"

  dimensions = {
    host = "${local.name_prefix}-app-server"
    path = "/"
  }

  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  period              = 300
  statistic           = "Maximum"
  threshold           = 85
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Name = "${local.name_prefix}-ec2-disk-alarm"
  }
}

# ─── CloudWatch Dashboard ─────────────────────────────────────────────────────

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${local.name_prefix}-production"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        width  = 12
        height = 6
        properties = {
          title  = "EC2 CPU + Memory"
          period = 60
          metrics = [
            ["AWS/EC2", "CPUUtilization", "InstanceId", aws_instance.app.id],
            ["SamhanLogis/EC2", "mem_used_percent", "host", "${local.name_prefix}-app-server"]
          ]
          view = "timeSeries"
          stat = "Average"
        }
      },
      {
        type   = "metric"
        width  = 12
        height = 6
        properties = {
          title  = "RDS CPU + Connections"
          period = 60
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", aws_db_instance.main.identifier],
            ["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", aws_db_instance.main.identifier]
          ]
          view = "timeSeries"
          stat = "Average"
        }
      },
      {
        type   = "metric"
        width  = 12
        height = 6
        properties = {
          title  = "ALB Request + 5xx"
          period = 60
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", aws_lb.main.arn_suffix],
            ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", aws_lb.main.arn_suffix]
          ]
          view = "timeSeries"
          stat = "Sum"
        }
      },
      {
        type   = "metric"
        width  = 12
        height = 6
        properties = {
          title  = "ALB 응답시간 (p99)"
          period = 60
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", aws_lb.main.arn_suffix, { "stat" = "p99" }]
          ]
          view = "timeSeries"
        }
      }
    ]
  })
}

# ─── Outputs ─────────────────────────────────────────────────────────────────

output "cloudwatch_dashboard_url" {
  description = "CloudWatch 대시보드 URL"
  value       = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${aws_cloudwatch_dashboard.main.dashboard_name}"
}
