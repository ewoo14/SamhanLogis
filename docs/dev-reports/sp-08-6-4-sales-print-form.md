# SP-08-6-4 거래명세서 + 계산서 인쇄 양식 dev-report

작성일: 2026-05-18
브랜치: `feat/sp-08-6-4-sales-print-form` (QA 산출물)

## 1. Scope

SP-08-6-1~3 (판매관리 목록/상세/수정/삭제) 완료 이후 판매 전표 인쇄 양식 2종 신규 추가.
legacy GAS 거래명세서 + 세금계산서 출력 기능을 Samhan Public FE 전용 인쇄 양식으로 이식.

신규 BE endpoint 없음 — 기존 `GET /slips/{id}` + `GET /accounting/tax-invoices/{id}` 재사용.
FE 전용 슬라이스 (InvoiceView + TaxInvoiceView 재사용 또는 신규 컴포넌트 분리).

## 2. FE 라우트 + 컴포넌트 계약

| 항목 | 거래명세서 | 세금계산서 |
|---|---|---|
| 라우트 | `/sales/:id/print/invoice` | `/accounting/tax-invoices/:id/print` |
| 컴포넌트 | `InvoiceView.tsx` (재사용) 또는 신규 `SalesSlipPrintPage.tsx` | `TaxInvoiceView.tsx` (재사용) 또는 신규 |
| useParams | `id` 추출 | `id` 추출 |
| useQuery | `['slip', id]` | `['tax-invoice', id]` |
| PrintLayout | 공통 `PrintLayout.tsx` (paper=`a4-portrait`) | 동일 |
| 라우트 권한 | MANAGER / MASTER | ACCOUNTANT / MANAGER / MASTER |

## 3. Design spec

### 거래명세서 (A4 portrait 6섹션)

```
┌─────────────────────────────────┐  ← A4 portrait (210mm × 297mm)
│ 헤더: 좌(회사명/사업자번호) | 중앙(거래명세서) | 우(전표번호/발행일)  │
├─────────────────────────────────┤
│ 거래처 정보: 거래처명 / 사업자번호 / 주소 / 연락처              │
├─────────────────────────────────┤
│ 라인 테이블: No./품목/규격/수량/단가/공급가액/부가세/비고        │
├─────────────────────────────────┤
│ 합계: 공급가액 / 부가세(10%) / 합계                            │
├─────────────────────────────────┤
│ 비고: 자유 텍스트 영역                                          │
├─────────────────────────────────┤
│ 푸터: 담당자 / 인수자 / 발행자(직인) 3열 사인란                │
└─────────────────────────────────┘
```

### 세금계산서 (NTS 표준 2-panel)

- 상단: 책번호 / 일련번호 / 빨간 "세 금 계 산 서 (공급받는자 보관용)"
- 공급자 박스 (좌 5행): 등록번호 / 상호 / 사업장주소 / 업태 / 종목
- 공급받는자 박스 (우 5행): 동일 구조 + `partnerName` / `partnerBusinessNo`
- 작성일자 + 공급가액 + 세액 행 (11자리 셀)
- 라인 표: 월/일/품목/규격/수량/단가/공급가액/세액/비고
- 합계금액 행 + 영수/청구 체크박스

## 4. 한국어 라벨 표

| 라벨 | 위치 | 컴포넌트 |
|---|---|---|
| 거래명세서 | 헤더 타이틀 | InvoiceView (거 래 명 세 서) |
| 세금계산서 | 헤더 타이틀 | TaxInvoiceView (세 금 계 산 서) |
| 거래처 | 거래처 섹션 | `slip.partnerName` 표시 |
| 사업자번호 | 공급자/공급받는자 | COMPANY.businessRegNo + `partnerBusinessNo` |
| 공급가액 | 합계/테이블 헤더 | supply 금액 |
| 부가세 | 합계/테이블 헤더 | vat 금액 (공급가액 × 10%) |
| 합계 | 합계 섹션 | supply + vat |

## 5. UUID 비공개

- `slip.id` (UUID) → useQuery path param 전용, 화면 텍스트 미노출
- 거래명세서 식별자: `slipNo` (예: `2026/05/18-7`) 만 표시
- 세금계산서 식별자: `taxInvoiceNo` (일련번호) 만 표시
- `partnerId`, `partnerBusinessId` UUID 화면 미노출
- `feedback_uuid_no_user_visibility.md` 준수

## 6. Verification (Playwright 5 case / PNG 4장)

### Playwright 정적 5 case

| case | 검증 내용 | 결과 |
|---|---|---|
| T1 | 거래명세서 라우트 `/sales/:id/print/invoice` + 6 섹션 (헤더/거래처/라인/합계/비고/푸터) | PASS (정적 단언) |
| T2 | 계산서 라우트 `/accounting/tax-invoices/:id/print` + 발행자/공급받는자 2-panel | PASS |
| T3 | 한국어 라벨 7종 — 거래명세서/계산서/거래처/사업자번호/공급가액/부가세/합계 | PASS |
| T4 | UUID 비공개 — slip.id/ti.id 직접 노출 금지, slipNo/taxInvoiceNo 만 표시 | PASS |
| T5 | @media print + @page A4 portrait (PrintLayout.tsx) + window.print() 인쇄 버튼 | PASS |

### QA PNG 4장

| 번호 | 파일 | 설명 |
|---|---|---|
| 1 | `docs/qa/sp-08-6-4-sales-print-form/screenshots/01-sales-statement-full.png` | 거래명세서 A4 전체 (6섹션 + UUID 비공개 배지) |
| 2 | `docs/qa/sp-08-6-4-sales-print-form/screenshots/02-sales-invoice-full.png` | 세금계산서 A4 전체 (공급자/공급받는자 2-panel + 영수/청구) |
| 3 | `docs/qa/sp-08-6-4-sales-print-form/screenshots/03-multiline.png` | 다중 라인 12행 + page-break 가이드라인 |
| 4 | `docs/qa/sp-08-6-4-sales-print-form/screenshots/04-legacy-compare.png` | legacy GAS vs Samhan Public 8항목 비교 |

## 7. Legacy GAS 양식 매칭

| 항목 | legacy GAS | Samhan Public (SP-08-6-4) |
|---|---|---|
| 슬립번호 | UUID 직접 노출 (v4) | `slipNo` (2026/05/18-7) 만 표시 |
| 사업자번호 | 공급자 미존재 | `COMPANY.businessRegNo` 표기 추가 |
| @page 규칙 | 미적용 | `@page { size: A4; margin: 0; }` |
| @media print | 미적용 — 인쇄 시 UI 노출 | `.no-print` 숨김 + A4 영역 보장 |
| 공급가액 분리 | 단일 합계 칸만 | supply / vat / total 3열 |
| window.print | 수동 Ctrl+P | PrintLayout "인쇄" 버튼 자동 |
| 한글 금액 | 미지원 | `toKoreanAmount()` |
| 2-panel 계산서 | 없음 — 단일 양식 | 공급자 + 공급받는자 NTS 표준 |

## 8. BE endpoint 재사용 (신규 없음)

| endpoint | 용도 |
|---|---|
| `GET /slips/{id}` | SlipDetail 조회 (거래명세서 데이터) |
| `GET /accounting/tax-invoices/{id}` | TaxInvoiceDetail 조회 (계산서 데이터) |

## 9. Migration

신규 Flyway migration 없음. FE 전용 슬라이스.

신규 파일 목록:
- `clients/desktop/playwright/sp-08-6-4-sales-print-form/sp-08-6-4-sales-print-form.spec.ts`
- `docs/qa/sp-08-6-4-sales-print-form/screenshots/01~04-*.png` (4장)
- `scripts/generate-sp-08-6-4-sales-print-form-screenshots.ps1`
- `docs/dev-reports/sp-08-6-4-sales-print-form.md`

## 10. Follow-up

- FE agent: 신규 `SalesSlipPrintPage.tsx` 분리 (InvoiceView 재사용 vs 신규 — FE 결정)
- 다중 페이지 분할 (`page-break-after: always`) — 라인 수 초과 시 자동 분할
- legacy GAS 거래명세서 픽셀 수준 비교 — Designer 이미지 전달 후 CSS 미세 조정 3~5회
- `feedback_print_design_iteration.md` — 단번 완성 가정 금지

## QA 스크린샷

| 번호 | 파일 |
|---|---|
| 1 | `docs/qa/sp-08-6-4-sales-print-form/screenshots/01-sales-statement-full.png` |
| 2 | `docs/qa/sp-08-6-4-sales-print-form/screenshots/02-sales-invoice-full.png` |
| 3 | `docs/qa/sp-08-6-4-sales-print-form/screenshots/03-multiline.png` |
| 4 | `docs/qa/sp-08-6-4-sales-print-form/screenshots/04-legacy-compare.png` |
