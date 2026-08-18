# 이슈 #1238 동작 축 4건 정찰

- 정찰일: 2026-08-18
- 정찰자: CODEX SOL
- 범위: A-1 Notion 일회성 적재 · A-2 일마감 탭 분류 · A-3 I호스 1,000원 · A-4 영업수수료
- 안전 조건: `main`에서 소스·GitHub·공유 PostgreSQL을 읽기 전용으로 조회했다. 코드 수정, `git add/commit/push`, 업무 DB write, 컨테이너 중지·재시작·교체는 하지 않았다.
- 채움률 정의: `COUNT(컬럼) / 테이블 전체 행`. 빈 문자열은 값으로 세고 `NULL`만 미채움으로 센다. soft-delete 행도 스키마 현황에는 포함하고, 실영향에서는 활성 행을 별도로 센다. 0행 테이블은 `0/0 (N/A)`로 쓴다.

## 먼저 보는 결론

| 건 | 레거시↔현행 | 실데이터 영향 | 중복 방지 결론 |
|---|---|---:|---|
| A-1 | 레거시는 실행 시 Notion 조회, 현행은 CSV 1회 import 뒤 DB 정본 | 활성 343행. 기존 원천 대조에서 격차 149행/코드 | import 구조는 PR #115·#453, runtime Notion zero는 #233에 이미 구현. 실제 전체 재적재는 PR #1245 진행 중 |
| A-2 | 회계반영일자가 있는 행/없는 행의 `결과`·`선발행` 배치가 정확히 반대 | 현재 대상 24행 전부 반대 탭: 반영 1행 + 미반영 23행 | 기존 분류는 PR #1219. PR #1264·#1270이 같은 화면을 수정 중이나 분류 자체는 고치지 않음 |
| A-3 | 저장소 레거시 원문 7,000원, 현행 8,000원 | 품목 마스터 1건, 숨김 설정 184거래처. 저장 견적·주문·전표 해당 라인 0건 | 8,000원은 PR #967에서 이미 구현. Issue #976은 당시 Drive 라이브 정본도 8,000원이라고 기록 |
| A-4 | 계산식·요율·사용자 실행 경로가 현재는 모두 있음 | 요율 계약 1건, 정산서·snapshot·결재 claim 0건 | 실행 경로는 PR #1248에서 이미 구현. 새 구현은 중복 |

---

## 【A-1 Notion 일회성 적재】

### ① 레거시는 무엇을 하는가

레거시는 네 표를 장기 저장소이자 실행 시 원천으로 직접 읽는다.

- 단톡방은 `getChatMapData()`를 호출하고(`tools/legacy-gas/배차안내문자/Code.js:161`), cursor가 끝날 때까지 Notion DB를 반복 조회한다.

  > `UrlFetchApp.fetch('https://api.notion.com/v1/databases/' + NOTION_DB_ID_CHAT + '/query', opts);`  
  > — `tools/legacy-gas/배차안내문자/Code.js:609-648` 중 629행

- 발송금지도 같은 실행에서 `getForbiddenData()`를 호출하고(`tools/legacy-gas/배차안내문자/Code.js:162`), cursor가 끝날 때까지 반복 조회한다.

  > `UrlFetchApp.fetch('https://api.notion.com/v1/databases/' + NOTION_DB_ID_BLOCK + '/query', opts);`  
  > — `tools/legacy-gas/배차안내문자/Code.js:651-688` 중 671행

- 지역분류는 처리 때 `getRegionFromNotion()`을 호출한다(`tools/legacy-gas/가배차분류리스트/Code.js:586`). 함수는 Notion DB를 POST 조회해 `분류 그룹`과 `검색어`를 만든다.

  > `var res = UrlFetchApp.fetch('https://api.notion.com/v1/databases/' + NOTION_DB_ID_REGION + '/query', options);`  
  > `if (g) out.push({ '분류 그룹': g, '검색어': s });`  
  > — `tools/legacy-gas/가배차분류리스트/Code.js:210-251` 중 228, 248행

- 거래처 DC는 거래처별 조회 때 Notion을 읽되 10분 cache를 둔다. 즉 일회성 적재가 아니라 짧은 cache를 둔 반복 동기 조회다.

  > `var dbUrl = 'https://api.notion.com/v1/databases/' + NOTION_DB_ID;`  
  > `url = 'https://api.notion.com/v1/data_sources/' + dataSourceId + '/query';`  
  > `cachePutJSON_(cacheKey, out, 60 * 10);`  
  > — `tools/legacy-gas/거래처 발송 주문서/Code.js:2443-2619` 중 2476, 2506, 2618행

따라서 레거시는 “처음 한 번 옮기고 끝”이 아니다. 단톡방·발송금지·지역은 실행마다, DC는 최대 10분 지연으로 Notion 변경을 다시 읽는다.

### ② 현행은 무엇을 하는가

현행 운영 스크립트가 성격을 명시한다.

> `tools/legacy-gas/_notion-export/ 의 4 CSV 를 admin endpoint 4 회 POST 호출해`  
> `Samhan Public 각 service DB 로 이관한다. 이관 후 조회/수정/삭제는 Notion 이 아니라`  
> `Samhan Public DB CRUD 화면/API 에서 수행한다.`  
> — `tools/operational-validation/import-notion-csv.ps1:3-9`

네 호출 대상도 REGION/DC/CHAT/BLOCK 네 개로 고정돼 있다(`tools/operational-validation/import-notion-csv.ps1:125-156`). import는 사람이 스크립트를 실행할 때만 수행된다(`tools/operational-validation/import-notion-csv.ps1:239-267`). production의 Notion runtime 사용은 `scripts/check-notion-zero.sh:6-12,37-43,78-81`의 CI 가드와 머지된 PR #233으로 금지돼 있다.

### ③ 무엇이 다른가

레거시는 Notion을 반복 조회하는 반면 현행은 CSV를 한 번 import한 뒤 네 서비스 DB를 독립 정본으로 쓰므로, “일회성”은 현행에 대해서만 맞고 Notion 변경은 자동 반영되지 않는다.

### ④ 실제 영향이 몇 건인가

#### 이론상

Notion을 계속 정본으로 유지한다면 네 표의 모든 변경이 drift 후보이며, 반복 동기화를 도입하면 현행 관리자 수정값을 다시 덮을 충돌 후보가 된다.

#### 실데이터 — 공유 DB read-only 실측

| 표 | 전체 | 활성 | 현재 구성 |
|---|---:|---:|---|
| 지역분류 `region_dispatch_classifications` | 20 | 20 | 활성 20 |
| 단톡방 `partner_chat_room_mappings` | 114 | 112 | `NOTION_IMPORT` 활성 112(연결 106·모호 4·미매칭 2), soft-delete 2 |
| 발송금지 `blocked_partners` | 0 | 0 | 0건 |
| DC `dc_configs` | 211 | 211 | `LEGACY_CSV` 210 + `ADMIN_EDIT` 1 |
| 합계 | 345 | **343** | 서로 다른 DB 행의 합이며 거래처 고유 수가 아님 |

현재 DB에 실제로 놓인 영향 표면은 활성 **343행**이다. 원천 CSV와의 차이는 이미 Issue #1234에서 실데이터로 **149행/코드**, 그중 금액에 닿는 DC가 **126~127코드**로 측정돼 있다. 그 이슈의 원문은 발송금지 원천 6/DB 0, DC 원천 304행·301코드/현행 210코드, 원천에만 92·drift 43코드/67필드, 단톡방 누락 2·방명 drift 1, 지역 19그룹 20필드 drift라고 기록한다. 이번 환경에는 `_notion-export` CSV가 없어 그 원천 차이 149를 재계산하지는 못했고, 공유 DB 현재 행 수 343은 직접 재실측했다.

### ⑤ 우리 스키마가 무엇을 담는가 — 컬럼 전수·채움률

#### `arologis_db.region_dispatch_classifications` — 20행

- 20/20 (100%): `id, group_name, keywords, sort_order, created_at, created_by, modified_at, modified_by, is_deleted`
- 0/20 (0%): `deleted_at, deleted_by`

#### `notification_db.partner_chat_room_mappings` — 114행

- 114/114 (100%): `id, partner_code, partner_business_name_snapshot, chat_room_name, source, notion_created_at, created_at, created_by, modified_at, modified_by, is_deleted, partner_link_status`
- 112/114 (98.2%): `partner_link_reason`
- 2/114 (1.8%): `deleted_at, deleted_by`

#### `partner_db.blocked_partners` — 0행

- 전 컬럼 0/0 (N/A): `id, partner_code, partner_business_name_snapshot, block_reason, blocked_at, source, created_at, created_by, modified_at, modified_by, deleted_at, deleted_by, is_deleted`

#### `dc_config_db.dc_configs` — 211행

- 211/211 (100%): `id, partner_id, show_i_hose, unit_round_mode, source, created_at, created_by, modified_at, modified_by, is_deleted, unit_processing_enabled`
- 159/211 (75.4%): `home_discount_rate`
- 129/211 (61.1%): `commercial_discount_rate`
- 46/211 (21.8%): `discount_4way_amount`
- 45/211 (21.3%): `discount_360_amount, discount_1way_amount, discount_stand_amount`
- 16/211 (7.6%): `note`
- 15/211 (7.1%): `discount_deluxe_amount`
- 10/211 (4.7%): `discount_first_grade_amount`
- 1/211 (0.5%): `unit_round_to`
- 0/211 (0%): `deleted_at, deleted_by`

### ⑥ 이미 만들어진 것이 있는가

있다.

- PR #115 CLOSED·MERGED: REGION/DC/CHAT/BLOCK 네 CSV import, 네 DB·관리 UI 구현.
- PR #453 CLOSED·MERGED: DC Notion→DB import fidelity와 estimate-app 배선, “운영 시드 1회” 런북.
- PR #233 CLOSED·MERGED: production Notion runtime 의존 zero CI 가드.
- PR #1228 CLOSED·MERGED: DC 비율 100배 왜곡과 발송금지 6행 거부 파서 결함 수정.
- Issue #1234 OPEN / PR #1245 OPEN: 개발책임자가 이미 “CSV(Notion) 정본, 전체를 한 번에”로 확정한 149행/코드 전체 적재 트랙. A-1의 실제 재적재 작업과 직접 겹친다.

검색은 `Notion`, `Notion 일회성 적재`를 `gh issue list --state all --search`와 GitHub REST 전체 상태 검색으로 확인했다. CLOSED는 위처럼 구현 완료로 판정했다.

### ⑦ 고칠 때 깨질 수 있는 것

- 반복 Notion 동기화를 만들면 PR #233의 Notion-zero CI 가드와 정면 충돌한다.
- `ADMIN_EDIT` DC 1건과 향후 화면 수정값을 Notion이 덮을 수 있다. 충돌 우선순위·삭제 전파·audit가 필요하다.
- DC는 견적·주문 금액, 단톡방은 배차/문서 전달, 발송금지는 발송 차단, 지역분류는 배차 분류를 바꾼다.
- 거래처코드 연결 실패·모호 매핑 6건을 무심코 이름 fallback으로 되돌리면 잘못된 거래처에 붙을 수 있다.
- 자격값, API rate limit, 장애 시 fail-open/fail-closed, 10분 cache와 DB cache의 이중 일관성 문제가 생긴다.
- PR #1245가 같은 데이터를 적재 중이므로 새 트랙은 중복 write와 검증 충돌을 만든다.

### 선택지

1. **일회성 적재 유지**: PR #1245로 149행/코드 격차를 한 번 정리하고 이후 서비스 DB/관리 화면을 유일 정본으로 선언한다. Notion은 동결·archive한다.
2. **Notion→DB 반복 단방향 동기화**: Notion을 계속 정본으로 두고 예약 pull을 만든다. PR #233 예외, 네 서비스 충돌 정책, 관리자 수정 보호, 삭제/audit 계약을 함께 정해야 한다.
3. **하지 않는다**: 현재 343 활성 행은 그대로 쓰되 #1234의 149행/코드 격차도 남긴다. 금액 영향 126~127코드와 발송금지 0건을 수용할 때만 가능하다.

**PM 권장:** 선택지 1. 이미 개발책임자가 #1234에서 전체 일회성 적재를 확정했고 PR #1245가 진행 중이며, production Notion runtime zero도 #233으로 의도적으로 잠갔다. 새 동기화 구현은 현재 아키텍처와 중복·충돌한다.

---

## 【A-2 일마감 탭 분류】

### ① 레거시는 무엇을 하는가

레거시는 유효한 회계반영일자가 있으면 `pre`, 없으면 `main`에 넣는다.

> `if (datePattern.test(String(item['회계반영일자']).trim())) pre.push(item);`  
> `else main.push(item);`  
> — `tools/legacy-gas/일마감 프로그램/Code.js:737-740`

화면 매핑은 `main=결과`, `pre=선발행`이다.

> `{ ... title: '결과', ... dataKey: 'main' },`  
> `{ ... title: '선발행', ... dataKey: 'pre' },`  
> — `tools/legacy-gas/일마감 프로그램/Index.html:210-213`

즉 회계반영일자 있음 = 선발행, 없음 = 결과다.

### ② 현행은 무엇을 하는가

> `rows.filter((row) => tab === 'RESULT'`  
> `  ? Boolean(row.accountingPostedAt)`  
> `  : !row.accountingPostedAt)`  
> — `clients/desktop/src/renderer/routes/DailyClosingPage.tsx:759-763`

즉 회계반영일시 있음 = 결과, 없음 = 선발행이다.

### ③ 무엇이 다른가

같은 `회계반영일자/accountingPostedAt` 유무를 기준으로 삼지만 결과와 선발행 탭을 서로 정확히 반대로 배치한다.

### ④ 실제 영향이 몇 건인가

#### 이론상

현행 일마감 대상인 활성 OUTBOUND `CONFIRMED/DELIVERED/COMPLETED`의 모든 행은 Boolean 조건의 양쪽이 뒤집히므로 전부 레거시와 다른 탭에 놓인다.

#### 실데이터 — 공유 DB read-only 실측

- 대상 전표: 21건, 라인: **24행**.
- `sales_accounting_slip_allocations → sales_accounting_slip_lines → sales_accounting_slips.posted_at`으로 회계반영된 대상: 1전표·**1행** (`2026/08/14-17`). 현행 결과 / 레거시 선발행.
- 미반영 대상: 20전표·**23행**. 현행 선발행 / 레거시 결과.
- 따라서 실제 반대 탭 영향: **24행 전부**.
- 참고: 라이브 QA가 이미 쓴 2026-08-14는 결과 1 + 선발행 12 = 13행, 2026-08-03은 결과 0 + 선발행 4 = 4행이다. 이번 전체 DB 실측은 날짜를 제한하지 않아 24행이다.

### ⑤ 우리 스키마가 무엇을 담는가 — 컬럼 전수·채움률

`accountingPostedAt`은 `daily_closings`에 저장된 열이 아니다. 원본 전표번호를 allocation으로 회계 매출전표에 연결해 `sales_accounting_slips.posted_at`을 읽은 응답 파생값이다. `accounting_db.daily_closings`는 마감 집계·잠금 이력이다.

#### `accounting_db.daily_closings` — 8행

- 8/8 (100%): `id, closing_date, total_supply, total_vat, total_amount, slip_count, is_locked, locked_at, locked_by, version, created_at, created_by, modified_at, modified_by, is_deleted, closing_kind, source_kind`
- 5/8 (62.5%): `deleted_at, deleted_by`
- 3/8 (37.5%): `partner_id`

#### `slip_db.slips` — 2,829행

- 2,829/2,829: `source_type, is_deleted, status, slip_type, slip_date, requester_id, id, source_warehouse_code_attempt_count, source_warehouse_code_snapshot_status, source_warehouse_code_pending, dispatch_status, seq_no, version, created_by, modified_at, driver_signature_source, revision_count, slip_no, created_at, modified_by, signature_source, lock_flag`
- 2,824: `io_type`; 2,723: `time_date`; 2,713: `source_warehouse_id`; 2,626: `partner_name`; 2,602: `source_warehouse_code`; 2,593: `deleted_at, deleted_by`; 2,550: `deleted_by_name`; 2,402: `memo`; 1,933: `project_name`; 1,929: `recipient_phone`; 787: `partner_id`; 765: `partner_code`; 657: `business_number`; 333: `delivery_tag`; 257: `customer_representative`; 250: `customer_address`; 247: `customer_tel`; 134: `accepted_at, dispatcher_user_id, accepted_by, dispatcher_signed_at`; 117: `destination_warehouse_id`; 104: `redline_anchor_revision_no, revision_count_baseline`; 84: `inspector_user_id, inspector_signed_at, completed_at`; 39: `confirmed_at`; 38: `discount_info`; 28: `source_id`; 23: `driver_phone, driver_name`; 22: `unload_date, idempotency_key`; 19: `delivery_batch_id`; 13: `delivery_address`; 11: `destination_warehouse_name`; 4: `source_warehouse_code_abandoned_at, source_warehouse_code_last_error, shipping_address, receiver_phone`; 3: `payment_due_label`; 1: `inspection_address`.
- 0/2,829: `source_warehouse_code_claim_token, source_warehouse_code_claimed_at, source_warehouse_code_next_attempt_at, signed_at, signer_name, signature_hash, signature_share_token, driver_signed_at, driver_signature_hash, collect_term, payment_due_date, signature_png, signature_channel, signature_share_expires_at, driver_signature_png, driver_signature_channel, classified_region_group, agree_term, supervision_address, printed_at`.

#### `slip_db.slip_lines` — 4,044행

- 4,044/4,044: `is_deleted, product_id, id, slip_id, product_name, quantity, line_total, created_by, modified_by, set_head, model_name, unit_price, created_at`
- 4,041: `unit_price_with_vat, vat_amount, modified_at, supply_amount`; 3,701: `deleted_by, deleted_at`; 2,122: `note`; 882: `parent_set_model`; 743: `unit_price_domain`; 659: `specification`; 364: `bundle_set_options`; 29: `source_order_line_id`.
- 0/4,044: `daily_closing_discount_rate, daily_closing_release_price, category_key`.

#### `accounting_db.sales_accounting_slips` — 12행

- 12/12: `id, slip_no, slip_date, partner_id, partner_code, partner_name, tax_type, status, total_supply_amount, total_vat_amount, total_amount, created_at, created_by, modified_at, modified_by, is_deleted, version`
- 11: `deleted_at`; 10: `deleted_by`; 7: `memo`; 2: `posted_at, posted_by`; 1: `tax_invoice_id`; 0: `due_date`.

#### `accounting_db.sales_accounting_slip_lines` — 12행

- 12/12: `id, slip_id, line_no, product_code, product_name, qty, unit_price, supply_amount, vat_amount, line_total, created_at, created_by, modified_at, modified_by, is_deleted, version`
- 11: `deleted_at`; 10: `deleted_by`; 1: `model_name`; 0: `category_key`.

#### `accounting_db.sales_accounting_slip_allocations` — 12행

- 12/12: `id, sales_slip_line_id, source_slip_id, source_slip_no, source_line_id, source_line_no, allocated_qty, allocated_amount, created_at, created_by, modified_at, modified_by, is_deleted, version`
- 11: `deleted_at, deleted_by`; 1: `model_name`; 0: `category_key`.

### ⑥ 이미 만들어진 것이 있는가

있다.

- PR #1219 CLOSED·MERGED: 현재의 결과/선발행 탭과 역분류를 처음 구현.
- PR #1230 CLOSED·MERGED: 일마감 다중선택·정렬/필터.
- PR #1250 CLOSED·MERGED: 금액 편집·양방향 할인율.
- PR #1264 OPEN: 일마감 소계행에서 회계 매출/매입전표 생성. 현재 미반영=선발행 가정과 버튼 위치를 사용한다.
- PR #1270 OPEN: 열 정합 5건·레거시 부재 기능. diff와 QA는 현재 분류(8/14 결과 1·선발행 12)를 그대로 고정하며 분류 자체는 고치지 않는다.

따라서 #1264·#1270과 **겹친다**. 새 PR을 별도로 만들기보다 개발책임자 결정에 따라 두 open PR의 테스트·라벨·버튼 위치를 함께 정렬해야 한다.

### ⑦ 고칠 때 깨질 수 있는 것

- #1264의 회계전표 생성 버튼은 현재 미반영 행이 있는 `선발행` 탭을 전제로 한다. 탭만 뒤집으면 버튼의 업무 위치와 QA가 바뀐다.
- #1270의 실 QA 행 수·스크린샷·탭 테스트(결과 1, 선발행 12)가 모두 역전된다.
- 회계반영 행 금액 잠금과 미반영 행 편집 가능성은 탭명과 분리해 유지해야 한다.
- 탭별 정렬·필터·검색·다중선택·합계·저장 view state가 서로 바뀐다.
- 사용자 북마크가 아니라도 테스트 id `daily-closing-tab-result/pre_issued`, 접근성 이름, 문서·교육자료가 함께 바뀐다.
- `daily_closings` 잠금/마감이력은 탭 분류와 다른 축이므로 함께 뒤집으면 안 된다.

### 선택지

1. **레거시 의미로 뒤집는다**: `accountingPostedAt != null`은 선발행, null은 결과. #1264 생성 버튼은 “미반영 결과” 쪽으로 이동하고 #1270 QA를 갱신한다.
2. **현행 분류를 유지하고 탭명을 명시화한다**: `결과→회계반영 완료`, `선발행→회계반영 전`처럼 Boolean 의미를 그대로 노출한다. 레거시 용어와의 단절을 문서화한다.
3. **하지 않는다**: “선발행=아직 회계전표 발행 전”이라는 현행 정의를 개발책임자가 공식 채택할 때만 가능하다. 실제 24행 전부가 레거시 탭과 반대라는 사실은 남는다.

**PM 권장:** 선택지 1. 레거시 원문에서 `pre`의 뜻이 회계반영일자가 이미 있는 행으로 명확하고, 현재 라벨은 24행 전부를 반대로 설명한다. 다만 #1264·#1270에 즉시 반영해 버튼·QA를 한 번에 고쳐야 한다.

---

## 【A-3 I호스 1,000원】

### ① 레거시는 무엇을 하는가

저장소 레거시 원문은 홈멀티 I형 유연호스가 있고 `home_hose_i`가 체크되지 않았을 때 시트 단가 대신 7,000원을 즉시 반환한다.

> `const showIHose = document.getElementById('home_hose_i')?.checked;`  
> `if (!showIHose && /유연호스\s*I형/i.test(rawName)) return 7000;`  
> — `tools/legacy-gas/종합견적서/index.html:3932-3934`

같은 7,000원 상수는 `tools/legacy-gas/종합견적서/index.html:3976-4001,4045,4720`에도 반복된다. 1,000원은 별도 가산식이 아니라 **레거시 7,000원과 현행 8,000원의 고정단가 차이**에서 온다.

### ② 현행은 무엇을 하는가

> `const showIHose = document.getElementById('home_hose_i')?.checked;`  
> `if (!showIHose && /유연호스\s*I형/i.test(rawName)) return 8000;`  
> — `clients/web/estimate-app/views/index.ejs:4380-4382`

현행의 8,000원은 홈·싱글·상업·세트 경로에 반복된다(`clients/web/estimate-app/views/index.ejs:4424-4450,4495,5176`).

### ③ 무엇이 다른가

같은 숨김 조건과 같은 품목 정규식인데 강제 단가만 레거시 7,000원, 현행 8,000원이라 수량 1개당 현행이 1,000원 높다.

### ④ 실제 영향이 몇 건인가

#### 이론상

`show_i_hose=false` 거래처에서 I형 유연호스가 견적 계산에 들어가면 수량 × 1,000원만큼 새 견적 총액이 달라진다. 현재 활성 DC 설정은 false **184거래처**, true 27거래처다.

#### 실데이터 — 공유 DB read-only 실측

- 품목 마스터: 활성 **1건** — `유연호스 I형 / FH-LFHIF`. 가격 필드 `release_price, delivery_price, outbound_price, unit_price_with_vat, selling_price`는 모두 0원이라 현재 상수가 실제 가격 원천이다.
- 활성 저장 견적 `estimate_lines`: 해당 품목 **0라인 / 0견적 / 수량 0**.
- 활성 거래처 주문 `partner_order_lines`: 해당 품목 **0라인 / 0주문 / 수량 0**.
- 활성 출고·입고전표 `slip_lines`: 해당 품목 **0라인 / 0전표 / 수량 0**.
- 따라서 **이미 저장된 문서의 실금액 영향은 0건·0원**이다. 다만 마스터 1건과 숨김 설정 184거래처가 있어 신규 견적에서는 도달 가능하다.

### ⑤ 우리 스키마가 무엇을 담는가 — 컬럼 전수·채움률

#### `product_db.products` — 3,237행

- 3,237/3,237: `is_deleted, status, usage_scope, category_id, id, allocation_round_unit, bundle_components_manual, lineage, fixed_discount_manual, classification_manual, variable_discount_manual, goods_type, usage_scope_manual, unit_price_with_vat, tax_type, revision_count, name, selling_price, currency, created_at, product_type, legacy_discount_flag, discount_flags, delivery_price, product_business_type, vat_rate_on_sales, price_includes_vat, safety_stock_qty, min_order_unit, outbound_price, outdoor_price, multi_48_price, item_35_price, model_name, purchase_price, created_by, has_variable_discount, release_price, unit, inventory_qty_mgmt, vat_rate_on_purchase, lead_time_days, inbound_price, single_price, multi_50_price, multi_45_price`
- 3,140: `modified_at, modified_by`; 3,137: `model_code`; 2,796: `product_code, specification`; 1,172: `product_category`; 1,123: `cat_l_id`; 892: `cat_m_id`; 401: `parent_bundle_set_model`; 357: `bundle_mode`; 271: `pyong_size`; 218: `discount_option`; 167: `fixed_discount_rate`; 153: `deleted_by, deleted_at`; 120: `description`; 118: `cat_s_id`; 106: `set_material_key`; 100: `spec_text, barcode, product_group1, product_group2, remark, purchase_source`; 62: `panel_type`; 51: `tags`; 17: `remote_type`; 4: `estimate_category`; 3: `display_order`; 0: `category_group`.

#### `slip_db.estimate_lines` — 2,112행

- 2,112/2,112: `is_deleted, product_id, id, set_head, modified_by, modified_at, created_by, created_at, line_no, model_name, quantity, supply_amount, vat_amount, estimate_id, product_name, unit_price, line_total`
- 2,057: `deleted_by, deleted_at`; 1,947: `note`; 151: `unit_price_with_vat`; 68: `parent_set_model`; 44: `specification`; 24: `specification_source`; 18: `bundle_set_options`.

#### `partner_order_db.partner_order_lines` — 2,273행

- 2,273/2,273: `product_id, id, amount_authority, converted_quantity, is_deleted, modified_by, modified_at, created_by, created_at, subtotal, price_vat, quantity, category_key, product_name, model_name, partner_order_id`
- 2,262: `deleted_by, deleted_at`; 2,095: `remark`; 221: `vat_amount, supply_amount`.
- 활성 행은 11개이며 I호스는 0개다.

`slip_lines` 전 컬럼·채움률은 A-2에 전수 기재했다.

### ⑥ 이미 만들어진 것이 있는가

있다.

- PR #967 CLOSED·MERGED가 현행 `return 8000`을 도입했다(`git blame` 커밋 `694c72a8b`). 이 PR의 주목적은 I형 1WAY 호스 수량 0 소실 수정이었지만 단가도 함께 들어왔다.
- Issue #976 CLOSED는 Drive 라이브를 8,000원, 당시 제품을 7,000원으로 실측하고 “1,000원/EA” 반영 대상으로 기록했다.
- PR #980 CLOSED·MERGED는 #976의 라이브 가격 정합 트랙이지만 I호스 8,000원 줄 자체의 blame은 #967이다.
- PR #1249 CLOSED·MERGED는 #1238 종합견적서 일부 구현이나 현재 I호스 8,000원은 그대로라 이 결정은 닫지 않았다.
- PR #948 CLOSED·MERGED는 I호스 수량 동기화 칩 설정을 구현했다. 단가 선택과 다른 축이지만 회귀 표면이다.

즉 “8,000원을 새로 구현”하면 중복이다. 결정 대상은 저장소 레거시 7,000원으로 되돌릴지, 최신 Drive 기록과 기구현 8,000원을 유지할지다.

### ⑦ 고칠 때 깨질 수 있는 것

- 신규 견적의 행 금액·총액·세트 배분액·VAT가 수량 × 1,000원만큼 바뀐다.
- PR #967의 I형 1WAY 수량 회귀 테스트·golden과 PR #948 칩 동기화 경로를 함께 재검증해야 한다.
- 8,000원은 네 계산 위치에 반복돼 한 곳만 바꾸면 홈/싱글/상업/세트가 다시 갈라진다.
- 품목 마스터 가격을 정본으로 바꾸려면 현재 0원인 다섯 가격 필드를 먼저 채우고 fallback·시점 가격 계약을 정해야 한다.
- 저장된 문서 0건이라 소급 금액은 없지만, 저장 전 브라우저 snapshot/재생 blob의 계산 정본을 바꾸면 같은 입력의 재현값이 달라질 수 있다.
- Issue #976의 “Drive 라이브 8,000원” 기록과 저장소 `tools/legacy-gas` 7,000원 원문이 서로 충돌하므로 어느 시점 원본이 정본인지 명시하지 않으면 다시 뒤집힌다.

### 선택지

1. **7,000원으로 맞춘다**: 저장소 `tools/legacy-gas` 원문을 정본으로 보고 현행 네 위치를 7,000원으로 통일한다.
2. **8,000원을 유지한다**: Issue #976의 최신 Drive 라이브 실측과 이미 머지된 PR #967을 정본으로 본다. 저장소 legacy snapshot이 낡았다고 명시한다.
3. **하드코딩을 없앤다**: 품목/가격 이력 또는 별도 설정을 정본으로 승격한다. 현재 마스터 가격 0원을 먼저 채우고 fallback과 기준일을 정해야 한다.
4. **하지 않는다**: 선택지 2와 결과는 같지만 정본 충돌 문서가 남는다. 저장 문서 실영향 0건이어서 즉시 금액 소급은 없다는 이유로만 보류 가능하다.

**PM 권장:** 선택지 2. #976이 더 최신 Drive 라이브 8,000원을 실측했고 #967이 이미 이를 구현했으며, 저장 문서 영향은 0건이다. 다만 개발책임자가 저장소 `tools/legacy-gas`를 절대 정본으로 지정하면 선택지 1로 뒤집어야 한다.

---

## 【A-4 영업수수료】

### ① 레거시는 무엇을 하는가

레거시는 사용자 입력 `총 결제금액·장비대·선지급·설치비·안전관리비`를 읽어 다음 순서로 계산한다.

> `var card = payMethod === '카드결제' ? xround(-total * 0.03) : 0;`  
> `var sales = total - equip + card;`  
> `var expense = xround(sales * -expenseRate);`  
> `var wht = whtApply ? xround(sales * -0.033) : 0;`  
> `var dogup = xround(install * -0.08);`  
> `var safety = -safetyInput;`  
> `var subtotal = sales + expense + wht + dogup + safety;`  
> `var payout = subtotal - prepaid;`  
> `var supply = xround(subtotal / 1.1);`  
> `var vat = subtotal - supply;`  
> — `tools/legacy-gas/영업수수료 계산/Index.html:323-340`

`xround`는 절댓값을 원 단위 `Math.round`한 뒤 부호를 복원한다(`tools/legacy-gas/영업수수료 계산/Index.html:317-320`). 기본 제경비율은 8%다(`tools/legacy-gas/영업수수료 계산/Index.html:297-301`).

### ② 현행은 무엇을 하는가

현재 서버 계산식은 레거시와 같은 순서다.

> `card = -total × contract.cardRate`  
> `sales = total - equipment + card`  
> `expense = sales × -expenseRate`  
> `withholding = sales × -withholdingRate`  
> `install = installInput × -installRate`  
> `safety = -safetyInput`  
> `subtotal = sales + expense + withholding + install + safety`  
> `payout = subtotal - prepaid`  
> `supply = xround(subtotal / 1.1)`, `vat = subtotal - supply`  
> — `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/SalesCommissionSettlementCalculator.java:25-45`

사용자 실행 경로도 현재는 존재한다.

- 서버: `POST /{id}/calculate`가 DRAFT snapshot을 계산·저장한다(`SalesCommissionSettlementController.java:76-85`).
- 화면: 총 결제금액·장비대·선지급·설치비·안전관리비, 제경비율, 결제방식, 원천징수를 입력하고 `계산 및 저장`을 누른다(`SalesCommissionSettlementDetailPage.tsx:230-243`).
- 클라이언트 mutation은 `calculateSalesCommissionSettlement`를 호출하고 최신 request sequence만 반영한다(`SalesCommissionSettlementDetailPage.tsx:109-134`).
- 공유 DB 요율 계약 v1: 카드 3%, 제경비 8%, 원천징수 3.3%, 설치 8%.

### ③ 무엇이 다른가

2026-08-15 보고서 당시에는 사용자 실행 경로가 없었지만 현재 `main`은 PR #1248로 그 경로까지 구현돼, 계산 규칙·요율·실행 가능성에서 조사 대상 차이가 이미 해소됐다.

### ④ 실제 영향이 몇 건인가

#### 이론상

앞으로 생성되는 모든 영업수수료 정산 DRAFT는 입력·계약 버전에 따라 위 식의 영향을 받는다. 요율을 바꾸면 이후 계산 snapshot이 달라진다.

#### 실데이터 — 공유 DB read-only 실측

- 활성 요율 계약: **1건**(v1, 3% / 8% / 3.3% / 8%).
- `sales_commission_settlements`: **0건**.
- `sales_commission_settlement_snapshot_histories`: **0건**.
- `sales_commission_settlement_approval_claims`: **0건**.
- 따라서 현재 저장된 정산서의 실금액 영향은 **0건·0원**이다. “경로가 없다” 때문에 막힌 데이터도 DB에는 0건이다.

### ⑤ 우리 스키마가 무엇을 담는가 — 컬럼 전수·채움률

#### `sales_commission_rate_contracts` — 1행

- 1/1: `id, version_no, card_rate, expense_rate, withholding_rate, install_rate, created_at, created_by, is_deleted`
- 0/1: `modified_at, modified_by, deleted_at, deleted_by`

#### `sales_commission_settlements` — 0행

- 전 컬럼 0/0 (N/A): `id, document_no, settlement_date, status, version, created_at, created_by, modified_at, modified_by, deleted_at, deleted_by, is_deleted, rate_contract_id, total_amount, equipment_amount, prepaid_amount, install_input_amount, safety_input_amount, payment_method, withholding_applied, manual_expense_rate, applied_expense_rate, card_amount, sales_amount, expense_amount, withholding_amount, install_amount, safety_amount, subtotal_amount, payout_amount, supply_amount, vat_amount, recalculation_required, last_calculation_request_sequence`

#### `sales_commission_settlement_snapshot_histories` — 0행

- 전 컬럼 0/0 (N/A): `id, settlement_id, document_no, settlement_date, rate_contract_id, total_amount, equipment_amount, prepaid_amount, install_input_amount, safety_input_amount, payment_method, withholding_applied, manual_expense_rate, applied_expense_rate, card_amount, sales_amount, expense_amount, withholding_amount, install_amount, safety_amount, subtotal_amount, payout_amount, supply_amount, vat_amount, created_at, created_by, modified_at, modified_by, deleted_at, deleted_by, is_deleted`

#### `sales_commission_settlement_approval_claims` — 0행

- 전 컬럼 0/0 (N/A): `id, settlement_id, approval_id, claim_token, status, expires_at, created_at, created_by, modified_at, modified_by, deleted_at, deleted_by, is_deleted`

#### `sales_commission_settlement_number_sequences` — 0행

- 전 컬럼 0/0 (N/A): `id, settlement_date, last_seq, version, created_at, created_by, modified_at, modified_by, deleted_at, deleted_by, is_deleted`

### ⑥ 이미 만들어진 것이 있는가

있다.

- PR #1165 CLOSED·MERGED: 영업수수료 정산 도메인·계산기·채번·그룹웨어 지출결의 연결 기반.
- PR #1168 CLOSED·MERGED: 그룹웨어 참조 첨부와 역방향 조회.
- PR #1170 CLOSED·MERGED: REST 목록/상세/생성/확정, 회계 메뉴·권한·화면. 당시 계산 입력 경로는 빠져 있었다.
- PR #1248 CLOSED·MERGED: `/{id}/calculate`, 입력 폼, 계산 및 저장, request sequence, snapshot 필드를 구현. 현재 결정을 사실상 해소한 PR이다.

`영업수수료`, `sales commission` 전체 상태 검색에서 위 CLOSED PR들을 확인했다. 새 계산기·화면을 만들면 중복이다.

### ⑦ 고칠 때 깨질 수 있는 것

- 계산 순서·부호·HALF_UP을 바꾸면 카드·제경비·원천징수·도급비·안전관리비·지급액·VAT snapshot 전부가 바뀐다.
- rate contract 버전 불변성과 과거 snapshot 재현성이 깨질 수 있다.
- `last_calculation_request_sequence`의 늦은 응답 무시 계약을 빼면 빠른 연속 입력에서 오래된 결과가 최신값을 덮는다.
- DRAFT만 계산 가능, 확정·확정취소·재계산 필요 상태 전이가 영향을 받는다.
- 그룹웨어 지출결의 참조 첨부·역조회, approval claim, 문서번호 채번과 권한 `accounting.sales-commission-settlement`을 회귀시킬 수 있다.
- 현재 데이터 0건이라 production 실데이터 회귀 검증은 불가능하고, 테스트/격리 시나리오가 권위가 된다.

### 선택지

1. **이미 구현 완료로 처리한다**: PR #1248을 A-4 해소 근거로 삼고 새 코드는 만들지 않는다. 첫 실정산 발생 때 운영 QA만 한다.
2. **대표 입력 검증만 추가한다**: 레거시와 현행에 같은 입력을 넣어 3%·8%·3.3%·8%와 VAT 결과를 대조하되 계산식은 바꾸지 않는다.
3. **하지 않는다**: 현재 DB 0건이고 경로도 이미 있으므로 별도 작업을 열지 않는다. 다만 #1238의 “경로 없음” 문구는 오래된 사실로 정정해야 한다.

**PM 권장:** 선택지 1. 기능·경로가 PR #1248에 이미 있고 실데이터는 0건이므로 구현 트랙을 또 만들 근거가 없다. 선택지 2는 첫 운영 사용 전 검증 게이트로만 붙이는 것이 안전하다.

---

## 최종 선택표

개발책임자가 번호만 고르면 된다.

| 건 | ① | ② | ③/④ | PM 권장 |
|---|---|---|---|---|
| A-1 | #1245로 1회 전체 적재 후 DB 정본 | Notion 반복 sync | ③ 현상 유지 | **①** |
| A-2 | 레거시대로 탭 역전 | 현행 유지+명확한 이름 변경 | ③ 현행 정의 공식화 후 무변경 | **①** |
| A-3 | 7,000원 | 8,000원 유지 | ③ DB 가격화 / ④ 보류 | **②** |
| A-4 | 기구현 완료 처리 | 대표 입력 검증만 추가 | ③ 별도 작업 없음 | **①** |

## 프로세스·컨테이너 회수

- 이번 정찰에서 새로 기동한 장기 프로세스: 0개.
- 이번 정찰에서 새로 기동한 컨테이너: 0개.
- 공유 `samhan-*` 스택: 24개를 중지·재시작·교체하지 않았다.
- 조사 시작 시 실행 컨테이너는 공유 24개 + 타 정찰 PostgreSQL 3개 = 27개였으며, 타 정찰 컨테이너도 건드리지 않았다.
- 게시 후 최종 재측정: 실행 컨테이너 25개, 공유 `samhan-*` 24개, 비공유 1개(`codex1264-live-pg`). 정찰 소유 컨테이너 잔여 0개. 시작 때 있던 비공유 컨테이너 중 2개는 다른 정찰이 회수했으며 본 정찰은 건드리지 않았다.
- 같은 시점 OS 전체 프로세스는 681개다. 이번 정찰이 기동한 장기 프로세스가 없으므로 정찰 소유 잔여 프로세스는 **0개**다.

## 최종 `git status --porcelain` 원문

```text
?? .claude/docs/
?? .scratch/
?? clients/desktop/playwright.order-approval-real-qa.config.ts
?? clients/desktop/playwright/2026-08-17-1233-origin-real-qa/
?? clients/desktop/playwright/2026-08-17-category-settings-migration-recon-real-qa/
?? clients/desktop/playwright/2026-08-17-daily-closing-parity-recon-real-qa/
?? clients/desktop/playwright/2026-08-17-option-price-impact-real-qa/
?? clients/desktop/playwright/2026-08-17-price-variant-option-recon-real-qa/
?? clients/desktop/playwright/2026-08-17-qty-sync-recon-real-qa/
?? clients/desktop/playwright/2026-08-17-three-pr-real-qa/
?? clients/desktop/playwright/order-approval-real-qa/
?? docs/dev-reports/2026-08-17-1233-daily-closing-origin/
?? docs/dev-reports/2026-08-17-1238-money-axis-recon/
?? docs/dev-reports/2026-08-17-category-settings-data-migration/
?? docs/dev-reports/2026-08-17-category-settings-migration-recon/
?? docs/dev-reports/2026-08-17-daily-closing-parity-recon/
?? docs/dev-reports/2026-08-17-devlead-decisions/
?? docs/dev-reports/2026-08-17-dps-inbound-compare-recon/
?? docs/dev-reports/2026-08-17-duplication-audit/
?? docs/dev-reports/2026-08-17-legacy-sheets-snapshot/
?? docs/dev-reports/2026-08-17-option-list-recon/
?? docs/dev-reports/2026-08-17-option-price-impact/
?? docs/dev-reports/2026-08-17-partner-importer-recon/
?? docs/dev-reports/2026-08-17-price-variant-option-recon/
?? docs/dev-reports/2026-08-17-qty-sync-6-series/
?? docs/dev-reports/2026-08-17-qty-sync-recon/
?? docs/dev-reports/2026-08-17-shared-stack-401/
?? docs/dev-reports/2026-08-17-uuid-exposure-recon/
?? docs/dev-reports/2026-08-17-web-to-slip-fidelity/
?? docs/dev-reports/2026-08-17-web-to-slip-recon/
?? docs/dev-reports/2026-08-18-1238-behavior-axis-recon/
?? docs/qa/2026-08-15-order-approval-real-qa/
?? docs/qa/2026-08-17-category-settings-migration-recon-real-qa/
?? docs/qa/2026-08-17-option-price-impact-real-qa/
?? docs/qa/2026-08-17-p1-02-real-qa/
?? docs/qa/2026-08-17-p1-03-real-qa/
?? docs/qa/2026-08-17-price-variant-option-recon-real-qa/
?? docs/qa/2026-08-17-qty-sync-recon-real-qa/
```
