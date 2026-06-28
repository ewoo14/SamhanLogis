################################################################################
# outputs.tf — Phase 11 Terraform 최종 출력값
#
# 실 배포 후 이 값들을 17 service 환경변수 + CUTOVER.md 런북에 사용.
################################################################################

output "phase11_summary" {
  description = "Phase 11 AWS 인프라 구성 요약"
  value = {
    region           = var.aws_region
    environment      = var.environment
    ec2_instance_id  = aws_instance.app.id
    ec2_public_ip    = aws_eip.app.public_ip
    rds_endpoint     = aws_db_instance.main.address
    alb_dns          = aws_lb.main.dns_name
    api_url          = "https://api.${var.domain_name}"
    monthly_cost_krw = "405000"  # 정상가 ₩405,000/월
  }
}

output "cutover_env_vars" {
  description = "17 service application.yml cutover 환경변수 목록 (docker-compose.prod.yml 참조)"
  sensitive   = false
  value = {
    SAMHAN_DB_URL         = "jdbc:postgresql://${aws_db_instance.main.address}:5432/<service_db>"
    SAMHAN_S3_ENDPOINT    = ""
    SAMHAN_S3_BUCKET      = aws_s3_bucket.attachments.bucket
    SAMHAN_AWS_REGION     = var.aws_region
    SAMHAN_S3_PATH_STYLE_ACCESS = "false"
    SNS_TOPIC_ARN         = aws_sns_topic.alerts.arn
    CLOUDWATCH_LOG_GROUP  = aws_cloudwatch_log_group.application.name
  }
}
