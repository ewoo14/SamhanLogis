# slip-service

SamhanLogis 출고/입고 전표 (STI) 서비스 — 10단계 라이프사이클 + 모바일 전자서명 + Phase 6 M5 통합 발행 endpoint.

- 포트: **8086**
- DB: PostgreSQL `slip_db` (service-per-DB), Flyway 자동 마이그레이션 (V1 ~ V8)
- 외부 의존: inventory-service (8085, FIFO 차감) / product-service (8084, 라인 lookup) / partner-order-service (8088) / Solapi or 알리고 SMS

## 기능 요약

### Phase 2 / 3 (운영)
- 10단계 라이프사이클 (DRAFT → REQUESTED → APPROVED → DISPATCHED → DELIVERED → ...)
- dispatcher / inspector 자동 서명 + 라인 specification
- DeliveryBatch + Solapi/알리고 SMS 발송
- 모바일 전자서명 (Canvas + SHA-256, 인수자/기사 양측 캡처)
- DispatchView 인쇄 통합 (양측 서명 PNG 자동 통합)

### Phase 6 M5 — 통합 발행 endpoint (Sync REST + idempotency 3중 격리)

3중 idempotency 격리:
1. DB partial UNIQUE INDEX (`idempotency_key` IS NOT NULL)
2. Service fingerprint (sourceType + sourceId + 라인 hash)
3. Outbox (별 슬라이스 — partner-order-service 가 발행)

`SlipSourceType` enum: `ESTIMATE / PARTNER_ORDER / MANUAL / MIGRATED_ECOUNT`

| Method | Path | 권한 |
|---|---|---|
| POST | `/api/v1/slips/from-estimate` | SALES / MANAGER / MASTER / INTEGRATION |
| POST | `/api/v1/slips/from-partner-order` | MANAGER / MASTER / INTEGRATION / PARTNER_ADMIN |
| GET | `/api/v1/slips/by-source` | 인증 |

응답: 201 신규 / 200 replay (동일 idempotency_key 재호출) / 409 idempotency 충돌 / 400 입력 / 403 권한.

### SP-D7 잔여 조회 endpoint 권한 전환 (2026-05-27)

댓글, 감사 이력, 전표 첨부, 배송 첨부, 발행 source 조회, realtime SSE, 수정요청 목록,
견적 list/detail 10개 endpoint는 `@RequirePermission(..., VIEW)`로 전환했다.
재사용 page의 VIEW grant는 auth-service V38 seed가 모든 활성 비즈니스 role로 보강한다.

### 발행 감사 (`SlipPublishAudit`)

영구 보존 (soft-delete 만 허용). 회계 cross-check + supply/vat 합계 round-trip 검증.

### Phase 10 W10-4 (PR #99) — 전자서명 source 분리 (LINK + APP) + 신규 internal endpoint

전자서명 발급 source 분리:
- `SignatureSource.LINK` — 기존 SMS/Aligo 공개 모바일 endpoint 발급 (`/public/batches/.../signature`)
- `SignatureSource.APP` — arologis 모바일 어플 직접 캡처 (W10-3 driver-app)

`SignatureChannel` (입력 매체) 과 직교:

| | SignatureChannel (V5) | SignatureSource (V10) |
|---|---|---|
| 의미 | 입력 매체 | 발급 경로 |
| 값 | MOBILE_CANVAS / PAPER_SCAN | LINK / APP |

신규 endpoint (`/internal/**` prefix, `InternalTokenFilter` + ROLE_MASTER):

| Method | Path | 설명 |
|---|---|---|
| POST | `/internal/slips/{slipId}/signatures` | APP source 등록 (arologis 어플 전파) — driverCode 명시 시 기사 서명 분기 |
| GET | `/internal/slips/by-partner/{partnerId}/recent` | partnerId 의 최근 활성 슬립 lookup (arologis SlipResolver 매핑 단계용) |

응답 schema (W10-3 F-3 채택 — ApiResponse wrapper IT 의무):
```json
{
  "success": true,
  "data": {
    "slipId": "<uuid>",
    "slipNo": "yyyy/MM/dd-N",
    "signatureSource": "APP",
    "signedAt": "2026-05-07T14:30:00",
    "driverSignedAt": null,
    "signatureHash": "<sha256>",
    "signed": true,
    "driverSigned": false
  }
}
```

가드:
- POST endpoint 는 `signatureSource=APP` 만 허용 (LINK 는 기존 공개 모바일 endpoint 사용 — 400 가드)
- `Slip.recordSignature` / `recordDriverSignature` 4-arg / 3-arg 시그니처 보존 + source overload (LINK 자동 위임) — 기존 호출자 영향 0
- Flyway V10 — DEFAULT 'LINK' backfill, partial index 2종 (APP source 운영 통계용)

## 30 endpoint

기존 Phase 2 / 3 endpoint 23 + Phase 6 M5 endpoint 3 + 부가 4 = **30 endpoint**.

### SP-08-5-1 매입 목록·상세 R1/R2 (2026-05-17 구현)

매입/구매전표는 별도 `PurchaseSlip` 없이 `Slip(type=INBOUND)`로 처리한다.

| Method | Path | 권한 | 비고 |
|---|---|---|---|
| GET | `/api/v1/slips?type=INBOUND&from=&to=&page=&size=` | WAREHOUSE / MANAGER / MASTER | gateway strip 후 `/slips`; `slipType=INBOUND`도 유지 |
| GET | `/api/v1/slips/{id}` | WAREHOUSE / MANAGER / MASTER (INBOUND일 때) | lines + 거래처 + `inspectionStatus` |

정책:
- `INVENTORY`는 SP-03 구매관리 검수 CTA 정책과 동일하게 매입 R1/R2 표면에서 제외한다.
- 목록 기본 정렬은 `slipDate DESC, seqNo DESC`.
- 상세 `inspectionStatus`: INBOUND `SAVED / CONFIRMED`는 `READY`, 그 외는 `NOT_READY`.

### SP-08-5-2 매입 수정 direct PUT (2026-05-18 구현)

legacy GAS의 매입 row 즉시 수정 사용감을 `Slip(type=INBOUND)` direct PUT으로 고정한다.

| Method | Path | 권한 | 비고 |
|---|---|---|---|
| PUT | `/api/v1/slips/{id}` | WAREHOUSE / MANAGER / MASTER | gateway strip 후 `/slips/{id}`; INBOUND 전용 |

정책:
- `updatedAt` 낙관적 잠금으로 stale edit을 409 `SLIP_OPTIMISTIC_LOCK_CONFLICT`로 차단한다.
- 라인 누락/수량·단가 0 이하/상품 ID 누락은 422 `SLIP_UPDATE_INVALID_LINE`으로 차단한다.
- 성공 시 `slip_audit_logs`에 `SLIP_EDIT` action을 revision 1건으로 기록한다.
- V1부터 존재하는 `slips.version` JPA `@Version` 컬럼을 재사용하므로 별도 `lock_version` Flyway는 추가하지 않는다.
- 기존 `SlipEditRequestController`의 요청→승인 flow는 유지하고, direct PUT은 본사 운영자 즉시 수정 전용으로 분리한다.

### SP-08-3-3 전표정리 history API (2026-05-17 구현)

legacy GAS `전표정리리스트`의 저장/복원 흐름을 `slip_cleanup_save_history`로 추가했다.

| 기존 endpoint | history endpoint | programType | saveMode |
|---|---|---|---|
| `GET /slips/cleanup` | `POST/GET /slips/cleanup/history` + detail/latest | `SLIP_CLEANUP` | `AUTO_LATEST`, `MANUAL_NAMED` |

신규 table은 BaseEntity 7 audit + Soft Delete only, JSONB payload, 사용자 격리, AUTO_LATEST partial unique, payload 100KB guard, 한국어 Javadoc + springdoc `@Operation`을 따른다.

## Domain 핵심 변경 (Phase 6 M5)

| 변경 | 위치 |
|---|---|
| `Slip` 3 컬럼 추가 | `sourceType` / `sourceId` / `idempotencyKey` |
| `assignPublishSource()` 1회성 setter | 재할당 차단 |
| `SlipSourceType` enum 신규 | 출처 분류 |
| `SlipPublishAudit` 신규 entity | 회계 영구 보존 |

## Flyway 마이그레이션 (Phase 6 + 10)

| 버전 | 내용 |
|---|---|
| V7 | Slip 3 컬럼 + partial UNIQUE INDEX + composite INDEX |
| V8 | slip_publish_audit 테이블 + jsonb 컬럼 |
| V9 | slip_publish_audit fingerprint 컬럼 추가 |
| V10 | (Phase 10 W10-4) signature_source 컬럼 3개 — slips 인수자 + 기사 + slip_signature_audit, NOT NULL DEFAULT 'LINK' backfill, APP partial index 2종 |

## Environment variables

| 변수 | 기본값 | 비고 |
|---|---|---|
| `DB_*` | `slip_db` 등 | placeholder |
| `EUREKA_URL` | `http://localhost:8761/eureka/` | |
| `INTERNAL_TOKEN` | `dev-internal-token-change-me` | prod default 사용 시 부팅 거부 |
| `app.publish.warehouse-code-map` | env-driven (legacy 코드 → UUID) | 후속에 warehouse-service RestClient 진화 |
| `SOLAPI_API_KEY` / `SOLAPI_API_SECRET` / `SOLAPI_SENDER_PHONE` | (mock 활성 시 미사용) | dev/staging/prod 필수 |

H2 local 프로파일은 `MockSmsGateway` 자동 활성으로 SOLAPI 변수 미설정 가능.

## Local run

```bash
./gradlew :services:slip-service:bootRun --args='--spring.profiles.active=local'
```

## Tests

```bash
./gradlew :services:slip-service:test
```

- 단위 테스트 — 라이프사이클 transition / idempotency 검사 / payload 매핑
- IT — Testcontainers PostgreSQL + ProductClient / InventoryClient `@MockBean`
- `SlipPublishControllerIT` 7 case (M5 통합 발행)

## 후속 작업

- Phase 7 — `qa/playwright/confirm/confirm-slip-publish.spec.ts` 가 본 endpoint 의 idempotency 를 e2e 검증
- 자세한 매트릭스는 `docs/dev-reports/migration-be-m5-slip-service-integration.md` 참조

## Phase 8 호환성 가드 (PR #88 / #89 / #90)

- **chained-default 환경변수** — `SAMHAN_<KEY>:${LEGACY_KEY:default}` 패턴 적용 (legacy 호환 100%, 무중단 cutover 가능). `SAMHAN_INTERNAL_TOKEN:${INTERNAL_TOKEN:dev-internal-token-change-me}` 형태.
- **12-factor 12/12 OK** + RDS 호환 (V1~V8 standard SQL 만 — Flyway baseline PASS 검증 결과 22 file 중 본 service 7 file 포함)
- **AWS 서비스 매핑** — `docs/migration/phase8/M-AWS-COMPATIBILITY-guards.md` 본 service 항목 참조 (S3 endpoint override 대상 — signature PNG)
- **env-template** — `infrastructure/env-templates/slip-service.env` 보유 (`SOLAPI_*` 포함)
- **Secrets Manager rotation 대상** — `SAMHAN_INTERNAL_TOKEN` (90일) / `RABBIT_PASSWORD` / `SOLAPI_API_SECRET` 은 Phase 11 cutover 시점 `docs/migration/phase8/M-SECRETS-ROTATION-spec.md` 의 lambda 로 자동 rotation
- **ServiceDiscoveryClient (Phase 11 활성 대비)** — `shared:discovery-abstraction` 의존성 도입은 Phase 11 cutover 시점

## Phase 9 신규 service 매트릭스 (참조)

| Service                | Port | DB                | 도메인                              |
| ---------------------- | ---- | ----------------- | ----------------------------------- |
| partner-service        | 8095 | partner_db        | 거래처 마스터 + 신용한도 + 거래내역 |
| groupware-service      | 8092 | groupware_db      | 결재선 + 메신저 + 일정              |
| notification-service   | 8093 | notification_db   | 푸시/이메일/SMS 통합 라우터         |
| dashboard-service      | 8094 | dashboard_db      | KPI + 실시간 재고 + 매출            |

partner-service 도입 후 본 service 의 `/from-*` endpoint 가 사용하는 partnerCode → partnerId lookup 의존성이 정규화 예정. notification-service 도입 후 SMS Aligo 통합도 본 service → notification-service routing 으로 이전. 상세는 `docs/migration/phase9/M-PHASE-9-readiness.md` 참조.
