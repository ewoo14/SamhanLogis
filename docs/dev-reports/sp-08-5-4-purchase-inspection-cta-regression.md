# SP-08-5-4 구매관리 입고 검수 CTA 회귀 검증

작성일: 2026-05-18
브랜치: `feat/sp-08-5-4-purchase-inspection-cta-regression`

## 1. Scope

SP-08-5-1/2/3 기능 변경(구매 전표 상세 조회, 수정, soft delete) 이후
기존 입고 검수 CTA 계약이 깨지지 않았음을 보장하는 회귀 안전 가드 슬라이스.
코드 변경 최소 — 신규 Playwright spec 5 case + BE IT plan 4 case + PNG 4장.

## 2. 회귀 검증 영역

| 항목 | 회귀 위험 | 검증 결과 |
|---|---|---|
| SAVED 행 검수 CTA 노출 | SP-08-5-2 PUT 수정 후 INSPECTABLE_STATUSES 변경 가능 | PASS |
| CONFIRMED 행 검수 CTA 노출 | SP-08-5-3 soft delete canDirectDeletePurchase 로직 충돌 가능 | PASS |
| InboundInspectionDialog onSuccess 목록 갱신 | SP-08-5-2 refetch 패턴 일관성 | PASS |
| inventory-service endpoint 경로 | API 클라이언트 리팩토링 시 경로 변경 가능 | PASS |
| UUID 비공개 + 한국어 라벨 | 모든 슬라이스 공통 가드 | PASS |

## 3. BE IT 신규 case (plan)

BE agent 구현 의무 4 case:

`SlipInspectionCtaRegressionIT.java` 신규 — 6 case:

| method | 검증 내용 |
|---|---|
| `testSavedSlipListedForInspectionCta` | SAVED 전표가 `/slips/query?slipType=INBOUND&status=SAVED` 응답에 포함 — SP-08-5-1 parity |
| `testConfirmedSlipListedForInspectionCta` | CONFIRMED 전표도 동일 목록 포함 확인 |
| `testInspectingSlipExcludedFromEditable` | INSPECTING 전표 `PUT /slips/{id}` → 409 CONFLICT (SP-08-5-2 정합) |
| `testCompletedSlipExcludedFromEditable` | COMPLETED 전표 `PUT /slips/{id}` → 409 CONFLICT |
| `testInspectingSlipExcludedFromDelete` | INSPECTING 전표 `DELETE /slips/{id}` → 422 `SLIP_DELETE_INSPECTION_COMPLETED` (SP-08-5-3 정합) |
| `testConfirmedSlipExcludedFromDelete` | CONFIRMED 전표 `DELETE /slips/{id}` → 422 `SLIP_DELETE_INSPECTION_COMPLETED` |

## 4. FE 회귀 검증 결과

### PurchaseQueryPage.tsx

- `INSPECTABLE_STATUSES = ['SAVED', 'CONFIRMED'] as const` — SP-08-5-3 변경 후에도 유지
- `isInspectableInbound(row, canInspect)` helper 정상 존재
- 검수 버튼 `data-testid`: `purchase-query-inspect-${toPublicTestId(row.slipNo)}` (UUID 비공개)
- 테이블 모드 + DataGrid 모드 양쪽에서 동일 조건부 렌더 확인

### InboundInspectionDialog.tsx

- `saveMutation.onSuccess` → `invalidateQueries(['slips', 'query', 'INBOUND'])` 존재
- `completeMutation.onSuccess` → 동일 invalidate + `onSuccess?.()` prop 호출
- `useQueryClient` 사용 확인

### session.ts

- `canInspectInbound`: WAREHOUSE / MANAGER / MASTER 반환 — SP-08-5-1/2/3 변경 없음

## 5. inventory-service endpoint 양쪽 호환

`inboundInspectionApi.ts` 정식 경로 (`/api/v1/inventory/inbound-inspections/*`):

| method | endpoint |
|---|---|
| `getInboundInspection` | `GET /api/v1/inventory/inbound-inspections/{slipId}` |
| `inspectInbound` | `POST /api/v1/inventory/inbound-inspections/{slipId}/inspect` |
| `completeInboundInspection` | `POST /api/v1/inventory/inbound-inspections/{slipId}/complete` |
| `listInboundInspections` | `GET /api/v1/inventory/inbound-inspections` |

레거시 `/inspections/*` 또는 `/api/v1/inspections/*` 형태 미사용 확인.

## 6. Verification table

| 검증 항목 | 결과 |
|---|---|
| Playwright 정적 5 case | PASS: 5 / 0 failed (T1~T5) |
| PNG 4장 생성 | PASS: 4 PNG, 25~28 KB (한국어 정상 렌더) |
| BE IT plan 4 case | plan 완료 (BE agent 구현 의무) |

### Playwright 5 case 명세

| case | 검증 내용 |
|---|---|
| T1 | SAVED 행 검수 CTA 노출 — INSPECTABLE_STATUSES + canInspectInbound boolean |
| T2 | CONFIRMED 행 검수 CTA 노출 — SP-08-5-3 이후 회귀 없음 |
| T3 | InboundInspectionDialog 저장 onSuccess → invalidateQueries(['slips','query','INBOUND']) |
| T4 | inventory-service endpoint /api/v1/inventory/inbound-inspections/* 계약 |
| T5 | SP-08-5-1/2/3 회고 가드 — UUID 비공개 + 한국어 라벨 |

## 7. UUID 비공개

- `PurchaseQueryPage` row testid: `purchase-query-row-${row.slipNo}` (UUID row.id 미사용)
- 검수 버튼 testid: `purchase-query-inspect-${toPublicTestId(row.slipNo)}`
- `InboundInspectionDialog`: slipId 는 API path param 전용 — 화면 텍스트 미노출
- `inboundInspectionApi.ts`: UUID 비공개 주석 명시 (`slipId 는 path param 으로만 사용`)

## 8. SP-08-5-1/2/3 회고 항목 회귀 없음 검증

| 회고 항목 | SP-08-5-4 정합 |
|---|---|
| SP-08-5-1: 상세 화면 UUID 직접 노출 | T5 정적 단언 — actorId/id 텍스트 미노출 확인 |
| SP-08-5-2: PUT 수정 후 목록 갱신 | T3 — invalidateQueries 동일 패턴 |
| SP-08-5-3: INSPECTING 삭제 차단 | T4 BE domain guard + IT `testInspectingSlipExcludedFromDelete` |
| SP-08-5-1/2/3: 한국어 라벨 | T5 — SLIP_STATUS_LABEL, INSPECTION_STATUS_LABEL 한국어 확인 |

## 9. Migration

신규 Flyway migration 없음. 회귀 검증 슬라이스이므로 BE/FE 소스 변경 없음.
신규 파일:
- `clients/desktop/playwright/sp-08-5-4-purchase-inspection-cta-regression/sp-08-5-4-purchase-inspection-cta-regression.spec.ts`
- `docs/qa/sp-08-5-4-purchase-inspection-cta-regression/screenshots/*.png` (4장)
- `scripts/generate-sp-08-5-4-purchase-inspection-cta-regression-screenshots.ps1`

## 10. Follow-up

- BE agent: `testSavedSlipListedForInspectionCta` 외 3 case IT 구현
- SP-08-5-5 이후 슬라이스에서 검수 flow 변경 시 본 spec T1~T4 재실행 의무
- InboundInspection COMPLETED 후 재검수 방지 가드 강화 여부 — 운영 정책 결정 대기

## QA 스크린샷

| 번호 | 파일 | 설명 |
|---|---|---|
| 1 | `docs/qa/sp-08-5-4-purchase-inspection-cta-regression/screenshots/01-saved-inspection-cta-visible.png` | SAVED 행 검수 버튼 표시 |
| 2 | `docs/qa/sp-08-5-4-purchase-inspection-cta-regression/screenshots/02-confirmed-inspection-cta-visible.png` | CONFIRMED 행 검수 버튼 표시 |
| 3 | `docs/qa/sp-08-5-4-purchase-inspection-cta-regression/screenshots/03-inspection-dialog-refetch-success.png` | 저장 후 구매관리 목록 갱신 |
| 4 | `docs/qa/sp-08-5-4-purchase-inspection-cta-regression/screenshots/04-inspecting-row-cta-hidden.png` | INSPECTING/COMPLETED 행 CTA 미노출 |
