# legacy-gas-db-api-parity 기획서

- 작성일: 2026-05-16
- 슬라이스: SP-08
- 브랜치: `codex/sp-08-legacy-gas-db-api-parity`
- 범위: Samhan Public 전메뉴 (견적관리 / 공급사 / 주문 / 매입 / 매출 / 사입 + 거래처·재고이동·창고 등 GAS 동등 메뉴) 의 legacy GAS 동등 기능을 우리 DB/API 만으로 동작하도록 잠그고, 다운로드된 raw 데이터는 read-only 원본으로 보존한다.
- 후속 작업은 모두 본 슬라이스(SP-08) 안에서 sub-task PR 로 진행한다.

> 본 기획서는 자격값(Notion API key / Notion DB internal id / Google Service Account key / Sheet id / Aligo API key / Naver Maps key 등)을 평문으로 포함하지 않는다. 모든 자격은 환경변수 / `application.yml` placeholder / `%USERPROFILE%\.samhan\*` 경로 reference 로만 표기한다.

---

## 1. 목표 및 범위

### 1.1 목표

1. **legacy GAS UI/플로우는 유지** — 영업/배차/회계 담당자가 손에 익은 메뉴 동선과 입력 양식을 그대로 사용한다. GAS 시절 시트/노션 페이지의 "보이는 모양" 은 desktop / web order-app / mobile-staff 가 동등 화면으로 재현한다.
2. **runtime 의존성에서 Notion 제거 완료를 회귀로 잠금** — 모든 조회/쓰기는 Samhan Public 14 service DB + 자체 API 만 사용한다. SP-06 에서 active app endpoint 를 제거했으나, 신규 메뉴/PR 에서 재유입되지 않도록 정적 계약으로 가드한다.
3. **raw 원본은 read-only 보존** — `tools/legacy-gas/` 의 GAS 소스, `tools/operational-validation/notion-csv/` (혹은 동급 경로) 의 Notion export CSV, Google Sheets `종합견적서` 원본 tab 은 audit / 회귀 / 재이관 reference 로만 사용한다. 이중 source 가 충돌할 때는 항상 우리 DB/API 가 source-of-truth 이며, raw 는 "이관 시점 snapshot" 으로만 의미를 가진다.
4. **GAS 전메뉴 CRUD parity 매트릭스 고정** — 견적관리 / 공급사 / 주문 / 매입 / 매출 / 사입 + 전메뉴 contract 에서 GAS 가 수행하던 C/R/U/D 각 동작이 우리 DB/API endpoint 와 1:1 매핑되는지 표로 잠근다. 누락된 동작은 본 슬라이스 sub-task 로 분해해 발행한다.
5. **자격 비공개 가드** — 산출물 (plan / dev-report / QA 캡처 / Playwright fixture / 운영 검증 문서) 어디에도 비밀값을 남기지 않는다. CI grep 가드로 회귀 방지.

### 1.2 적용 메뉴 (사용자 명시 + SP-04 전메뉴 audit 결과)

| 도메인 | 메뉴 | legacy GAS 출처 |
|---|---|---|
| 견적관리 | `/sales/quotes`, `/sales/quotes/new`, `/print/quote/:id` | `tools/legacy-gas/종합견적서/` |
| 공급사 (Vendor) | `/admin/vendors`, `/admin/aligo-address-book`, vendor OCR 업로드 (에어디자이너 / 제이시스템) | `tools/legacy-gas/거래처 발송 주문서/`, `tools/legacy-gas/알리고 주소록/`, vendor OCR 두 곳 |
| 주문 | `/sales/orders`, `/sales/orders/new`, `/print/order/:id`, `/partner-orders/*` | `tools/legacy-gas/거래처 발송 주문서/` |
| 매입 | `/purchases`, `/purchases/:id`, 입고 검수 CTA | 이카운트 매입 시트 + GAS B `전표정리` |
| 매출 | `/sales`, `/sales/:id`, 출고전표 → 거래명세서 → 일마감 | 이카운트 매출 시트 + GAS B `원장`, `거래명세서`, `계산서`, `일마감` |
| 사입 | `/purchases?type=consignment` 또는 동등 화면 (legacy 위탁사입) | 이카운트 사입 분류 + GAS B 회계 4건 |
| 보조 메뉴 | 거래처 / 거래처 DC / 단톡방 / 발송금지 / 배차지역 / 재고이동 / 창고 | SP-04~SP-06 에서 mapping 완료, 본 슬라이스에서는 회귀 가드만 추가 |

### 1.3 범위 밖 (non-goals 는 §8 에서 별도 정리)

---

## 2. 현재 상태

### 2.1 직전 슬라이스 산출물

| 슬라이스 | 결과 | SP-08 와의 관계 |
|---|---|---|
| SP-04 `full-menu-legacy-gas-notion-audit` | 전메뉴 IA + 27개 GAS 기능 매핑 + Notion 4 CSV 스키마 + Google Sheets 원본 tab 대조 audit | 본 슬라이스의 mapping baseline. SP-08 은 audit 결과를 정적 계약으로 잠그는 단계. |
| SP-05 `samhan-public-crud-audit` | 판매/구매 CRUD 표면 (`상세` 액션) 추가, UUID 비공개 가드 재확인 | 본 슬라이스에서 견적/공급사/사입까지 동일 패턴으로 표면 회귀를 확장한다. |
| SP-06 `legacy-gas-functional-parity` (Notion DB 이관) | CHAT/BLOCK/REGION/DC 4종 Notion CSV → Samhan DB 이관, active order-app 의 Notion endpoint 제거, gateway no-strip route 보정 | 본 슬라이스에서 "Notion runtime 의존 zero" 를 grep + Playwright contract 로 회귀 잠금. |
| SP-07 `google-sheets-quote-order-e2e` | `종합견적서` Spreadsheet live source 재검증, bootstrap range-map 보안 보정, product-service DB sync 계약 고정 | 본 슬라이스에서 견적관리/공급사 lookup 동선이 SP-07 계약과 정합 유지되는지 cross-check. |

### 2.2 현재 보존되는 raw 원본 위치 (이관 시점 snapshot)

| 종류 | 경로 | 비고 |
|---|---|---|
| legacy GAS 소스 | `tools/legacy-gas/<앱 한글명>/Code.js` 외 | 27개 앱. 운영에서는 호출되지 않으며 audit / 재이관 reference 전용. |
| Notion export CSV | `tools/operational-validation/notion-csv/<카테고리>/*.csv` (실파일은 운영자 PC 동기화) | REGION 20 / DC 213 / CHAT 112 / BLOCK 6 row (SP-06 검증). 본 슬라이스에서 신규 CSV 추가 없음. |
| Google Sheets `종합견적서` | `application.yml` 의 `google.sheets.source-id` placeholder (값은 환경변수) | SP-07 에서 27 tab inventory 와 안전 range 를 `docs/operational-validation/google-sheets-live-source-snapshot.md` 에 기록. |
| 이카운트 raw | `tools/operational-validation/ecount-raw/` (운영자 PC) | 매출/매입/사입 raw. 본 슬라이스에서는 audit reference 로만 사용. |

### 2.3 현재 확보된 정적 계약 (Playwright)

- `clients/desktop/playwright/full-menu-contract/full-menu-contract.spec.ts` — 전메뉴 IA / 권한 / 업무번호 / legacy report / CSV / Google Sheets 정적 계약 11+ tests.
- `clients/desktop/playwright/sp-04-full-menu-audit/*` — 전메뉴 audit.
- `clients/desktop/playwright/sp-05-crud-surface/sp-05-crud-surface.spec.ts` — 판매/구매 CRUD 표면.
- `clients/desktop/playwright/sp-06-notion-db-crud/sp-06-notion-db-crud.spec.ts` — Notion runtime 의존 제거, gateway no-strip.
- `clients/desktop/playwright/sp-07-google-sheets-source/sp-07-google-sheets-source.spec.ts` — Sheets source/output/control 분리 + product DB sync 계약.
- SP-08 에서는 `clients/desktop/playwright/sp-08-legacy-gas-db-api-parity/sp-08-legacy-gas-db-api-parity.spec.ts` 신규 + full-menu-contract 회귀를 함께 PR gate 로 둔다.

### 2.4 미해결 잔존

1. 견적관리 / 공급사 / 사입 메뉴에 SP-05 패턴의 `상세` CRUD 표면 일관 적용이 아직 완전치 않음.
2. legacy GAS B 회계 4건 (원장 / 거래명세서 / 계산서 / 일마감) 동등 화면이 menu inventory 에는 잡혀 있으나 GAS 의 모든 옵션 (날짜 range / 거래처 필터 / 인쇄 양식) 이 우리 API endpoint 옵션과 1:1 정렬되었는지 정적 계약이 없다.
3. Notion runtime 호출 zero 가드가 active client 에만 적용됨 (`clients/web/order-app/`). estimate-app shim / mobile-staff / desktop의 디버그/관리 화면에서 재유입 가능성이 있어 grep + static contract 로 잠금이 필요.
4. 자격값(Notion id, Sheet id, SA key, Aligo key) 평문 유출 가드가 산출물 폴더 (docs/qa, docs/planning, docs/dev-reports, Playwright fixture) 에 일관 적용되지 않았다.

---

## 3. 데이터 모델

### 3.1 source-of-truth 매트릭스

본 슬라이스의 핵심 계약. PR 단위로 추가되는 모든 메뉴는 본 표의 한 행에 매핑되어야 한다.

| 도메인 | 우리 DB / 테이블 (Samhan Public source-of-truth) | raw 원본 (read-only snapshot) | CRUD 경계 |
|---|---|---|---|
| 견적서 | `partner_order_db.estimates` + `estimate_lines` (또는 동등) | Google Sheets `종합견적서` 출력 양식 (출력 only) + `*_단가인상` source tab | 견적 C/R/U/D 는 DB 전용. Sheets 는 단가 lookup snapshot 만 |
| 견적 단가 history | `product_db.product_price_histories` | `*_단가인상` base tab (PriceHistory seed) | `PriceHistory` 갱신은 product-service sync job 만. 화면 직접 갱신 금지 |
| 주문 (거래처 발송) | `partner_order_db.partner_orders` + `partner_order_lines` | Google Sheets `종합견적서` source tab + vendor OCR 업로드 | 주문 C/R/U/D 는 DB 전용. OCR/Sheets 는 catalog lookup 만 |
| 공급사 (Vendor) | `partner_db.vendors`, `notification_db.aligo_address_book` | Notion `단톡방리스트`/`발송금지리스트` CSV (이관 snapshot) + 알리고 주소록 CSV | 공급사 마스터 C/R/U/D 는 DB 전용. CSV 는 최초 이관 + 재이관 reference 만 |
| 매입 / 입고 검수 | `slip_db.slips` (type=PURCHASE) + `purchase_inspections` | 이카운트 매입 raw (`tools/operational-validation/ecount-raw/`) | 매입 전표/검수 C/R/U/D 는 DB 전용. 이카운트 raw 는 정합 cross-check 만 |
| 매출 / 거래명세서 / 일마감 | `slip_db.slips` (type=SALE) + `accounting_db.daily_closings` + `accounting_db.invoices` | 이카운트 매출 raw + GAS B 회계 4건 산출물 sample | 매출 / 거래명세서 / 일마감 C/R/U/D 는 DB 전용. raw 는 cross-check 만 |
| 사입 (위탁) | `slip_db.slips` (type=CONSIGNMENT) + 동등 분류 | 이카운트 사입 raw | 위탁 전표 C/R/U/D 는 DB 전용 |
| 거래처 / DC | `partner_db.partners`, `dc_config_db.dc_configs` | Notion CSV (SP-06 이관) + 이카운트 거래처 raw | SP-06 에서 잠금. 본 슬라이스는 회귀 가드만 |
| 단톡방 / 발송금지 | `notification_db.partner_chat_room_mappings`, `partner_db.blocked_partners` | Notion CSV (SP-06 이관) | SP-06 에서 잠금 |
| 배차지역 | `arologis_db.region_dispatch_classifications` | Notion CSV (SP-06 이관) | SP-06 에서 잠금 |

### 3.2 이중 source 규칙

1. raw 와 DB 가 충돌하면 **항상 DB 가 정답**. raw 는 이관 시점 snapshot 으로만 의미를 가진다.
2. raw 가 변경되어 재이관이 필요한 경우, "import" 또는 "sync" job 한 곳에서만 수행한다 (`tools/operational-validation/import-notion-csv.ps1`, `ProductSheetSyncService`, vendor OCR upload). 화면에서 raw 를 직접 호출하지 않는다.
3. 모든 import/sync job 은 멱등이어야 하며, `BaseEntity` 의 7 audit field 와 Soft Delete 정책을 그대로 따른다 (`is_deleted = false` 활성 row 만 source-of-truth 후보).
4. 신규 raw 카테고리가 등장하면 본 표(§3.1)에 행을 추가하고, import job + Playwright contract 를 같은 PR 에서 함께 발행한다.

### 3.3 BaseEntity / Soft Delete / UUID 비공개 재확인

- 본 슬라이스에서 추가되는 모든 엔티티/마이그레이션은 `shared/common` 의 `BaseEntity` 7 audit field 를 상속한다.
- DELETE statement 신규 추가 금지. `isDeleted=true` + `deletedAt` + `deletedBy` 만 허용.
- 모든 화면/표시 영역에서 UUID 노출 금지 (`feedback_uuid_no_user_visibility.md`). URL path param 으로의 UUID 만 허용하며, 화면 라벨 / test id / aria 는 공개 업무번호 (`YYYY/MM/DD-{순번}`, 모델명, 거래처명, 창고코드 등) 사용.

---

## 4. API 설계

본 슬라이스는 신규 endpoint 보다는 **기존 endpoint 의 contract 잠금 + 누락 endpoint 의 sub-task 분해** 가 중심이다.

### 4.1 메뉴별 CRUD parity 매트릭스

각 행은 sub-task PR 발행 단위. PR 발행 시점에 현재 상태 컬럼을 갱신하고, "누락" 행은 즉시 SP-08 sub-task issue 로 등록한다.

| 메뉴 | GAS 동작 | endpoint (현재) | 비고 |
|---|---|---|---|
| 견적관리 — 목록 | GAS 시트 행 조회 | `GET /api/v1/partner-orders/estimates` | UUID 비공개 컬럼 / `YYYY/MM/DD-{순번}` 표시 / 검색 옵션 GAS 와 동등 여부 cross-check |
| 견적관리 — 생성 | GAS 폼 submit → 시트 append | `POST /api/v1/partner-orders/estimates` | `_단가인상` / `인상 전 단가` 옵션 SP-07 계약 유지 |
| 견적관리 — 상세/수정 | GAS 시트 row edit | `GET /PUT /api/v1/partner-orders/estimates/{id}` | SP-05 `상세` 표면 동일 패턴 적용 |
| 견적관리 — 삭제 | GAS row delete | `DELETE` (soft) | Soft Delete only |
| 견적관리 — 인쇄 | GAS `종합견적서` 출력 양식 | `GET /api/v1/partner-orders/estimates/{id}/print` 또는 desktop `/print/quote/:id` | 인쇄 양식 legacy 100% 매칭 (`feedback_print_design_iteration.md`) |
| 공급사 — 마스터 CRUD | GAS 거래처 발송 시트 + Notion vendor 표 | `GET/POST/PUT/DELETE /api/v1/partners/vendors` (또는 `/admin/vendors`) | UI 와 endpoint 옵션 1:1 확인. 누락 시 sub-task |
| 공급사 — 알리고 주소록 sync | GAS 알리고 sync | `POST /api/v1/notification/admin/aligo-address-book/sync` (dryRun/mock) | 실 API 키 적용은 별도 PR. 본 슬라이스는 dryRun 회귀만 |
| 공급사 — vendor OCR | GAS vendor OCR (에어디자이너/제이시스템) | `POST /api/v1/partner-orders/vendor-orders/ocr` | catalog lookup SP-07 `_단가인상` tab 유지 |
| 주문 — 거래처 발송 | GAS 발송 주문서 시트 | `POST /api/v1/partner-orders/orders` | `_단가인상` lookup, 견적 → 주문 변환 동선 |
| 주문 — 상세/수정/삭제 | GAS row edit/delete | `GET/PUT/DELETE /api/v1/partner-orders/orders/{id}` | SP-05 `상세` 패턴 적용 여부 cross-check |
| 매입 — 목록/상세/검수 | 이카운트 매입 raw + GAS 전표정리 | `GET /api/v1/slips?type=PURCHASE` + `POST /api/v1/slips/{id}/inspect` | SP-03 검수 CTA 회귀 |
| 매입 — 생성/수정 | 이카운트 매입 입력 | `POST/PUT /api/v1/slips` (type=PURCHASE) | 입력 옵션 cross-check |
| 매출 — 목록/상세 | 이카운트 매출 raw | `GET /api/v1/slips?type=SALE` + `GET /api/v1/slips/{id}` | SP-05 표면 적용 완료 회귀 |
| 매출 — 거래명세서 | GAS 거래명세서 출력 | `GET /api/v1/accounting/transaction-statements/{id}/print` (또는 동등) | 인쇄 양식 legacy 100% 매칭 |
| 매출 — 계산서 / 세금계산서 | GAS 계산서 출력 | `GET /api/v1/accounting/invoices/{id}/print` | 동일 |
| 매출 — 일마감 | GAS `일마감` | `POST /api/v1/accounting/daily-closings` | 옵션 (날짜 range / 거래처 필터) GAS 와 정합 여부 |
| 매출 — 원장 | GAS `원장` | `GET /api/v1/accounting/ledgers` | 동일 |
| 사입 (위탁) | 이카운트 사입 분류 | `GET/POST /api/v1/slips?type=CONSIGNMENT` | 별도 분류/필터 옵션 회귀 |
| 거래처 / DC / 단톡방 / 발송금지 / 배차지역 | (SP-06 잠금) | SP-06 endpoint 유지 | 본 슬라이스는 회귀 가드만 |

### 4.2 Gateway / 인증 계약 회귀

- SP-06 의 no-strip route + downstream `X-User-*` header 인증 계약을 본 슬라이스에서도 정적 계약으로 유지한다.
- 신규 endpoint 추가 시 `api-gateway` `application.yml` 의 `StripPrefix` 설정과 downstream service 의 `WebSecurityConfig` 를 같은 PR 에서 검토한다 (`feedback_pm_integration_build_check.md`).

### 4.3 환경변수 / placeholder 계약

자격값 평문 미기록 원칙에 따라 본 슬라이스에서 다루는 모든 환경변수/placeholder 를 표로 잠근다. 실제 값은 운영 PC 비밀 저장소 (`%USERPROFILE%\.samhan\*`) 에서만 다룬다.

| 변수 / placeholder | 용도 | 값 위치 |
|---|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS` | Google Sheets SA 키 경로 | `%USERPROFILE%\.samhan\sa-key.json` (운영 PC) |
| `SAMHAN_GOOGLE_SHEETS_SOURCE_ID` | `종합견적서` Spreadsheet id | 운영 PC `.env` |
| `SAMHAN_NOTION_API_KEY` | Notion API key (legacy reference only) | 운영 PC `.env`. runtime 에서 호출하지 않음 |
| `SAMHAN_NOTION_*_DB_ID` | Notion DB internal id (4종) | 운영 PC `.env`. runtime 에서 호출하지 않음 |
| `SAMHAN_ALIGO_API_KEY` | 알리고 SMS API key | 운영 PC `.env` (dryRun=mock 시 미사용) |
| `SAMHAN_AROLOGIS_DISPATCH_URL` | 아로로지스 발송 endpoint | `application.yml` placeholder |
| `SAMHAN_SLIP_DISPATCH_TASK_URL` | slip-service 회신 endpoint | `application.yml` placeholder |
| `SAMHAN_API_GATEWAY_PORT` | 운영 검증 스크립트 port override | SP-06 도입 |

### 4.4 OpenAPI / 한국어 Javadoc / dev-report 의무

- 본 슬라이스에서 추가/수정되는 모든 endpoint 는 한국어 Javadoc + springdoc-openapi 자동 생성 + `docs/dev-reports/sp-08-legacy-gas-db-api-parity.md` 누적 의무 (`feedback_function_documentation.md`).

---

## 5. 작업 단위 분해 (SP-08 sub-tasks)

각 sub-task 는 독립 PR 단위. 모두 `codex/sp-08-legacy-gas-db-api-parity` 가지 위에서 sub-branch 로 진행하거나, 직접 본 branch 에 commit 시 sub-task 단위로 commit 메시지를 구분한다. 5-team agent 패턴 + 통합 PR 패턴 (`feedback_multi_agent_team_pattern.md`, `feedback_integrated_pr_pattern.md`) 적용.

### SP-08-1 (본 PR) — 기획 + scope 잠금

- [x] 본 기획서 작성 + 메모리 등재 + `docs/handoff/CURRENT-WORK.md` 갱신
- [x] Playwright SP-08 정적 계약 spec 골격 생성 (`clients/desktop/playwright/sp-08-legacy-gas-db-api-parity/sp-08-legacy-gas-db-api-parity.spec.ts`) — 매트릭스 §4.1 의 메뉴 행 기준 placeholder assertion. 실 동작 검증은 후속 sub-task 에서 채운다.
- [x] CI grep 가드 추가 — `docs/`, `clients/desktop/playwright/`, `tools/operational-validation/` 산출물에서 Notion API key / Notion DB internal id (UUID 형식) / Google Sheet id / Aligo key / SA private key marker 의 평문 노출 zero 를 검증하는 Playwright 또는 npm script.

### SP-08-2 — 견적관리 CRUD parity

- [ ] 견적 목록 / 상세 / 수정 / 삭제 / 인쇄 endpoint 의 GAS parity cross-check 표 (§4.1) 를 dev-report 에 채운다.
- [ ] 누락된 동작 (상세 표면 / 삭제 soft / 인쇄 양식 차이) 을 별도 commit 으로 보정.
- [ ] Playwright SP-08 spec 의 견적관리 section GREEN.

### SP-08-3 — 공급사 (Vendor) CRUD parity

- [ ] 공급사 마스터 / 알리고 주소록 sync (dryRun) / vendor OCR endpoint contract 잠금.
- [ ] catalog lookup 이 SP-07 의 `_단가인상` tab 계약과 정합 유지되는지 cross-check.

### SP-08-4 — 주문 CRUD parity

- [ ] 주문 목록 / 상세 / 수정 / 삭제 / 인쇄 / 견적→주문 변환 동선 endpoint 잠금.

### SP-08-5 — 매입 / 사입 CRUD parity

- [ ] 매입 / 사입 목록 / 상세 / 검수 CTA / 생성 / 수정 / 삭제 endpoint 잠금.
- [ ] SP-03 검수 CTA 회귀가 SP-08 spec 에 포함되도록 cross-reference.

### SP-08-6 — 매출 / 회계 (거래명세서 / 계산서 / 일마감 / 원장) CRUD parity

- [ ] 매출 목록 / 상세 / 인쇄 endpoint 잠금.
- [ ] 거래명세서 / 계산서 / 일마감 / 원장 옵션 (날짜 range / 거래처 필터 / 인쇄 양식) 이 GAS 와 1:1 정합 여부 확인. 누락 시 sub-task 분해.

### SP-08-7 — Notion runtime 의존 zero 정적 잠금

- [ ] grep 가드 확장 — `clients/web/`, `clients/desktop/src/`, `clients/mobile-staff/src/`, `services/*/src/main/` 전 영역에서 `api.notion.com`, `Notion-Version` header, `notion-sdk` import 호출 zero 검증.
- [ ] estimate-app shim / 디버그 화면의 잔존 reference 는 주석 + README 명시 후 차단.

### SP-08-8 — 자격 평문 비공개 가드 강화

- [ ] CI grep 가드를 `docs/qa/sp-08-*/`, `docs/dev-reports/sp-08-*.md`, `docs/operational-validation/*.md`, Playwright fixture, 신규 commit diff 에 모두 적용.
- [ ] `tools/operational-validation/` 의 placeholder 와 실값 분리 (실값은 운영 PC `.env`).

### SP-08-9 — 통합 PR + 5-team 리뷰 + CI green + 머지

- [ ] 본 슬라이스 사용자 명시: "추후 진행할 작업은 같은 SP-08 슬라이스 안에서 진행" → sub-task 들을 본 branch 에 누적 후, 5-team 리뷰 종합 commit 으로 1 회 통합 PR 발행.
- [ ] PR 본문에 QA 캡처 1장 이상 인라인 첨부 (`feedback_pr_qa_screenshots.md`), 연관 Issue 명시 (`feedback_issue_close_after_pr.md`), 한국어 작성 (`feedback_korean_commits.md`).
- [ ] CI green + 5-team 0 결함 시 PM 자동 머지 (`feedback_user_merge_authority.md`).

---

## 6. 위험 요소

| # | 위험 | 영향 | 완화 |
|---|---|---|---|
| 1 | 신규 PR 에서 Notion runtime endpoint 가 다시 유입 | SP-06 회귀 + 운영 의존성 재발 | SP-08-7 grep 가드 + Playwright contract RED gate |
| 2 | 자격값 (Notion key / SA key / Sheet id / Aligo key) 이 PR 산출물에 평문 노출 | 보안 / GitGuardian alert / `feedback_gitguardian_false_positive.md` 의 false positive 가 아닌 진성 노출 | SP-08-1 / SP-08-8 grep 가드 + 본 기획서의 placeholder 원칙 |
| 3 | raw 와 DB 가 충돌해 운영자가 어느 쪽이 정답인지 혼동 | 영업/회계 정합성 사고 | §3.2 이중 source 규칙을 dev-report 와 운영 검증 문서에 명시. 모든 import job 멱등성 + Soft Delete |
| 4 | legacy GAS 옵션 (날짜 range / 거래처 필터 / 인쇄 양식) 일부 누락 | 영업/회계 담당자 손에 익은 동선과 어긋남 | §4.1 매트릭스 단위로 sub-task 분해. 누락 시 즉시 issue 등록 |
| 5 | UUID 가 신규 화면에서 노출 | `feedback_uuid_no_user_visibility.md` 위반 | SP-05 의 `toPublicTestId` 패턴을 견적/공급사/사입까지 확장. Playwright assertion 으로 UUID 형식 노출 zero 검증 |
| 6 | Soft Delete 위반 (물리 DELETE 추가) | `project_build_conventions.md` 위반 + 감사로그 무결성 손상 | review-blocker. Flyway migration / repository diff 의 DELETE statement 신규 추가 0 검증 |
| 7 | Windows 한글 경로 + JDK 17 환경에서 gradle full test 실패 | `feedback_korean_path_jdk.md` 트랩 재발 | targeted test (`--tests` 지정) 로 우회 + dev-report 에 명시 |
| 8 | IT 에서 외부 RestClient @MockBean 누락 → Eureka 비활성 → 500 | `feedback_it_mockbean_external_clients.md` 회귀 | 신규 IT 에서 외부 client 모두 @MockBean 격리 의무 |
| 9 | Aligo / vendor OCR / Google Sheets 실 자격이 CI 환경에 배치되지 않음 | runtime 검증 skip | dryRun/mock 으로 회귀 PASS 유지 + 운영 PC 검증 절차를 `docs/operational-validation/` 에 분리 |
| 10 | Plan/PR 산출물이 한국어 미준수 | `feedback_korean_commits.md` 위반 | 본 기획서/commit/PR/Issue 한국어 작성 + sub-task 별 검토 |

---

## 7. QA 검증 체크리스트

> 본 슬라이스의 통합 PR 본문에는 `docs/qa/sp-08-legacy-gas-db-api-parity/screenshots/*.png` 중 최소 1장을 인라인 첨부한다 (`feedback_pr_qa_screenshots.md`).

### 7.1 정적 계약 (Playwright, dev server 없이)

- [ ] `npx playwright test playwright/sp-08-legacy-gas-db-api-parity/sp-08-legacy-gas-db-api-parity.spec.ts --reporter=line` PASS (skipped 0)
- [ ] `npx playwright test playwright/sp-08-legacy-gas-db-api-parity playwright/full-menu-contract --reporter=line` PASS
- [ ] `npx playwright test playwright/sp-05-crud-surface playwright/sp-06-notion-db-crud playwright/sp-07-google-sheets-source --reporter=line` PASS (회귀)

### 7.2 자격 / 시크릿 평문 노출 zero

- [ ] CI grep 가드 PASS — Notion API key, Notion DB internal id (UUID 형식 8-4-4-4-12), Google Sheet id (`1`+44자 base64ish), Aligo API key, `BEGIN PRIVATE KEY` marker 가 `docs/`, `clients/desktop/playwright/`, `tools/operational-validation/`, 신규 commit diff 에 없음.
- [ ] `git diff` 의 신규 추가 라인에 위 패턴이 매칭되지 않음 (Husky pre-commit 또는 CI step).

### 7.3 Notion runtime 의존 zero

- [ ] `Grep` `api.notion.com`, `Notion-Version`, `@notionhq` import 결과 — `clients/web/` (active app), `clients/desktop/src/`, `clients/mobile-staff/src/`, `services/*/src/main/` 영역 매치 0.
- [ ] shim / README 등 reference 잔존 분은 주석으로 "runtime 호출 아님" 명시.

### 7.4 백엔드 회귀 (targeted)

- [ ] `.\gradlew.bat :services:partner-order-service:test --tests "*EstimateService*Test" --tests "*PartnerOrderService*Test" --tests "*VendorOrderService*Test" --tests "*BootstrapService*Test" --no-daemon --rerun-tasks` PASS
- [ ] `.\gradlew.bat :services:product-service:test --tests "*ProductSheetSyncService*Test" --no-daemon --rerun-tasks` PASS
- [ ] `.\gradlew.bat :services:slip-service:test --tests "*Slip*Test" --tests "*PurchaseInspection*Test" --no-daemon --rerun-tasks` PASS
- [ ] `.\gradlew.bat :services:accounting-service:test --tests "*DailyClosing*Test" --tests "*Ledger*Test" --tests "*Invoice*Test" --no-daemon --rerun-tasks` PASS
- [ ] `.\gradlew.bat :services:partner-service:test --tests "*Vendor*Test" --tests "*PartnerBlock*Test" --no-daemon --rerun-tasks` PASS
- [ ] `.\gradlew.bat :services:notification-service:test --tests "*ChatRoom*Test" --tests "*AligoAddressBook*Test" --no-daemon --rerun-tasks` PASS

### 7.5 프론트엔드 회귀

- [ ] `npm run typecheck` (`clients/desktop`) PASS
- [ ] `npm run lint` (`clients/desktop`) PASS (error 0)
- [ ] `npm run build` (`clients/desktop`) PASS
- [ ] `git diff --check` PASS (CRLF 안내 외 0)

### 7.6 운영 검증 (선택, 실 자격 보유 시)

- [ ] `tools/operational-validation/import-notion-csv.ps1` REGION 20 / DC 213 / CHAT 112 / BLOCK 6 PASS (SP-06 회귀)
- [ ] `tools/operational-validation/run-smoke-tests.ps1` service health UP 15/15, endpoint smoke OK 7/7
- [ ] `docs/operational-validation/google-sheets-source-validation.md` §5 runtime 검증 (SA 키 보유 시)

### 7.7 QA 스크린샷

- [ ] `node scripts/generate-sp-08-legacy-gas-db-api-parity-screenshots.mjs` 또는 동등 스크립트로 1280x900 PNG 6장 이상 생성 (`docs/qa/sp-08-legacy-gas-db-api-parity/screenshots/01~06.png`).
- [ ] PR 본문은 commit SHA raw URL 로 캡처 고정.

### 7.8 5-team / TM / PM 게이트

- [ ] Backend / Frontend / Designer / DevOps / QA 5-team 각각 PR comment 로 0 결함 확인.
- [ ] TM 통합 commit + 한국어 PR 본문.
- [ ] PM 자동 머지 조건 충족 시 (5-team 0 결함 + CI green) 자동 머지, 결함 / UNSTABLE 시 개발책임자 결정 대기.
- [ ] 머지 후 연관 Issue 자동 close.

### 7.9 문서 동기화 (`feedback_continuous_docs_sync.md`)

- [ ] `README.md`, `ROADMAP.md`, `DECISIONS.md`, `docs/handoff/CURRENT-WORK.md`, `docs/dev-reports/sp-08-legacy-gas-db-api-parity.md`, 각 client/service README 갱신을 같은 통합 commit 에 포함.

---

## 8. Non-goals

본 슬라이스가 **하지 않는** 것을 명시한다. 본 항목을 후속 작업으로 처리해야 한다고 판단되면 별도 슬라이스(SP-09+)로 발행한다.

1. **UI 마이그레이션 / 리디자인** — legacy GAS UI 와 동등한 동선/양식을 유지한다. Pretendard 토큰 / design-system 신규 적용 / 메뉴 재배치는 본 슬라이스 범위 밖.
2. **legacy GAS → Samhan API 실시간 동기 / bridging** — GAS 시트와 Samhan DB 를 양방향 실시간 동기하지 않는다. raw 는 이관 시점 snapshot 으로만 유지하고, 재이관은 명시적 import job 한 곳에서만 수행.
3. **Notion runtime read / write 재도입** — Samhan Public 서비스 어디에서도 Notion API 를 호출하지 않는다. Notion 4 표는 이미 SP-06 에서 DB 로 이관됨. 운영자가 Notion 표를 시각적으로 참조하는 것은 자유이나, 우리 시스템은 Notion 을 호출하지 않음.
4. **자격값 산출물 기록 / 공유** — Notion API key, Notion DB internal id, Google Sheet id, SA private key, Aligo API key 등 비밀값을 plan / dev-report / Playwright fixture / QA 캡처 / 운영 검증 문서에 평문으로 기록하지 않는다. 운영 PC 비밀 저장소 (`%USERPROFILE%\.samhan\*`, `.env`) 에서만 다룬다.
5. **알리고 / vendor OCR / Google Sheets 실 자격 활성화** — runtime 자격 배치 및 실 API 활성화는 별도 PR. 본 슬라이스는 dryRun / mock / static contract 회귀만 다룬다.
6. **신규 도메인 기능 추가** — 견적/주문/매입/매출/사입/공급사 외 신규 도메인 도입은 본 슬라이스 범위 밖.
7. **인쇄 양식 재설계** — 인쇄 양식은 legacy 100% 매칭 (`feedback_print_design_iteration.md`) 유지. 양식 디자인 자체의 변경/리뉴얼은 별도 슬라이스에서 mock → 캡처 → CSS 미세 조정 iteration 으로 진행.
8. **mobile-staff / 아로로지스 신규 화면** — 본 슬라이스는 Samhan Public 14 service 범위. 아로로지스 독립 운영 단위 / mobile-staff 신규 화면은 별도 슬라이스.
9. **Phase 11 AWS 마이그레이션 / 인프라 변경** — 본 슬라이스는 docker-compose 로컬 + targeted gradle test 까지만 검증.

---

## 부록 A — 산출물 위치

| 종류 | 경로 |
|---|---|
| 본 기획서 | `docs/planning/2026-05-16_legacy-gas-db-api-parity.md` |
| dev-report (sub-task 별 누적) | `docs/dev-reports/sp-08-legacy-gas-db-api-parity.md` |
| Playwright 정적 계약 | `clients/desktop/playwright/sp-08-legacy-gas-db-api-parity/sp-08-legacy-gas-db-api-parity.spec.ts` |
| QA 캡처 | `docs/qa/sp-08-legacy-gas-db-api-parity/screenshots/*.png` |
| QA 캡처 생성 스크립트 | `scripts/generate-sp-08-legacy-gas-db-api-parity-screenshots.mjs` |
| 운영 검증 (필요 시) | `docs/operational-validation/*.md` (SP-06 / SP-07 산출물 재사용) |
| 핸드오프 | `docs/handoff/CURRENT-WORK.md` |
| 메모리 | `.claude/memory/project_sp_08_legacy_gas_parity.md` (신규) |

## 부록 B — 참조 메모리

- `feedback_samhan_public_name.md` — 외부 호칭 "Samhan Public"
- `feedback_uuid_no_user_visibility.md` — UUID 사용자 비공개
- `project_build_conventions.md` — BaseEntity 7 audit + Soft Delete
- `feedback_korean_commits.md` — 한국어 commit / PR / Issue
- `feedback_integrated_pr_pattern.md` — 통합 PR 패턴
- `feedback_multi_agent_team_pattern.md` — 5-team agent 디스패치
- `feedback_pm_integration_build_check.md` — PM 통합 풀빌드 가드
- `feedback_pr_qa_screenshots.md` — PR QA 스크린샷 의무
- `feedback_continuous_docs_sync.md` — 문서 동기화 의무
- `feedback_function_documentation.md` — 한국어 Javadoc + OpenAPI + dev-report 3-layer
- `feedback_print_design_iteration.md` — 인쇄 양식 iteration
- `feedback_uuid_no_user_visibility.md` — UUID 비공개
- `feedback_it_mockbean_external_clients.md` — IT @MockBean 격리
- `feedback_korean_path_jdk.md` — Windows 한글 경로 트랩
- `feedback_user_merge_authority.md` — PM 자동 머지 조건
- `feedback_issue_close_after_pr.md` — PR 머지 후 Issue close
- `feedback_pr_ci_monitoring.md` — PR 발행 후 CI watch
- `feedback_gitguardian_false_positive.md` — GitGuardian 처리
