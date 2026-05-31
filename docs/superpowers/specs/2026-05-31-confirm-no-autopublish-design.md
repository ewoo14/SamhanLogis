# 슬라이스 D1 — confirm 자동발행 폐지 (2.6b 분할 ①)

- **작성일**: 2026-05-31
- **상태**: 설계 확정 (개발책임자 승인 2026-05-31)
- **유형**: BE 단독 (partner-order-service) + 최소 FE 확인
- **선행**: 슬라이스 C(창고코드 정렬, #328 `ed7bebee`) 머지 / Phase 2.6c 재고 예약(#327) / 2.6a 부분전환(#325)
- **상위**: `docs/superpowers/specs/2026-05-30-order-to-slip-conversion-design.md` §7 (2.6b). **2.6b 를 D1(confirm 폐지) / D2(다중주문 병합) 으로 분할** — 본 spec 은 D1.
- **관련 메모리**: [[project_partner_order_status_model]], [[feedback_uuid_no_user_visibility]], [[feedback_no_fake_data_ever]]

---

## 1. 배경 / 문제

거래처 포털 confirm(`PartnerOrderConfirmService.confirm`)이 주문 INSERT 직후 **자동으로 출고전표(slip)를 발행**한다:

```
confirm → PartnerOrder.create()(CONFIRMING+PENDING_RETRY)
  → slipServiceClient.publishFromPartnerOrder(buildSlipPayload, idempotencyKey)
     ├ 200 → markSlipPublished → CONFIRMED + slipNo + PUBLISHED
     ├ 409 → 기존 slipNo
     └ 5xx → outbox INSERT(PENDING) + markSlipPendingRetry(CONFIRMED + PENDING_RETRY)
```

이 "confirm 자동발행"은 (i) 주문 확정과 출고전표 발행을 강결합하고, (ii) 부분전환/다중주문 병합(2.6a/2.6c/D2) 의 **명시적 convert 액션 모델과 충돌**한다(confirm 으로 이미 slip 이 발행된 주문은 convert 불가 — slipNo≠null).

반면 견적→주문 경로(`createFromEstimate`)는 **이미 DRAFT + NOT_REQUIRED(slip 미발행)** 로 생성되어 convert 로만 출고전표를 발행한다. 즉 두 주문생성 경로가 비대칭이다.

## 2. 결정 (개발책임자 확정 2026-05-31)

| # | 결정 | 근거 |
|---|---|---|
| D-CF-01 | **2.6b 를 D1(confirm 자동발행 폐지) / D2(다중주문 병합) 로 분할.** D1 먼저 독립 슬라이스. | confirm 폐지가 주문 라이프사이클 근간(전환 일원화)이라 D2 병합의 토대. 각각 독립 테스트·머지. |
| D-CF-02 | **confirm 은 slip 미발행 주문만 생성. 결과 status = DRAFT(진행중) + NOT_REQUIRED.** from-estimate 경로와 일원화. 출고전표는 명시적 convert 액션으로만 발행(완료=CONVERTED). | 두 주문생성 경로 통일 + convert 모델 정합 + churn 최소. CONFIRMING/CONFIRMED/SlipPublishStatus 는 신규 흐름 미사용(레거시 호환만). |
| D-CF-03 | **outbox/scheduler/SlipPublishStatus 는 dormant 유지(코드 제거는 후속).** confirm 신규 enqueue 0, 스케줄러는 레거시 PENDING 행 drain 지속. | 운영 in-flight PENDING_RETRY 주문 안전 + 최소 diff. deprecated 주석으로 후속 제거 표식. |

### 명시적 제외

- **다중주문 병합** (D2 후속): slip N:1 출처추적(slip V10) + `from-orders-merge` API + 헤더 '/'병기 + FE 다중선택.
- **vendor 발주 confirm** (`VendorOrderService.confirm`): 이미 slip 미발행(orderNo 만 부여) — 무영향.
- **레거시 CONFIRMED+slip 주문**: 기존 발행 전표 보존, 불변.
- outbox/scheduler/SlipPublishStatus **코드 물리 제거**: dormant 유지, 제거는 후속.

## 3. 변경 단위

### 3.1 partner-order-service (BE, 단독)

- **`PartnerOrderConfirmService.confirm`**:
  - **slip 발행 블록 삭제** — step 6 의 `slipServiceClient.publishFromPartnerOrder` 호출 + 200 분기(`markSlipPublished` + `SLIP_PUBLISHED` history) + 5xx 분기(`markSlipPendingRetry` + `outboxRepository.save` + `SLIP_RETRY_QUEUED` history) 전부 제거.
  - `slipServiceClient` / `outboxRepository` 의존이 confirm 에서 미사용 → 필드 제거(다른 사용처 없으면). `buildSlipPayload`/`serialize` 도 confirm 전용이면 제거.
  - 주문 생성 = **DRAFT + NOT_REQUIRED**. 현 `PartnerOrder.create()`(CONFIRMING+PENDING_RETRY) 대신 신규 factory `PartnerOrder.createFromConfirm(partnerCode, bizCode, orderNo, idempotencyKey, totalAmount)` 사용 — status=DRAFT, slipPublishStatus=NOT_REQUIRED, confirmedAt=null(또는 접수시각 보존은 선택). (createFromEstimate 와 동형, sourceEstimateId=null.)
  - history: 주문 접수 이벤트(`HistoryEventType.CONFIRMED`) 유지. revision `CREATE` 캡처 유지.
  - idempotencyKey(`PO-CONF-{partnerCode}-{draftSeq}`) + 멱등 재호출 가드(`findByIdempotencyKey`) 유지.
- **`PartnerOrder`**: `createFromConfirm` factory 추가. 기존 `create`/`markSlipPublished`/`markSlipPendingRetry`/outbox 관련 메서드는 **레거시 호환 위해 유지**(deprecated 주석 — confirm 신규 흐름 미사용, 스케줄러/IT 잔존 사용 가능).
- **`ConfirmResponse`**: `slipNo` nullable 반영(confirm 결과 slipNo=null). status=DRAFT 노출. 응답 shape 유지(orderNo 중심, UUID 비공개).
- **outbox/scheduler**: 변경 없음(dormant). `SlipPublishOutboxScheduler` 는 레거시 PENDING 행 drain 계속.

### 3.2 FE (확인 + 최소 조정)

- 거래처 포털(주문 confirm 호출 클라이언트): confirm 성공 처리가 `slipNo` 에 의존하지 않는지 확인. 의존 시 "주문이 접수되었습니다"(slip 비의존) 로 조정. 미의존이면 무변경.
- 본사 데스크톱: confirm 주문이 진행중(DRAFT) 리스트 + 기존 convert UI 로 전환 — **무변경**(자동 동작).

## 4. 흐름 (변경 후)

```
거래처 포털 "주문 확정"
  └ POST /confirm
       └ PartnerOrderConfirmService.confirm
           ① 멱등 가드(findByIdempotencyKey)
           ② dc-config priceVat + product 카탈로그 스냅샷
           ③ PartnerOrder.createFromConfirm → status=DRAFT, slipPublishStatus=NOT_REQUIRED, slipNo=null
           ④ 라인 INSERT + recomputeTotal + save
           ⑤ history(CONFIRMED=주문접수) + revision CREATE
           ⑥ (slip 발행 없음)
       → ConfirmResponse{ orderNo, status=DRAFT, slipNo=null }

본사 데스크톱
  └ 진행중(DRAFT) 주문 → "출고전표 전환"(convert) → reserve + slip 발행(SENT) → CONVERTED   (기존 2.6a/2.6c, 무변경)
```

## 5. 에러 / 엣지

| 상황 | 동작 |
|---|---|
| 동일 idempotencyKey 재confirm | 기존 주문 반환(중복 생성 0) — 기존 유지 |
| dc-config/product 조회 실패 | 기존 예외 처리 유지(slip 무관) |
| slip-service 다운 | **confirm 영향 없음**(더 이상 호출 안 함) — 가용성 개선 |
| 레거시 PENDING_RETRY 주문 | 스케줄러가 계속 drain(dormant outbox) |
| 레거시 CONFIRMED+slip 주문 | 불변(보존) |

## 6. 테스트 전략

- **confirm IT** (Testcontainers, 실 Postgres, SlipServiceClient @MockBean):
  - confirm → 200 + 주문 `status=DRAFT` + `slip_no IS NULL` + `slip_publish_status=NOT_REQUIRED`.
  - `slipServiceClient.publishFromPartnerOrder` **verify(never())** — 호출 0.
  - `slip_publish_outbox` row 0.
  - revision `CREATE` 캡처(revision_no=1).
  - 멱등 재confirm → 동일 주문 반환, 라인 중복 0.
- **회귀**: from-estimate 경로(DRAFT 생성) 무변경, convert 흐름(DRAFT 주문 전환 → CONVERTED) 무변경. 레거시 outbox 스케줄러 IT(있으면) 유지.
- **Docker 실 QA** ([[feedback_no_fake_data_ever]] 실 캡처만): 실 거래처 포털/실 API confirm → partner_order_db `status=DRAFT` + slip_db 신규 PARTNER_ORDER slip **0건**(psql) → 본사 데스크톱 진행중 표시 실 화면 → convert → slip 발행(SENT) 실 화면.

## 7. 마이그레이션 / 배포

- Flyway **불필요**(enum 추가 없음, status VARCHAR CHECK 제약 없음). 기존 데이터 불변.
- partner-order-service **단독 배포**(slip-service/FE 영향 최소).

## 8. 미해결 / 후속

- **D2 다중주문 병합**: slip N:1 출처추적 + `from-orders-merge` + 헤더 '/'병기 + FE 다중선택. confirm 폐지(D1)로 모든 주문이 DRAFT→convert 일원화된 토대 위에 구축.
- outbox/scheduler/SlipPublishStatus/`markSlipPublished`/`markSlipPendingRetry` **코드 물리 제거** — 레거시 PENDING_RETRY 주문 0 확인 후 별도 정리 슬라이스.
- confirm 의 `confirmedAt`(접수시각) 보존 여부 — D1 은 status=DRAFT 이므로 confirmedAt=null(from-estimate 동형). 접수시각 별도 표시 필요 시 후속.
