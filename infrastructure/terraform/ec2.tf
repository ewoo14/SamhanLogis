################################################################################
# ec2.tf — m5.xlarge EC2 인스턴스 (17 service docker-compose)
#
# 구성:
#   - 인스턴스: m5.xlarge (4 vCPU + 16 GB RAM)
#   - EBS: gp3 100 GB (루트 볼륨)
#   - EC2 Auto Recovery: CloudWatch alarm 기반 자동 복구 (Tier 1)
#   - IAM Instance Profile: S3 + CloudWatch + Secrets Manager 권한
#   - User Data: Docker + Docker Compose 자동 설치 + 서비스 기동
################################################################################

# ─── EC2 인스턴스 ────────────────────────────────────────────────────────────

resource "aws_instance" "app" {
  ami                    = var.ec2_ami_id
  instance_type          = var.ec2_instance_type
  key_name               = var.ec2_key_pair_name
  subnet_id              = aws_subnet.private[0].id
  vpc_security_group_ids = [aws_security_group.ec2.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_profile.name

  # EC2 Auto Recovery 활성화를 위해 EBS-backed 인스턴스 필수 (nitro-based m5 지원)
  # Auto Recovery는 aws_cloudwatch_metric_alarm 에서 설정

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.ec2_volume_size
    iops                  = 3000
    throughput            = 125
    encrypted             = true
    delete_on_termination = true

    tags = {
      Name = "${local.name_prefix}-root-volume"
    }
  }

  # 세부 모니터링 활성 (CloudWatch 1분 간격 metric)
  monitoring = true

  user_data = base64encode(templatefile("${path.module}/templates/user_data.sh", {
    project_name = var.project_name
    environment  = var.environment
    aws_region   = var.aws_region
    rds_endpoint = aws_db_instance.main.address
    rds_username = var.rds_username
    rds_password_secret_id = aws_secretsmanager_secret.db_password.name
  }))

  tags = {
    Name = "${local.name_prefix}-app-server"
    Role = "application"
  }

  lifecycle {
    # AMI ID 업데이트 시 replace 방지 (명시적 destroy 필요)
    ignore_changes = [ami]
  }

  depends_on = [
    aws_db_instance.main,
    aws_secretsmanager_secret_version.db_password,
    aws_s3_object.init_rds,
    aws_s3_object.compose,
    aws_iam_instance_profile.ec2_profile,
    aws_iam_role_policy_attachment.ec2_s3,
    aws_iam_role_policy_attachment.ec2_secrets,
    aws_iam_role_policy_attachment.ec2_cloudwatch,
    aws_iam_role_policy_attachment.ec2_ssm,
    aws_iam_role_policy_attachment.ec2_ecr
  ]
}

# ─── ALB (Application Load Balancer) ─────────────────────────────────────────
# EIP 제거: EC2 는 private subnet 배치 + ALB 전면 아키텍처 — 퍼블릭 IP 직접 노출 불필요.
# EC2 아웃바운드(ECR pull / S3 / Secrets Manager) 는 NAT Gateway 경유.

resource "aws_lb" "main" {
  name               = "${local.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  enable_deletion_protection = true
  enable_http2               = true

  access_logs {
    bucket  = aws_s3_bucket.logs.id
    prefix  = "alb-logs"
    enabled = true
  }

  tags = {
    Name = "${local.name_prefix}-alb"
  }

  depends_on = [aws_s3_bucket_policy.logs]
}

# ─── ALB Target Group ─────────────────────────────────────────────────────────

resource "aws_lb_target_group" "app" {
  name     = "${local.name_prefix}-app-tg"
  port     = 8080
  protocol = "HTTP"
  vpc_id   = aws_vpc.main.id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/actuator/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 10
    unhealthy_threshold = 3
  }

  tags = {
    Name = "${local.name_prefix}-app-tg"
  }
}

resource "aws_lb_target_group_attachment" "app" {
  target_group_arn = aws_lb_target_group.app.arn
  target_id        = aws_instance.app.id
  port             = 8080
}

# ─── ACM 인증서 ──────────────────────────────────────────────────────────────

resource "aws_acm_certificate" "main" {
  domain_name               = var.domain_name
  subject_alternative_names = ["*.${var.domain_name}", "*.arologis.${var.domain_name}"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${local.name_prefix}-acm"
  }
}

# ─── ALB Listener ─────────────────────────────────────────────────────────────

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.main.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }

  depends_on = [aws_acm_certificate_validation.main]
}

resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# ─── EC2 Auto Recovery (CloudWatch Alarm) ────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "ec2_auto_recovery" {
  alarm_name          = "${local.name_prefix}-ec2-auto-recovery"
  alarm_description   = "EC2 시스템 상태 실패 감지 시 자동 복구 (Tier 1)"
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_System"
  dimensions = {
    InstanceId = aws_instance.app.id
  }
  comparison_operator       = "GreaterThanOrEqualToThreshold"
  evaluation_periods        = 2
  period                    = 60
  statistic                 = "Maximum"
  threshold                 = 1
  treat_missing_data        = "notBreaching"

  # Auto Recovery 액션 (EC2 SystemStatusCheckFailed → recover)
  alarm_actions = [
    "arn:aws:automate:${var.aws_region}:ec2:recover",
    aws_sns_topic.alerts.arn
  ]

  tags = {
    Name = "${local.name_prefix}-ec2-auto-recovery-alarm"
  }
}

# ─── Outputs ─────────────────────────────────────────────────────────────────

output "ec2_instance_id" {
  description = "EC2 인스턴스 ID"
  value       = aws_instance.app.id
}

output "ec2_private_ip" {
  description = "EC2 Private IP (private subnet — 외부 직접 접근 불가, SSM Session Manager 또는 ALB 경유)"
  value       = aws_instance.app.private_ip
}

output "alb_dns_name" {
  description = "ALB DNS 이름"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "ALB Route 53 Zone ID"
  value       = aws_lb.main.zone_id
}
