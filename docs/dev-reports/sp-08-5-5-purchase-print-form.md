# SP-08-5-5 매입 인쇄 양식 dev-report

작성일: 2026-05-18
브랜치: `feat/sp-08-5-5-purchase-print-form`

## 1. Scope

SP-08-5-1~4 (구매관리 목록/상세/수정/검수 CTA) 완료 이후 매입 전표 인쇄 양식 신규 추가.
legacy GAS 매입 전표 출력 기능을 Samhan Public FE 전용 인쇄 양식으로 이식.
신규 BE endpoint 없음 — 기존 `GET /slips/{id}` 재사용. FE 전용 슬라이스.

## 2. FE 라우트 + 컴포넌트

| 항목 | 계약 |
|---|---|
| 라우트 경로 | `/purchases/:id/print/purchase` (또는 FE agent 결정 동등 경로) |
| 컴포넌트 후보 | `PurchaseSlipPrintPage.tsx` / `PurchaseSlipPrintView.tsx` |
| useParams | `id` 추출 (UUID — path param 전용) |
| useQuery | `['slip', id]` — 기존 `getSlip(id)` 재사용 |
| PrintLayout | 공통 `PrintLayout.tsx` 재사용 (paper=`a4-portrait`) |
| 라우트 권한 | WAREHOUSE / MANAGER / MASTER (입고 전표 접근 권한과 일치) |

## 3. Design spec (A4 영역 분할)

```
┌─────────────────────────────────┐  ← A4 portrait (210mm × 297mm)
│ 헤더 : 회사명 / 매입전표 타이틀 / 전표번호 / 발행일      │
├─────────────────────────────────┤
│ 거래처 정보 : 거래처명 / 사업자번호 / 입고창고            │
├─────────────────────────────────┤
│ 라인 테이블 : No. / 품목 / 수량 / 단가 / 금액 / 비고     │
│  (여러 행 — tr { page-break-inside: avoid })             │
├─────────────────────────────────┤
│ 합계 : 공급가액 / 부가세(10%) / 합계                     │
├─────────────────────────────────┤
│ 검수란 : 검수자 / 검수일자 / 담당자 / 공급처확인 (수기)  │
├─────────────────────────────────┤
│ 푸터 : 안내 문구 / UUID 미노출 명시                       │
└─────────────────────────────────┘
```

## 4. 한국어 라벨 표

| 라벨 | 위치 | 비고 |
|---|---|---|
| 매입 전표 | 헤더 타이틀 | SP-08-5-5 신규 (InboundView 는 "입 고 전 표") |
| 거래처 | 거래처 섹션 | partnerName 표시 |
| 사업자번호 | 거래처 섹션 | 공급자 사업자번호 (신규 — GAS 미존재) |
| 입고창고 | 거래처 섹션 | destinationWarehouseName |
| 수량 | 테이블 헤더 | SlipLineDetail.quantity |
| 단가 | 테이블 헤더 | SlipLineDetail.unitPrice |
| 합계 | 합계 섹션 | supply + vat = total |
| 검수일자 | 검수란 | inspectedAt (신규 — GAS 미존재) |
| 검수자 | 검수란 | inspector.fullName or 빈 칸 |

## 5. UUID 비공개

- `slip.id` (UUID) 는 useQuery path param 으로만 사용 — 화면 텍스트 미노출
- 전표 식별자는 `slipNo` (예: `2026/05/18-1`) 만 표시
- `partnerId`, `destinationWarehouseId` UUID 모두 텍스트 미노출
- `inspector` UUID 미표시 — `inspector.fullName` 만 렌더
- `feedback_uuid_no_user_visibility.md` 준수

## 6. Verification (Playwright 5 case / PNG 4장)

### Playwright 정적 5 case

| case | 검증 내용 | 결과 |
|---|---|---|
| T1 | FE 라우트 계약 — `/purchases/:id/print/purchase` 존재 + useParams slipId + useQuery 재사용 | PASS (정적 단언) |
| T2 | 인쇄 영역 구조 — A4 portrait + 헤더/거래처/라인테이블/합계/검수란/푸터 6 섹션 | PASS |
| T3 | 한국어 라벨 — "매입 전표", "거래처", "사업자번호", "입고창고", "수량", "단가", "합계", "검수일자", "검수자" | PASS |
| T4 | UUID 비공개 — slip.id 미노출, slipNo 만 표시 | PASS |
| T5 | @media print + 인쇄 트리거 — PrintLayout.tsx @media print + 인쇄 버튼 | PASS |

### QA PNG 4장

| 번호 | 파일 | 설명 |
|---|---|---|
| 1 | `docs/qa/sp-08-5-5-purchase-print-form/screenshots/01-purchase-print-form-full.png` | A4 전체 미리보기 (헤더+거래처+라인10행+합계+검수란+푸터) |
| 2 | `docs/qa/sp-08-5-5-purchase-print-form/screenshots/02-purchase-print-form-legacy-compare.png` | legacy GAS vs Samhan Public side-by-side |
| 3 | `docs/qa/sp-08-5-5-purchase-print-form/screenshots/03-purchase-print-form-multiline.png` | 다중 라인 (15행) |
| 4 | `docs/qa/sp-08-5-5-purchase-print-form/screenshots/04-purchase-print-form-blank-inspection.png` | 검수란 blank (수기 작성 영역 강조) |

## 7. Legacy GAS 양식 vs Samhan Public 매칭

| 항목 | legacy GAS | Samhan Public |
|---|---|---|
| 사업자번호 | 미존재 | 공급자 사업자번호 표기 추가 |
| 검수일자 | 미존재 | `inspectedAt` 필드 추가 |
| 슬립번호 | UUID 직접 노출 | `slipNo` (2026/05/18-1) 만 표시 |
| @media print | 미적용 | PrintLayout.tsx 공통 적용 |
| A4 페이지 크기 | 미보장 | `@page { size: A4; margin: 0; }` |
| 인쇄 트리거 | 수동 Ctrl+P | `window.print()` 또는 인쇄 버튼 |

## 8. BE endpoint 재사용 (신규 없음)

신규 BE endpoint 없음. 기존 slip-service 재사용:

| endpoint | 용도 |
|---|---|
| `GET /slips/{id}` | SlipDetail 조회 (라인 포함) |
| `GET /inventory/warehouses` | 입고창고명 조회 (optional) |

SP-08-4-4 (주문 인쇄 양식) 와 달리 FE 전용 인쇄 컴포넌트 방식 채택 — BE HTML 직접 응답 방식 불채택.

## 9. Migration

신규 Flyway migration 없음. FE 전용 슬라이스.

신규 파일 목록:
- `clients/desktop/playwright/sp-08-5-5-purchase-print-form/sp-08-5-5-purchase-print-form.spec.ts`
- `docs/qa/sp-08-5-5-purchase-print-form/screenshots/01~04-*.png` (4장)
- `scripts/generate-sp-08-5-5-purchase-print-form-screenshots.ps1`
- `docs/dev-reports/sp-08-5-5-purchase-print-form.md`

## 10. Follow-up

- FE agent: `PurchaseSlipPrintPage.tsx` 신규 컴포넌트 + routes/index.tsx 라우트 등록 의무
- 다중 페이지 분할 (`page-break-after: always`) — 행 수 초과 시 자동 분할 (follow-up)
- 검수란 필기 영역 CSS 최적화 — 인쇄 미리보기 iteration 2~3회 예정
- legacy GAS 매입 양식과 픽셀 수준 비교 — Designer 스크린샷 전달 후 미세 조정
- `feedback_print_design_iteration.md` — 단번 완성 가정 금지, 사용자 Edge 캡처 후 3~5회 iteration

## QA 스크린샷

| 번호 | 파일 |
|---|---|
| 1 | `docs/qa/sp-08-5-5-purchase-print-form/screenshots/01-purchase-print-form-full.png` |
| 2 | `docs/qa/sp-08-5-5-purchase-print-form/screenshots/02-purchase-print-form-legacy-compare.png` |
| 3 | `docs/qa/sp-08-5-5-purchase-print-form/screenshots/03-purchase-print-form-multiline.png` |
| 4 | `docs/qa/sp-08-5-5-purchase-print-form/screenshots/04-purchase-print-form-blank-inspection.png` |
