# 슬라이스 D1 — confirm 자동발행 폐지 (dev-report)

- **작성일**: 2026-05-31
- **브랜치**: `feat/slice-d1-confirm-no-autopublish`
- **spec**: `docs/superpowers/specs/2026-05-31-confirm-no-autopublish-design.md`
- **plan**: `docs/superpowers/plans/2026-05-31-confirm-no-autopublish.md`
- **상위**: 2.6b 분할 ① (`docs/superpowers/specs/2026-05-30-order-to-slip-conversion-design.md` §7). ② 다중주문 병합 = D2 후속.

---

## 1. 목표 / 배경

거래처 포털 confirm(`PartnerOrderConfirmService.confirm`)이 주문 INSERT 직후 **자동으로 출고전표(slip)를 발행**(200→CONFIRMED+slipNo / 5xx→outbox PENDING_RETRY)했다. 이 강결합은 (i) 주문 확정과 전표 발행을 묶고, (ii) 부분전환/병합(2.6a/2.6c/D2)의 명시적 convert 모델과 충돌(confirm 발행 주문은 slipNo≠null → convert 불가)했다. 반면 from-estimate 경로는 이미 DRAFT+NOT_REQUIRED(slip 미발행)였다.

→ **confirm 을 slip 미발행 DRAFT 주문 생성으로 변경**하여 두 주문생성 경로를 일원화. 출고전표는 명시적 convert 액션으로만 발행(완료=CONVERTED).

## 2. 결정 (DECISIONS D-CF-01~03)

- **D-CF-01**: 2.6b 를 D1(confirm 자동발행 폐지) / D2(다중주문 병합) 로 분할.
- **D-CF-02**: confirm 은 slip 미발행 주문만 생성, 결과 status=DRAFT(진행중) + NOT_REQUIRED. CONFIRMING/CONFIRMED/SlipPublishStatus 는 신규 흐름 미사용(레거시 호환만).
- **D-CF-03**: outbox/scheduler/SlipPublishStatus 는 dormant 유지(코드 물리 제거는 후속). 스케줄러는 레거시 PENDING 행 drain 지속.

## 3. 변경 요약 (커밋)

| 커밋 | 영역 | 내용 |
|---|---|---|
| `85d6150f` | partner-order-service | `PartnerOrder.createFromConfirm`(DRAFT+NOT_REQUIRED) 추가 + `confirm` slip 발행 블록 제거(publish/markSlipPublished/markSlipPendingRetry/outbox enqueue/SLIP_* history) + 미사용 의존(slipServiceClient/outboxRepository/objectMapper/buildSlipPayload/serialize) 제거 + confirm IT 재작성 |
| (FE) | order-app | **무변경** — confirm 성공 핸들러가 `res.ok`/`res.error`만 사용(slipNo/status 비의존), 고정 메시지 "전송이 완료되었습니다" |

## 4. 함수 단위 문서

### `PartnerOrder.createFromConfirm(partnerCode, bizCode, orderNo, idempotencyKey, totalAmount)`
- `new PartnerOrder(...)` 후 status=DRAFT, slipPublishStatus=NOT_REQUIRED, confirmedAt=null 설정. `createFromEstimate` 와 동형(sourceEstimateId 없음). 거래처 직접 주문의 진행중 베이스라인.

### `PartnerOrderConfirmService.confirm(...)`
- 흐름: 멱등 가드 → dc-config priceVat + product 카탈로그 스냅샷 → `createFromConfirm`(DRAFT) → 라인 INSERT + recomputeTotal + save → history(CONFIRMED=주문접수) + revision CREATE 캡처 → `ConfirmResponse.from(order)`(slipNo=null, status=DRAFT). **slip-service 미호출.**
- 레거시 `create`/`markSlipPublished`/`markSlipPendingRetry` 는 PartnerOrder 에 유지(deprecated 주석) — 레거시 PENDING_RETRY 주문 / outbox 스케줄러 호환.

## 5. 테스트

- **confirm IT** (`PartnerOrderConfirmServiceIT`, 실 Testcontainers): `confirm_creates_draft_order_without_slip_publish`(status=DRAFT + slipNo=null + NOT_REQUIRED + `slipServiceClient` verify never) + `confirm_does_not_enqueue_outbox`(outbox count 불변). → 2 PASS.
- **회귀**: `./gradlew :services:partner-order-service:test` 전체 PASS(PartnerOrderConvertIT 10 + 단위 + 기타 IT, skipped=0). from-estimate/convert 무변경.

## 6. 운영 영향 (명시)

confirm 주문은 더 이상 자동 회계전표(slip)를 만들지 않는다 → **본사가 명시적으로 convert 해야 출고전표/회계 귀속 발생**(spec §7 의도). 진행중 주문 누락 방지는 리스트 기본필터(진행중) 가시화로 커버. 부수 효과: **slip-service 다운 시에도 confirm 200 성공**(가용성 개선 — 더 이상 confirm 이 slip-service 에 동기 의존하지 않음).

## 7. 마이그레이션 / 배포

- Flyway 불필요(enum 추가 없음, 기존 CONFIRMED+slip 주문 불변).
- partner-order-service 단독 배포.

## 8. 미해결 / 후속

- **D2 다중주문 병합**: slip N:1 출처추적(slip V10) + `from-orders-merge` API + 헤더 '/'병기 + FE 다중선택. D1로 DRAFT→convert 일원화된 토대 위 구축.
- outbox/scheduler/SlipPublishStatus/`markSlipPublished`/`markSlipPendingRetry` **코드 물리 제거** — 레거시 PENDING_RETRY 주문 0 확인 후 별도 정리.
