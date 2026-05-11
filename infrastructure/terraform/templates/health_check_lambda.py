"""
health_check_lambda.py — SamhanLogis Phase 11 EC2 Health Check Lambda

기능:
  1. EC2 인스턴스의 /actuator/health 엔드포인트를 1분 간격으로 폴링
  2. 5분 연속 실패 시 EC2 reboot 명령 실행
  3. 장애 발생 시 SNS → Slack 알림 전송

환경변수:
  EC2_INSTANCE_ID   — 모니터링 대상 EC2 인스턴스 ID
  EC2_PRIVATE_IP    — EC2 프라이빗 IP (VPC 내부 접근)
  SNS_TOPIC_ARN     — 알림 SNS 토픽 ARN
  HEALTH_CHECK_URL  — health check 엔드포인트 (기본: http://{EC2_PRIVATE_IP}:8080/actuator/health)
  FAILURE_THRESHOLD — 연속 실패 허용 횟수 (기본: 5)

트리거: EventBridge Rule (1분 간격)
"""

import json
import os
import boto3
import urllib.request
import urllib.error
from datetime import datetime, timezone

# 환경변수
EC2_INSTANCE_ID   = os.environ.get("EC2_INSTANCE_ID", "")
EC2_PRIVATE_IP    = os.environ.get("EC2_PRIVATE_IP", "")
SNS_TOPIC_ARN     = os.environ.get("SNS_TOPIC_ARN", "")
FAILURE_THRESHOLD = int(os.environ.get("FAILURE_THRESHOLD", "5"))
HEALTH_CHECK_URL  = os.environ.get(
    "HEALTH_CHECK_URL",
    f"http://{EC2_PRIVATE_IP}:8080/actuator/health"
)

# AWS 클라이언트
ec2_client = boto3.client("ec2")
sns_client = boto3.client("sns")
ssm_client = boto3.client("ssm")  # Parameter Store — 연속 실패 횟수 저장

FAILURE_COUNT_PARAM = f"/samhanlogis/health-check/failure-count"


def get_failure_count() -> int:
    """SSM Parameter Store 에서 연속 실패 횟수 조회"""
    try:
        resp = ssm_client.get_parameter(Name=FAILURE_COUNT_PARAM)
        return int(resp["Parameter"]["Value"])
    except ssm_client.exceptions.ParameterNotFound:
        return 0
    except Exception as e:
        print(f"[WARN] 실패 횟수 조회 오류: {e}")
        return 0


def set_failure_count(count: int) -> None:
    """SSM Parameter Store 에 연속 실패 횟수 저장"""
    try:
        ssm_client.put_parameter(
            Name=FAILURE_COUNT_PARAM,
            Value=str(count),
            Type="String",
            Overwrite=True
        )
    except Exception as e:
        print(f"[WARN] 실패 횟수 저장 오류: {e}")


def check_health() -> bool:
    """EC2 api-gateway actuator/health 엔드포인트 확인"""
    try:
        req = urllib.request.Request(
            HEALTH_CHECK_URL,
            headers={"User-Agent": "SamhanLogis-HealthCheck/1.0"}
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status == 200:
                body = json.loads(resp.read().decode())
                status = body.get("status", "")
                print(f"[OK] Health check 통과 — status={status}")
                return True
            else:
                print(f"[FAIL] Health check 실패 — HTTP {resp.status}")
                return False
    except urllib.error.URLError as e:
        print(f"[FAIL] Health check URL 오류 — {e}")
        return False
    except Exception as e:
        print(f"[FAIL] Health check 예외 — {e}")
        return False


def reboot_ec2() -> None:
    """EC2 인스턴스 reboot (OS hang / Spring Boot OOM / deadlock 감지 시)"""
    try:
        print(f"[ACTION] EC2 reboot 실행 — instance={EC2_INSTANCE_ID}")
        ec2_client.reboot_instances(InstanceIds=[EC2_INSTANCE_ID])
    except Exception as e:
        print(f"[ERROR] EC2 reboot 실패 — {e}")
        raise


def send_alert(subject: str, message: str) -> None:
    """SNS 알림 전송 (Slack Webhook Lambda 가 구독)"""
    if not SNS_TOPIC_ARN:
        print(f"[WARN] SNS_TOPIC_ARN 미설정 — 알림 생략")
        return
    try:
        sns_client.publish(
            TopicArn=SNS_TOPIC_ARN,
            Subject=subject,
            Message=json.dumps({
                "subject": subject,
                "message": message,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "instance_id": EC2_INSTANCE_ID,
                "environment": "production"
            }, ensure_ascii=False)
        )
        print(f"[SNS] 알림 전송 완료 — subject={subject}")
    except Exception as e:
        print(f"[ERROR] SNS 전송 실패 — {e}")


def handler(event, context):
    """Lambda 핸들러 — EventBridge 1분 간격 트리거"""
    print(f"[START] Health Check 시작 — {datetime.now(timezone.utc).isoformat()}")
    print(f"[INFO] 대상 인스턴스={EC2_INSTANCE_ID}, URL={HEALTH_CHECK_URL}")

    is_healthy = check_health()

    if is_healthy:
        # 건강 상태 → 실패 횟수 리셋
        failure_count = get_failure_count()
        if failure_count > 0:
            set_failure_count(0)
            print(f"[RECOVER] 서비스 정상 복구 — 실패 횟수 리셋 (이전 실패={failure_count}회)")
            send_alert(
                subject="[SamhanLogis] 서비스 정상 복구",
                message=f"EC2({EC2_INSTANCE_ID}) Health Check 정상 복구. 이전 연속 실패 {failure_count}회."
            )
        return {"status": "healthy", "failure_count": 0}

    else:
        # 실패 → 카운터 증가
        failure_count = get_failure_count() + 1
        set_failure_count(failure_count)
        print(f"[FAIL] 연속 실패 {failure_count}회 / 임계치 {FAILURE_THRESHOLD}회")

        if failure_count >= FAILURE_THRESHOLD:
            # 임계치 초과 → EC2 reboot
            print(f"[ACTION] 연속 실패 {failure_count}회 임계치 초과 — EC2 reboot 트리거")
            send_alert(
                subject=f"[SamhanLogis] EC2 자동 재부팅 (연속 실패 {failure_count}회)",
                message=(
                    f"EC2({EC2_INSTANCE_ID}) Health Check {failure_count}회 연속 실패.\n"
                    f"Health Check URL: {HEALTH_CHECK_URL}\n"
                    f"자동 재부팅을 실행합니다. 예상 복구 시간: 5-10분."
                )
            )
            reboot_ec2()
            set_failure_count(0)  # 리부팅 후 카운터 리셋
        else:
            send_alert(
                subject=f"[SamhanLogis] Health Check 실패 경고 ({failure_count}/{FAILURE_THRESHOLD})",
                message=(
                    f"EC2({EC2_INSTANCE_ID}) Health Check {failure_count}회 연속 실패.\n"
                    f"임계치({FAILURE_THRESHOLD}회) 미달 — 모니터링 중.\n"
                    f"Health Check URL: {HEALTH_CHECK_URL}"
                )
            )

        return {"status": "unhealthy", "failure_count": failure_count}
