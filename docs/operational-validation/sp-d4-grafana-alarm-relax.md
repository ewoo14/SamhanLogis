# SP-D4 Grafana 알람 임계 임시 완화 가이드

> 작성일: 2026-05-18
> 적용 시점: SP-D4 통합 PR 배포 후 48시간
> 복귀 시점: 48시간 경과 후 운영 grant 분석 완료 시

---

## §1 배경

SP-D4 배포 후 7 도메인 서비스 신규 22 PageCode 에 대한 `PermissionGuard` 가 활성화된다. 초기 운영 중 다음 두 가지 원인으로 **합법적인 403** 이 일시적으로 증가할 수 있다:

1. **점진 grant 미완성** — 일부 사용자의 역할별 grant 가 V10 seed 기본값과 실제 운영 필요 사이에 차이가 있을 수 있음.
2. **RoleGuard fallback 분기** — PermissionGuard deny 후 RoleGuard 통과로 정상 응답되는 경우가 있어 정확한 deny 수치가 초기에 높게 측정될 수 있음.

이 기간 중 불필요한 알람 발생을 줄이기 위해 `permission_guard_denied_total` 알람 임계를 **48시간 한시** 완화한다.

---

## §2 대상 Metric

```
permission_guard_denied_total{
  code=~"estimates.*|sales\\.partner-order.*|inventory.*|admin.*|partners.*|products.*|arologis.*"
}
```

이 레이블 패턴은 SP-D4 신규 22 PageCode 7 그룹 전체를 포괄한다:
- `estimates.*` — 견적 (1 PageCode)
- `sales.partner-order.*` — 거래처주문 (5 PageCode)
- `sales.vendor-order` — 벤더 주문 (1 PageCode) — sales.* 패턴에 포함
- `inventory.*` — 재고 (4 PageCode)
- `admin.*` — 직원/계정 (2 PageCode)
- `partners.*` — 거래처 (4 PageCode)
- `products.*` — 상품 (2 PageCode)
- `arologis.*` — 아로로지스 (2 PageCode)

---

## §3 임계 완화 설정

### 3-1. 배포 전 기본 임계 (운영 정상 상태)

```yaml
# Grafana Alert Rule (현재 기본값)
# 5분 window, rate 기준
expr: |
  rate(
    permission_guard_denied_total{
      code=~"estimates.*|sales\\.partner-order.*|inventory.*|admin.*|partners.*|products.*|arologis.*"
    }[5m]
  ) > 0.5
for: 2m
severity: warning
```

### 3-2. 배포 후 48시간 임시 완화 임계

```yaml
# Grafana Alert Rule (48h 임시 완화)
expr: |
  rate(
    permission_guard_denied_total{
      code=~"estimates.*|sales\\.partner-order.*|inventory.*|admin.*|partners.*|products.*|arologis.*"
    }[5m]
  ) > 5
for: 5m
severity: warning
```

변경 내용 요약:
| 항목 | 기본값 | 임시 완화값 |
|---|---|---|
| rate 임계 | 0.5/s | 5/s |
| for (지속 시간) | 2m | 5m |

### 3-3. 수동 Grafana UI 변경 절차

Grafana UI (http://localhost:3100 — docker-compose 기본 포트 3100:3000 바인딩 또는 AWS Grafana URL) 에서:

1. Alerting > Alert rules 메뉴 진입
2. `SP-D4 PermissionGuard Denied Rate` 규칙 선택
3. `Edit` 클릭
4. `Threshold` 값 `0.5` → `5` 변경
5. `Pending period` `2m` → `5m` 변경
6. `Save rule and exit` 클릭
7. 변경 일시 및 복귀 예정일(+48h) 을 알람 annotation 에 기록

---

## §4 48시간 운영 grant 분석

48시간 동안 아래 쿼리로 실제 deny 패턴 분석:

```
# Grafana Explore — PromQL
# 신규 22 PageCode 별 누적 deny 수
increase(
  permission_guard_denied_total{
    code=~"estimates.*|sales\\.partner-order.*|inventory.*|admin.*|partners.*|products.*|arologis.*"
  }[48h]
)

# 역할별 deny 분포 (X-User-Role label 있는 경우)
sum by (code, role) (
  increase(
    permission_guard_denied_total[48h]
  )
)
```

분석 기준:
- **deny 수 = 0** 인 PageCode: 정상 grant — 알람 임계 즉시 복귀 가능
- **deny 수 > 0** 인 PageCode: 해당 역할 grant 검토 → `role_page_permissions` UPDATE 또는 accept

---

## §5 임계 복귀 절차 (48시간 후)

1. Grafana UI 에서 `SP-D4 PermissionGuard Denied Rate` 규칙 재편집
2. `Threshold` 값 `5` → `0.5` 복귀
3. `Pending period` `5m` → `2m` 복귀
4. 변경 내용 PR 또는 팀 채널에 공유

PowerShell 5.1 에서 복귀 일시 알림 타이머 설정 (선택):

```powershell
# 배포 시각 기록 (48h 후 복귀 참조용)
$deployTime = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Write-Host "SP-D4 배포 시각: $deployTime"
Write-Host "Grafana 알람 복귀 예정: $((Get-Date).AddHours(48).ToString('yyyy-MM-dd HH:mm:ss'))"
```

---

## §6 비정상 급증 판단 기준

완화된 임계(5/s) 를 초과하거나 아래 패턴이 관찰되면 **배포 회귀** 로 간주하고 롤백 검토:

| 패턴 | 판단 | 조치 |
|---|---|---|
| 특정 PageCode deny rate > 50/min 지속 | 배포 회귀 의심 | PermissionGuard 코드 확인, `sp-d4-v10-rollback.sql` 준비 |
| 전체 deny 수가 전 주 대비 10배 이상 | seed 누락 가능성 | V10 row count 154 재확인 |
| MASTER 역할 403 발생 | 심각 오류 | 즉시 롤백 |
| 사용자 로그아웃 불가 / 전체 503 | 서비스 중단 | auth-service 재시작 + Flyway 상태 확인 |

---

## §7 참조

- `docs/operational-validation/sp-d4-v10-rollback.sql` — 긴급 롤백 SQL
- `docs/operational-validation/sp-d4-deploy-rolling-order.md` — 배포 순서 + 장애 대응
- `docs/planning/2026-05-18_sp-d4-remaining-pages-permission-migration.md` §3 DevOps 항목
- `infrastructure/grafana/dashboards/` — 로컬 Grafana 대시보드 설정
