# 06 — EC2 Auto Recovery + Health Check Lambda 영향 검증

> 작성: 2026-05-14 — DevOps Team
> 근거: [plan DO6](../../superpowers/plans/2026-05-14-arologis-extract.md), [project_phase11_aws.md](../../../.claude/memory/project_phase11_aws.md), `infrastructure/terraform/ec2.tf`, `infrastructure/terraform/lambda.tf`, `infrastructure/terraform/templates/health_check_lambda.py`

---

## 0. 요약 (TL;DR)

| 자동 복구 메커니즘 | 아로로지스 영향 | 조치 |
|---|---|---|
| **EC2 Auto Recovery** (`aws_cloudwatch_metric_alarm.ec2_auto_recovery`) | **영향 0** | 무변경 — 인스턴스 레벨 복구, 모든 컨테이너 `restart: unless-stopped` 로 자동 부팅 |
| **Health Check Lambda** (`health_check_lambda.py`) | **부분 커버** — api-gateway 만 폴링, arologis-service 미커버 | (선택) CloudWatch alarm 추가 또는 Lambda env 확장 |
| **Phase 11 deploy script** (`phase11-deploy.ps1`) | **DB 목록 갱신 필요** — `arologis_db` 누락 시 신규 RDS 초기화에서 빠짐 | 본 PR 에서 verify only — `arologis_db` 이미 list 에 포함됨 |
| **Prometheus / Grafana scrape** | **변경 0** — Eureka 공유 시 자동 발견 | 무변경 |

**결론**: 아로로지스 컨테이너 = EC2 Auto Recovery 의 보호 대상 (host 단위). Health Check Lambda 는 app-level (api-gateway HTTP) 이므로 arologis-service 의 단독 장애 (OOM/deadlock) 는 별도 monitoring 필요 — **본 PR 에서는 알람 추가만 권고, 실 자원 추가는 D-AX-09 결정 후 별도 PR**.

---

## 1. EC2 Auto Recovery (Tier 1) — 영향 0

### 1.1 동작 원리

`infrastructure/terraform/ec2.tf:174~200`:

```hcl
resource "aws_cloudwatch_metric_alarm" "ec2_auto_recovery" {
  metric_name       = "StatusCheckFailed_System"  # 하드웨어/호스트 레벨 실패
  alarm_actions     = ["arn:aws:automate:${var.aws_region}:ec2:recover", ...]
}
```

- AWS 가 EC2 인스턴스의 **시스템 상태** (호스트 머신 오류, 네트워크 unreachable) 를 감지하면 자동 복구.
- 복구 = same instance ID + same EIP + same EBS volume — 인스턴스가 다시 부팅.

### 1.2 아로로지스 영향

- `docker-compose.arologis.yml` 의 `restart: unless-stopped` 옵션으로 인스턴스 부팅 시 `arologis-service` 컨테이너 자동 재기동.
- 같은 `samhan-net` external network 공유 → 다른 Samhan Public 14 service 와 동일한 회복 시간.
- **변경 0** — EC2 Auto Recovery 의 `dimensions = { InstanceId = aws_instance.app.id }` 가 인스턴스 자체를 보호하므로 추가 alarm 불필요.

### 1.3 검증 절차

| 단계 | 명령 / 확인 |
|---|---|
| 1. EC2 stop (시뮬레이션) | `aws ec2 stop-instances --instance-ids <id>` |
| 2. CloudWatch alarm 상태 | `aws cloudwatch describe-alarms --alarm-names <prefix>-ec2-auto-recovery` |
| 3. 자동 start 확인 | EC2 console → instance state = `running` (5~10분 내) |
| 4. 컨테이너 부팅 확인 | EC2 ssh → `docker ps` → `arologis-service` UP + `samhan-public 14 service` UP |
| 5. health 검증 | `curl http://localhost:8097/actuator/health` + `curl http://localhost:8080/actuator/health` |

---

## 2. Health Check Lambda (Tier 3) — 부분 커버

### 2.1 현재 동작

`infrastructure/terraform/templates/health_check_lambda.py:31~34`:

```python
HEALTH_CHECK_URL = os.environ.get(
    "HEALTH_CHECK_URL",
    f"http://{EC2_PRIVATE_IP}:8080/actuator/health"   # api-gateway
)
```

- 1분 간격 EventBridge Rule 트리거.
- 5분 연속 실패 → `ec2_client.reboot_instances(InstanceIds=[EC2_INSTANCE_ID])`.
- 폴링 대상 = **api-gateway:8080 만**.

### 2.2 시나리오 분석

| 시나리오 | 현재 동작 | 아로로지스 영향 |
|---|---|---|
| api-gateway hang (Samhan Public) | Lambda 가 reboot 트리거 → EC2 재기동 → 아로로지스 컨테이너도 같이 재기동 | **함께 회복** — `restart: unless-stopped` 로 자동 부팅 |
| arologis-service hang (단독 OOM/deadlock) | Lambda 미감지 — api-gateway 는 정상이므로 reboot 무발생 | **단독 장애 미감지** — 별도 알람 필요 |
| 호스트 OS hang (두 service 모두 stop) | Lambda 가 5분 후 reboot 트리거 | **함께 회복** |
| 네트워크 분리 (VPC issue) | Lambda 가 reboot 트리거 | **함께 회복** |

### 2.3 권고 — 별도 CloudWatch Alarm (선택, 본 PR 範圍 外)

D-AX-09 결정 후 별도 PR 에서 추가 권고:

```hcl
# 향후 infrastructure/terraform/arologis-monitoring.tf
resource "aws_cloudwatch_metric_alarm" "arologis_health_fail" {
  alarm_name        = "${local.name_prefix}-arologis-health-fail"
  alarm_description = "arologis-service health check 5분 연속 실패 시 SNS 알람"
  # custom metric — Lambda 가 별도 path 폴링 후 metric 발행
  # 또는 ALB target group health 사용 (host-header 기반)
  metric_name = "HealthyHostCount"
  namespace   = "AWS/ApplicationELB"
  dimensions = {
    TargetGroup  = aws_lb_target_group.arologis.arn_suffix
    LoadBalancer = aws_lb.main.arn_suffix
  }
  alarm_actions = [aws_sns_topic.alerts.arn]   # 알람만 — reboot 액션 X
}
```

**판단 보류 사유**:
- 아로로지스 단독 장애 시 EC2 reboot 은 Samhan Public 14 service 도 함께 reboot (5~10분 outage) — 비용/위험 trade-off 가 큼.
- 대안: SNS 알람만 → Slack 통보 → 운영자가 `docker-compose -f docker-compose.arologis.yml restart` 수동 조치 (1~2분).
- D-AX-09 (자동 복구 vs 수동 알람 선택) 가 결정되면 별도 PR.

### 2.4 (선택) Lambda 환경변수 확장 시

만약 D-AX-09 가 "Lambda 가 arologis 도 자동 폴링" 으로 결정되면, `lambda.tf` 갱신 옵션:

```hcl
environment {
  variables = {
    EC2_INSTANCE_ID    = aws_instance.app.id
    EC2_PRIVATE_IP     = aws_instance.app.private_ip
    SNS_TOPIC_ARN      = aws_sns_topic.alerts.arn
    FAILURE_THRESHOLD  = "5"
    # 신규 — multi-endpoint 지원 (Python 코드 수정 필요)
    HEALTH_CHECK_URLS  = "http://${aws_instance.app.private_ip}:8080/actuator/health,http://${aws_instance.app.private_ip}:8097/actuator/health"
  }
}
```

→ `health_check_lambda.py` 의 `check_health()` 를 multi-URL 지원으로 리팩토링 (any-fail = reboot).

---

## 3. Phase 11 deploy script (`phase11-deploy.ps1`) — DB 목록 검증

### 3.1 현재 동작

`infrastructure/scripts/phase11-deploy.ps1:172~177`:

```powershell
$databases = @(
    "auth_db", "user_db", "product_db", "inventory_db", "slip_db",
    "accounting_db", "logging_db", "partner_db", "partner_auth_db",
    "dc_config_db", "partner_order_db", "notification_db",
    "groupware_db", "dashboard_db", "arologis_db"
)
```

- `arologis_db` 가 이미 list 에 포함 — RDS 초기화 시 자동 생성.
- **변경 0** — 본 PR 검증만 수행.

### 3.2 healthcheck 단계 보강 (DO6 변경)

`Invoke-HealthCheck` 함수에 arologis endpoint 추가 — 본 PR 에서 적용 (별도 commit 필요 없음, DO5 의 04 문서 검증 체크리스트 자동화):

> 본 PR 의 phase11-deploy.ps1 변경 사항을 다음 section 에서 적용.

---

## 4. Prometheus / Grafana scrape — 변경 0

- Eureka 공유 → `arologis-service` 가 자동 등록 → Prometheus 가 `/actuator/prometheus` 자동 scrape.
- 기존 dashboard `arologis-slip-bridge.json` 그대로 동작 (변경 0).
- 신규 dashboard 추가 시 별도 PR.

---

## 5. 검증 체크리스트 (cutover D+1)

- [ ] EC2 stop 시뮬레이션 → Auto Recovery 5~10분 내 자동 부팅 → 컨테이너 (arologis + samhan-public) 모두 UP
- [ ] Health Check Lambda CloudWatch Logs → 1분 간격 정상 폴링 (api-gateway 만, arologis 미폴링 — 정상)
- [ ] `phase11-deploy.ps1 -Action healthcheck` 실행 → arologis endpoint 도 검증 (본 PR 변경 후)
- [ ] (선택) D-AX-09 결정 후 arologis CloudWatch alarm 별도 PR
- [ ] `docker-compose -f docker-compose.arologis.yml down` 단독 실행 → Samhan Public 14 service 영향 0

---

## 6. 참조

- spec §8: AWS 운영 환경
- spec §10: Roll-back 절차
- `.claude/memory/project_phase11_aws.md`: Phase 11 AWS 단일 환경 + 자동 복구 메모리
- `infrastructure/terraform/ec2.tf`: EC2 + Auto Recovery alarm
- `infrastructure/terraform/lambda.tf`: Health Check Lambda
- `infrastructure/terraform/templates/health_check_lambda.py`: Lambda 핸들러 (Python)
- `infrastructure/scripts/phase11-deploy.ps1`: 배포 자동화 스크립트
