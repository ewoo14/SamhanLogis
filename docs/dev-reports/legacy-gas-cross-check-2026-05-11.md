# Legacy GAS 27개 카테고리 cross-check 보고서

> 작성일: 2026-05-11
> 분석 범위: `tools/legacy-gas/` 27개 카테고리 + dev-reports 5건 + SamhanLogis 코드 cross-check
> 작성 배경: PR #161 회고 (TaxInvoiceBatch* 가 PR-E2 HometaxExport* 와 중복 신규 구현이었음을 PM cross-check 에서 발견 → PR #162 cleanup) 후 전수 매핑 정확도 보강 목적

---

## 1. 요약

| 상태 | 건수 | 비고 |
|---|---|---|
| ✅ 완료 이식 | 15건 | PR-E1 / PR-E2 / PR-F1 / PR-F2 |
| ⚠️ 부분 이식 | 1건 | 품목별 DPS — 기본 비교만, 상품별 분석 미이식 |
| 📊 데이터 export (seed CSV/zip) | 7건 | gitignore 처리, 시드 데이터로 활용 |
| 🔧 legacy shim (RPC 매핑) | 2건 | estimate / order-app |
| ❓ 미분류 (PR-F3 조사 예정) | 2건 | GAS C 1건 + GAS D 1건 |
| ❌ 진짜 미이식 | **0건** | |

**P0 누락 (즉시 보강 필요)**: 2건
- 알리고 실 API 활성화 (현재 `dryRun=true` mock — X-API-Key 입수 후 토글)
- 품목별 DPS 입고 상품별 분석 (상품코드 × 입고단계 pivot)

---

## 2. 27 GAS 카테고리 전수 매핑 표

### 2-1. GAS B 분류 (이카운트 연계 / 배차배송) 12건

| # | GAS 폴더 | 핵심 기능 | 이식 PR | SamhanLogis 위치 | 누락 | 우선순위 |
|---|---|---|---|---|---|---|
| 1 | DPS 입고기록 비교 | DPS 운송장 vs 자체 입고 비교 | PR-E1 (#117) | inventory `POST /warehouse/audit/dps-compare` + desktop `/warehouse/dps-compare` | 없음 | - |
| 2 | 품목별 DPS 입고내역 비교 | 상품코드별 단계 pivot | PR-E1 (#117) | (1번과 endpoint 공유) | **상품별 pivot 분석 누락** | **P0** |
| 3 | 가배차분류리스트 | 권역 자동 분류 (GAS 2/15) | PR-E1 (#117) | arologis `GET /admin/arologis/dispatches/pre-classify` + desktop `/arologis/pre-classify` | 없음 | - |
| 4 | 미배차리스트 | 배차 누락 전표 | PR-E1 (#117) | arologis `GET /admin/arologis/dispatches/unassigned` + desktop `/arologis/unassigned` | 없음 | - |
| 5 | 지방가배차분류리스트 | 광역 17 시도 분류 | PR-E1 (#117) | arologis `GET /admin/arologis/dispatches/regional` + desktop `/arologis/pre-classify` 토글 | 없음 | - |
| 6 | 전표정리리스트 | 빈 전표 / 누락 전표 정리 | PR-E1 (#117) | slip `GET /slips/cleanup` + desktop `/sales/slip-cleanup` | 없음 | - |
| 7 | 내일자 전표 이미지 생성 | 다음날 출고 전표 권역별 이미지 | PR-E1 (#117) | slip `GET /slips/next-day-image-data` + desktop `/sales/next-day-slip` + Designer NextDaySlipView | 없음 | - |
| 8 | 배차안내문자 | 기사별 SMS preview/send | PR-E1 (#117) | notification `POST /admin/notifications/dispatch-batch/{preview,send}` + desktop `/dispatch/sms` | mock `dryRun=true` | **P0 (실 API)** |
| 9 | 거래처별 원장생성 프로그램 | 거래처별 분개 라인 + 누적 잔액 | PR-E2 (#118) | accounting `GET /accounting/journals/ledger-data` + desktop `/accounting/partner-ledger` | 없음 | - |
| 10 | 거래처별 일괄 거래명세서 생성 | 거래처별 page-break batch | PR-E2 (#118) | accounting `GET /accounting/statements/batch-data` + desktop `/accounting/statement-batch` | 없음 | - |
| 11 | **계산서일괄등록양식 생성** | 홈택스 일괄 업로드 양식 | PR-E2 + PR #162 (cleanup) | accounting `GET /accounting/tax-invoice/hometax-export` + 7 신규 endpoint (preview/split/exclusions/history) + desktop `/accounting/hometax-export` 5탭 | 없음 (PR #162 에서 4탭 + supplier 동적 + 100건 분할 + 제외 + 이력 보강 완료) | - |
| 12 | 일마감 프로그램 | 일별 매출 마감 detail | PR-E2 (#118) | accounting `GET /accounting/closings/daily` + desktop `/accounting/month-end-closing` | 없음 | - |

### 2-2. GAS C/D 분류 (외부 vendor) 6건

| # | GAS 폴더 | 핵심 기능 | 이식 PR | SamhanLogis 위치 | 누락 | 우선순위 |
|---|---|---|---|---|---|---|
| 13 | 알리고 자동 업로드 | 거래처 → 알리고 주소록 sync | PR-F1 (#119) | partner `GET /partners/admin/aligo/csv` + notification `POST /notify/aligo/address-book/sync` + desktop `/admin/aligo-address-book` | mock `dryRun=true` (실 API skeleton) | **P0 (실 API)** |
| 14 | 운송사-실배차내역 비교 | CJ/롯데/한진 vendor 엑셀 vs 자체 dispatch | PR-F1 (#119) | arologis `POST /arologis/dispatch/reconcile` + desktop `/arologis/dispatch-reconcile` (4 vendor 매처) | 없음 (vendor 추가 매처는 P1) | - |
| 15 | 에어디자이너 전용 주문서 인식 | PDF/이미지 → 운송장 OCR | PR-F2 (#120) | partner-order Tesseract OCR + desktop OCR 페이지 | OCR 정확도 운영 후 측정 (P1) | - |
| 16 | 제이시스템 전용 주문서 인식 | 동일 OCR | PR-F2 (#120) | 동일 (vendor 분기) | 동일 P1 | - |
| 17 | (GAS C 미분류 1건) | ? | PR-F3 예정 | - | 사용자 분류 대기 | P2 |
| 18 | (GAS D 미분류 1건) | ? | PR-F3 예정 | - | 사용자 분류 대기 | P2 |

### 2-3. 분류 외 (estimate / order-app) 2건

| # | GAS 폴더 | 핵심 기능 | 이식 PR | SamhanLogis 위치 | 누락 | 우선순위 |
|---|---|---|---|---|---|---|
| 19 | 종합견적서 | 거래처별 견적 + 단가 | PR #148 (P2) + legacy shim | clients/web/estimate-app v2 + estimate-app-service (legacy 18,614 라인) + desktop `/estimates` | 없음 | - |
| 20 | 거래처 발송 주문서 | 거래처 자체 주문 PWA | PR #144 + legacy shim | clients/web/order-app v4 (Vite + PWA) + partner-order-service `outbox` + desktop `/sales/partner-orders` | 장바구니 / 결제 PG (장기 backlog) | P2 |

### 2-4. 데이터 export (seed CSV/zip) 7건

| # | GAS 폴더/zip | 형태 | SamhanLogis 활용 |
|---|---|---|---|
| 21 | 가배차용 지역별 분류표.zip | CSV | arologis `region_classifier` seed (PR-E1) |
| 22 | 거래처 DC정보.zip | CSV | partner `DC_CONFIG` seed + sales-partner-dc-config-service |
| 23 | 단톡방리스트.zip | CSV | groupware `chat_room_mappings` seed (PR-E2) |
| 24 | 발송금지리스트.zip | CSV | partner `blocked_partners` seed (PR-D Phase B FE-E) |
| 25 | _notion-export/ (4 폴더) | Notion CSV export | DB seed 전환 완료 (V*__seed_*.sql) |

데이터 7건 모두 시드 데이터로 흡수 완료. 추가 작업 X.

---

## 3. P0 누락 보강 권고

### 3-1. P0-A — 알리고 실 API 활성화 (배차 SMS + 주소록 sync)

**현황**:
- `services/notification-service/.../AligoAddressBookClient` interface + `MockAligoAddressBookClient` (dryRun)
- 실 API HTTP body = TODO skeleton (사용자 spec 입수 대기)
- `samhan.notification.aligo.address-book.dry-run=true` 토글 — false 시 실 API 호출

**보강 작업**:
- BE: 실 RestClient body 구현 (알리고 OPEN API spec 활용 — `https://apis.aligo.in/`)
- BE: X-API-Key + 단톡방 ID secret 환경변수 (devops)
- FE: 운영자 dryRun 토글 UI (현재 mock 만 사용)
- 사용자 입수 필요: 알리고 API Key + 단톡방 token

### 3-2. P0-B — 품목별 DPS 입고 상품별 분석 (pivot table)

**현황**:
- `inventory-service POST /warehouse/audit/dps-compare` 기본 비교만 (DPS row vs 자체 row 차이)
- GAS 원본 "상품코드 × 입고단계 (대기/완료/품질검사/반품)" pivot table 미이식

**보강 작업**:
- BE: `GET /warehouse/audit/dps-compare/by-product` 신규 endpoint (Pivot 응답)
- FE: `/warehouse/dps-compare/by-product` pivot view (DataGrid 활용 — PR #162 신규 컴포넌트)
- IT: 입고대기/완료/품질검사/반품 4단계 합계 검증

---

## 4. P1 권고 (단기 개선)

| 항목 | 현황 | 작업 |
|---|---|---|
| 인쇄 양식 iteration | 1차 mock | 사용자 Edge 캡처 → CSS-only 미세 조정 (2~5차) — `feedback_print_design_iteration` |
| vendor reconcile PDF | CSV만 | 인쇄 양식 추가 |
| vendor parser 확장 | 4 vendor (CJ/롯데/한진 + 1) | 우체국/로젠 등 신규 매처 |
| Tesseract OCR 정확도 | 측정 필요 | 운영 후 정규식 개선 (hyphen/대소문자/천단위) |

---

## 5. P2 (장기 backlog)

- NTS 홈택스 OPEN API 직접 전송 (사용자 후순위 명시 — 다른 GAS 후 진행)
- GAS C/D 미분류 2건 — 사용자 분류 대기
- 거래처 자체 주문 PWA 장바구니 / 결제 PG (PG사 계약 미체결)

---

## 6. 외부 의존 제거 종합

| 항목 | 이전 | 현재 |
|---|---|---|
| 분개 (회계) | 이카운트 | accounting-service ✅ |
| 출고 전표 | 이카운트 엑셀 | slip-service ✅ |
| 거래명세서 | 이카운트 | accounting-service ✅ |
| 홈택스 export | 이카운트 | accounting-service ✅ (PR #162 cleanup) |
| vendor 발주 OCR | 수동 | partner-order Tesseract ✅ |
| 알리고 주소록 / SMS | (미구현) | notification-service mock (P0 — 실 API 토글 후 운영) |
| NTS 홈택스 API | (미구현) | 사용자 후순위 (P2) |
| Notion DB | GAS 운영 | RDB 완전 전환 ✅ |

**결론**: e-Count 의존 0% (PR-G1 병렬 완료) + Notion 의존 0% (RDB 전환 완료). 알리고 실 API 토글만 남음.

---

## 7. 후속 슬라이스 권고

### 즉시 진행 (P0)
- **본 PR 합류**: P0-B 품목별 DPS 분석 보강 (BE + FE + QA, 외부 의존 0)
- **별도 슬라이스**: P0-A 알리고 실 API (사용자 API Key 입수 후 진행)

### Phase 11 후
- NTS 홈택스 OPEN API
- 거래처 PWA 장바구니/결제 PG

---

## 8. PM cross-check 회고 종합

PR #161 (TaxInvoiceBatch* 신규 구현) 가 PR-E2 HometaxExport* 와 중복이었음을 발견 → PR #162 cleanup. 본 cross-check 보고서로 27개 전수 매핑 확정 → 향후 신규 슬라이스 시 본 보고서 우선 cross-check 의무.

**잔존 진짜 미이식 0건** (P0/P1 보강 후속 + P2 장기 backlog 분류).
