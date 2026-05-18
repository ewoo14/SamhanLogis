# SP-D5 Grafana 대시보드 텍스트 Mock — permission_guard_denied_total

**슬라이스**: SP-D5 PermissionGuard 단일화 + Counter.builder + AOP 통합  
**작성일**: 2026-05-19  
**담당**: UI/UX Designer agent (DevOps 협업 참고용)  
**대상 독자**: DevOps agent / 운영팀 (Grafana 대시보드 구성 참고)

> 본 문서는 **Grafana 운영 전용 화면** 의 텍스트 mock 이다.  
> Samhan Public / 아로로지스 사용자 화면에 노출되는 UI 가 아니다.  
> 디자인 토큰 / 컴포넌트 변경 없음. DevOps 참고 목적으로만 제공한다.

---

## 대시보드 구성 개요

```
대시보드 이름: SamhanLogis - 권한 가드 모니터링
폴더:         SamhanLogis / Operations
갱신 주기:    30초 (auto-refresh)
시간 범위:    기본 Last 1h
```

---

## 패널 1 — 거부 총계 (Stat Panel)

```
제목:    권한 거부 총계 (24h)
쿼리:    increase(permission_guard_denied_total[24h])
단위:    회
임계값:
  - 0~9:   초록 (정상)
  - 10~49: 노랑 (주의)
  - 50+:   빨강 (경보)
크기:    4열 × 2행 (Grafana grid 단위)
```

---

## 패널 2 — 시간대별 거부 추이 (Time Series)

```
제목:    권한 거부 시간대별 추이
쿼리:    rate(permission_guard_denied_total[5m])
범례:    {{service}} / {{page}} / {{action}}
Y축:     거부 건수/분
X축:     시간 (Last 1h)
색상:    기본 Grafana palette (빨강 계열 권장)
크기:    8열 × 4행
```

---

## 패널 3 — 서비스 × 페이지 분류 (Bar Chart)

```
제목:    서비스 × 페이지 권한 거부 Top 10
쿼리:    topk(10, sum by (service, page) (increase(permission_guard_denied_total[1h])))
그룹:    service (예: arologis-service, slip-service)
색상:    service 별 자동 배색
크기:    6열 × 4행
```

---

## 패널 4 — 역할별 거부 (Pie Chart)

```
제목:    역할별 권한 거부 분포
쿼리:    sum by (role) (increase(permission_guard_denied_total[1h]))
역할 라벨:
  MASTER    → 마스터
  MANAGER   → 관리자
  SALES     → 영업
  PURCHASE  → 구매
  DRIVER    → 기사
  ACCOUNTANT→ 경리
  READONLY  → 조회전용
크기:    4열 × 4행
```

---

## 패널 5 — 알림 규칙 참고

```
알림 이름: permission_guard_denied_spike
조건:      increase(permission_guard_denied_total[10m]) > 20
채널:      Slack #ops-alert (기존 DevOps 채널)
메시지 예: "[경보] 권한 거부 급증: 10분간 {{value}}건 (임계 20건)"
메모:      단순 권한 설정 오류 vs 보안 침해 시도 구분을 위해
           동일 IP / 동일 role 필터 병행 권장
```

---

## Counter 레이블 설계 (BE 참고)

`PermissionGuardMetrics.Counter.builder("permission_guard_denied_total")` 권장 태그:

| 태그 키 | 예시 값 | 용도 |
|--------|--------|------|
| `service` | `arologis-service` | 서비스 식별 |
| `page` | `dispatch.board` | PageCode (BE dot-separated) |
| `action` | `VIEW` / `EDIT` | 액션 타입 |
| `role` | `SALES` | 요청 역할 (열거형) |

> PageCode 는 SP-D1 decisions.md §D-6 에서 확정된 BE dot-separated 체계 (`dispatch.board`, `admin.permissions` 등) 를 그대로 사용한다.

---

## 운영 유의사항

1. 해당 대시보드는 **운영팀 / DevOps 전용**이다. 일반 사용자 (SALES / DRIVER 등) 화면에 노출하지 않는다.
2. `permission_guard_denied_total` 은 보안 감사 (audit) 목적이 강하므로 Prometheus retention 을 30일 이상으로 설정한다.
3. Grafana 접근 권한은 MASTER / DevOps 계정으로 제한한다 (Samhan Public admin 계정과 동일 정책).
4. 본 mock 은 DevOps agent 가 실제 Grafana JSON 으로 변환 시 참고용이다. 색상 / 레이아웃은 Grafana 기본 팔레트 사용 권장 (SamhanLogis design-system 토큰 미적용).
