################################################################################
# lambda.tf — Health Check Lambda (Tier 3 자동 복구)
#
# 기능:
#   - 1분 간격 EventBridge Rule 으로 트리거
#   - api-gateway /actuator/health 폴링
#   - 5분 연속 실패 → EC2 reboot 실행
#   - 장애/복구 시 SNS → Slack 알림
#
# 참조: templates/health_check_lambda.py
################################################################################

# ─── Lambda 소스 패키징 ───────────────────────────────────────────────────────

data "archive_file" "health_check_lambda" {
  type        = "zip"
  source_file = "${path.module}/templates/health_check_lambda.py"
  output_path = "${path.module}/.terraform/health_check_lambda.zip"
}

# ─── SNS Topic (알림 허브) ────────────────────────────────────────────────────

resource "aws_sns_topic" "alerts" {
  name = "${local.name_prefix}-alerts"

  tags = {
    Name = "${local.name_prefix}-alerts"
  }
}

resource "aws_sns_topic_subscription" "email_alert" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# ─── SSM Parameter (실패 카운터 저장) ────────────────────────────────────────

resource "aws_ssm_parameter" "health_check_failure_count" {
  name  = "/samhanlogis/health-check/failure-count"
  type  = "String"
  value = "0"

  lifecycle {
    ignore_changes = [value] # Lambda 가 직접 업데이트하므로 Terraform 재적용 시 덮어쓰기 방지
  }

  tags = {
    Name = "${local.name_prefix}-health-check-failure-count"
  }
}

# ─── Lambda Function ──────────────────────────────────────────────────────────

resource "aws_lambda_function" "health_check" {
  function_name = "${local.name_prefix}-health-check"
  description   = "EC2 Health Check + 자동 reboot (Tier 3 자동 복구)"

  filename         = data.archive_file.health_check_lambda.output_path
  source_code_hash = data.archive_file.health_check_lambda.output_base64sha256
  handler          = "health_check_lambda.handler"
  runtime          = "python3.12"
  role             = aws_iam_role.lambda_health_check.arn

  # 타임아웃 (health check 10s + 여유)
  timeout     = 30
  memory_size = 128

  # VPC 내부에서 EC2 private IP 접근
  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = {
      EC2_INSTANCE_ID   = aws_instance.app.id
      EC2_PRIVATE_IP    = aws_instance.app.private_ip
      SNS_TOPIC_ARN     = aws_sns_topic.alerts.arn
      FAILURE_THRESHOLD = "5"
      # HEALTH_CHECK_URL 미설정 시 EC2_PRIVATE_IP:8080/actuator/health 자동 구성
    }
  }

  tags = {
    Name = "${local.name_prefix}-health-check-lambda"
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_health_check,
    aws_instance.app
  ]
}

# ─── CloudWatch Logs (Lambda 실행 로그) ───────────────────────────────────────

resource "aws_cloudwatch_log_group" "health_check_lambda" {
  name              = "/aws/lambda/${aws_lambda_function.health_check.function_name}"
  retention_in_days = 14

  tags = {
    Name = "${local.name_prefix}-health-check-lambda-logs"
  }
}

# ─── EventBridge Rule (1분 간격 트리거) ───────────────────────────────────────

resource "aws_cloudwatch_event_rule" "health_check_schedule" {
  name                = "${local.name_prefix}-health-check-schedule"
  description         = "EC2 Health Check 1분 간격 트리거"
  schedule_expression = "rate(1 minute)"

  tags = {
    Name = "${local.name_prefix}-health-check-schedule"
  }
}

resource "aws_cloudwatch_event_target" "health_check_lambda" {
  rule = aws_cloudwatch_event_rule.health_check_schedule.name
  arn  = aws_lambda_function.health_check.arn
}

resource "aws_lambda_permission" "health_check_eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.health_check.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.health_check_schedule.arn
}

# ─── SSM Parameter (Lambda → SSM 쓰기 권한 추가) ─────────────────────────────

resource "aws_iam_policy" "lambda_ssm_policy" {
  name        = "${local.name_prefix}-lambda-ssm-policy"
  description = "Health Check Lambda SSM Parameter 읽기/쓰기 정책"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:PutParameter"
        ]
        Resource = "arn:aws:ssm:${var.aws_region}:${local.account_id}:parameter/samhanlogis/*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_ssm" {
  role       = aws_iam_role.lambda_health_check.name
  policy_arn = aws_iam_policy.lambda_ssm_policy.arn
}

# ─── Outputs ─────────────────────────────────────────────────────────────────

output "health_check_lambda_arn" {
  description = "Health Check Lambda ARN"
  value       = aws_lambda_function.health_check.arn
}

output "sns_alerts_topic_arn" {
  description = "SNS 알림 토픽 ARN"
  value       = aws_sns_topic.alerts.arn
}
