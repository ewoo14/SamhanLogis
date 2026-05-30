# DevOps 리뷰 — Phase 2.5 주문 보류(ON_HOLD) + 상태 필터 (Cycle 1)

- 브랜치: `feat/phase-2-5-partner-order-hold-status-filter`
- HEAD: f8a3c211
- 리뷰일: 2026-05-30
- 검토자: DevOps (Claude)

---

## 점검 1: 마이그레이션 불필요 주장 검증 [결론: PASS]

**검증 근거**

`V1__init_partner_order.sql` 21번째 줄:

```sql
status  VARCHAR(20)  NOT NULL,
```

`status` 컬럼은 순수 `VARCHAR(20)` 으로 선언되어 있다. `CHECK` 제약, PostgreSQL `ENUM` 타입(`CREATE TYPE ... AS ENUM`), `CHECK (status IN (...))` 패턴이 V1~V7 어느 마이그레이션에도 존재하지 않는다. V2~V6 에서도 `status` 컬럼에 대한 ALTER/CHECK 추가 이력 없음을 확인했다.

따라서 `ON_HOLD` 문자열을 INSERT 하더라도 DB 레이어에서 거부되지 않는다. 마이그레이션 파일 불필요 주장은 정확하다.

**추가 확인**

`HoldStatusFilterIT`의 helper `buildOrderWithStatusViaDb`가 `status` 파라미터로 `'ON_HOLD'` 문자열을 직접 JDBC INSERT하는 방식으로 작성되어 있어, Testcontainers 실 Postgres 환경에서 V1 Flyway가 실행된 후 ON_HOLD INSERT가 DB 거부 없이 동작함을 케이스2 에서 실제로 검증한다.

---

## 점검 2: 기존 데이터 영향 [결론: 무영향 확인]

`ON_HOLD`는 신규 열거값 추가이며 기존 row의 status를 변경하지 않는다. JPA `@Enumerated(EnumType.STRING)` + VARCHAR 컬럼 조합에서 기존 `DRAFT / CONFIRMING / CONFIRMED / CANCELED` row는 영향 없다. 단방향 전이(`DRAFT ↔ ON_HOLD`)이므로 기존 CONFIRMED 데이터에 대한 영향 경로도 없다.

Flyway 버전 파일 신설 없이 애플리케이션 레이어만 변경하므로 Flyway checksum 재계산 없음. 롤백 시나리오에서도 DB에 ON_HOLD 문자열이 잔류할 수 있으나, 이전 코드가 ON_HOLD enum 값을 인식 못해 `IllegalArgumentException`이 발생한다. 다만 이는 마이그레이션 없는 신규 enum 추가의 일반적 주의사항이며, Phase 11 단일 환경 구성상 롤백 보다 forward-only 배포가 정책이므로 현재 리스크 수용 범위 내다.

---

## 점검 3: CI partner-order-service 빌드·테스트 + HoldStatusFilterIT [결론: 정상 포함]

**matrix 확인**

`.github/workflows/ci.yml` matrix 그룹 `accounting+partner` (timeout 30분):

```
':services:accounting-service:test :services:partner-service:test
 :services:partner-auth-service:test :services:partner-order-service:test
 :services:dc-config-service:test'
```

`partner-order-service:test`가 명시적으로 포함되어 있어 `HoldStatusFilterIT`가 이 그룹에서 실행된다.

**paths-ignore 영향 없음**

변경 파일:
- `services/partner-order-service/src/**` — paths-ignore 대상 없음
- `clients/desktop/src/**` — paths-ignore 대상 없음 (`clients/arologis-*`만 제외)
- `.github/workflows/ci.yml` 자체 변경 없음

`docs/**`는 paths-ignore 대상이나 이번 슬라이스에서 `docs/dev-reports/`, `docs/qa/`, `docs/superpowers/` 등 docs 계열 변경이 포함되어 있다. docs 단독 변경이면 CI가 skip되지만, `services/`와 `clients/` 변경이 함께 포함되어 있으므로 PR 기준 paths 트리거가 활성화된다. CI 실행에 문제 없다.

**Tesseract 설치 step**

`accounting+partner` 그룹에만 Tesseract OCR 사전 설치 step이 있어 일관성 있게 적용된다.

**Testcontainers Docker**

`HoldStatusFilterIT extends AbstractPostgresIT` 구조로 Docker 미가용 시 자동 skip 처리. CI ubuntu-latest 환경에서는 Docker가 가용하므로 실제 실행된다.

---

## 점검 4: 배포 의존성 단순성 [결론: 단순 — 조건부 주의 1건]

**단일 서비스 + FE 변경**

변경 범위: `partner-order-service` BE + `clients/desktop` FE. 다른 서비스의 application.yml 또는 .env 템플릿 변경 없음.

**auth seed 변경 없음 확인**

`PartnerOrderHoldController`가 `@RequirePermission(page = "sales.partner-order.edit", action = PermissionAction.UPDATE)`를 재사용하므로 기존 seed에 이미 존재하는 권한을 그대로 활용한다. 신규 권한 시드 INSERT 없이 배포 가능.

**[Minor] 배포 순서 권장**

FE가 `POST /{id}/hold`와 `POST /{id}/release` 엔드포인트를 직접 호출한다. BE 배포 전에 FE가 먼저 배포되면 404가 반환된다. Phase 11 단일 EC2 docker-compose 환경에서 BE → FE 순서로 배포하면 무중단이나, 순서 역전 시 짧은 404 노출이 가능하다. 배포 스크립트에서 `partner-order-service` 재시작 후 FE 빌드 배포 순서를 명시하는 것이 권장된다. 현재 단계(로컬 개발)에서는 영향 없음.

---

## 점검 5: 운영 관측 및 모니터링 [결론: 보류 전이 로그 존재, Minor 1건]

**보류 전이 로그**

`PartnerOrderHoldService.hold()` / `release()`는 `partnerOrderRepository.saveAndFlush(order)`를 호출하므로 DB 레이어에서 `modified_at`, `modified_by`가 자동 갱신된다 (BaseEntity 감사 필드). 도메인 메서드 `markOnHold()` / `releaseHold()` 자체는 상태를 직접 변경하므로 상태 전이가 DB에 즉시 반영된다.

**[Minor] STATUS revision 캡처 미연결**

`PartnerOrderHoldService` Javadoc에 "향후 STATUS revision 캡처 연결을 위해 actorId/actorName 시그니처에 유지"라고 명시되어 있으나, 현재 Phase 2.5 구현에서는 `partner_order_revisions` 테이블에 `revision_type=STATUS` 행이 INSERT되지 않는다. Phase 2.4에서 구현된 revision 캡처 패턴이 보류/해제 전이에는 적용되지 않으므로, 운영 중 "누가 언제 보류했는가"를 `partner_order_revisions`에서 추적할 수 없다. `partner_order_front_event_log` 또는 별도 감사 로그로 보완하거나, 후속 슬라이스에서 revision 훅 연결이 필요하다.

**알림/모니터링 영향 없음**

`slip_publish_status` 변경 없음. Prometheus/Grafana 대시보드의 slip outbox 메트릭, FAILED_PERMANENT 알림 경로는 보류 상태와 무관하다. `outbox` 테이블은 CONFIRMED 이후 생성되므로 ON_HOLD 상태에서는 outbox 경로 자체가 비활성이다.

**라벨 변경 영향 없음**

FE의 `PARTNER_ORDER_STATUS_LABEL` 매핑에서 `DRAFT: '진행중'`, `ON_HOLD: '보류'`로 정의되어 있다. 이는 UI 표시 레이블이며 기존 DRAFT 라벨("진행중")이 변경되지 않는다. 운영 알림 텍스트(Slack, 이메일 등)가 status 문자열을 직접 참조하는 경우가 없으므로 영향 없다.

---

## 결함 요약

| 번호 | 심각도 | 내용 |
|---|---|---|
| D-1 | Minor | 배포 순서 문서화 미비 — BE 먼저 배포 전제가 배포 스크립트에 명시되지 않음 |
| D-2 | Minor | 보류/해제 전이 시 `partner_order_revisions` STATUS revision 미캡처 — 운영 감사 추적 공백 |

P0/P1/P2 결함 없음.

---

## DevOps APPROVE

마이그레이션 불필요 주장이 V1 스키마 검토를 통해 확인되었다. CI matrix에 `partner-order-service:test`가 포함되어 `HoldStatusFilterIT`가 정상 실행된다. auth seed 변경 없이 기존 edit 권한을 재사용하는 배포 의존성이 단순하다. Minor 2건은 후속 슬라이스 또는 배포 가이드 보완으로 처리 가능하다.
