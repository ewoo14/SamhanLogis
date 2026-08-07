# #1092 S7 진단 라운드 — 주문서 작성일 표본 0건

## 결론

**C — 화면이 엉뚱한 컬럼만 읽고 있었다.**

`partner_orders`에는 작성일로 사용할 수 있는 필수 audit 컬럼 `created_at`이 있고 실 데이터 2,025건 전부 채워져 있다. 목록 조회의 서버 필터·정렬도 `COALESCE(confirmed_at, created_at)`를 사용한다. 그러나 목록 DTO가 `confirmed_at`만 `submittedAt`으로 내려 DRAFT 주문 1,995건의 화면 작성일이 빈칸이 됐다.

따라서 A(작성일 개념 없음)나 B(작성일 컬럼의 실 데이터 공란)가 아니다. `confirmed_at`이 null인 DRAFT의 작성일은 `created_at` fallback이 정답이다.

## 1. `partner_orders` 날짜·시각 컬럼과 채움률

DB: `partner_order_db`, 실행은 SELECT만 사용했다.

| 컬럼 | 타입 | 전체 | NULL 아님 | 채움률 | 의미/관찰 |
|---|---|---:|---:|---:|---|
| `confirmed_at` | timestamp | 2,025 | 30 | 1.48% | 확인 시각; DRAFT는 null |
| `slip_published_at` | timestamp | 2,025 | 15 | 0.74% | 전표 발행 시각 |
| `created_at` | timestamp | 2,025 | 2,025 | 100.00% | 필수 생성 시각; 작성일 fallback |
| `modified_at` | timestamp | 2,025 | 2,025 | 100.00% | 마지막 수정 시각 |
| `deleted_at` | timestamp | 2,025 | 4 | 0.20% | soft-delete 시각 |
| `due_date` | date | 2,025 | 1 | 0.05% | 납기일; 작성일이 아님 |

스키마에는 별도의 `written_at`, `order_date`, `submitted_at` 컬럼이 없다. `created_at`은 `NOT NULL`이다.

## 2. 현재 코드와 API 응답 필드

- `clients/desktop/src/renderer/routes/estimateUnifiedListModel.ts`는 주문 행의 `writtenAt`을 `row.submittedAt`에서 가져온다.
- `clients/desktop/src/renderer/api/sales.ts`의 `PartnerOrderSummary` 계약 필드도 `submittedAt`이다.
- `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/PartnerOrderSummaryResponse.java`의 기존 `from()`은 `order.getConfirmedAt()`만 `submittedAt`으로 반환했다.
- `PartnerOrderQueryService`의 목록 기간·정렬은 이미 `COALESCE(confirmedAt, createdAt)`이다.

즉, 서버 조회·정렬과 API 표시 값이 서로 달랐다. DRAFT 주문은 서버에서는 `created_at`으로 조회·정렬되지만 API에서는 null이 되어 화면 표본 0건이 됐다.

## 3. 실제 원문 2건과 종합견적서 원문 2건

### 주문서 원문 — `partner_order_db.partner_orders`

```json
{"id":"373aa583-6454-49d1-b5cf-060c7d9a9160","partner_code":"1068689215","biz_code":"1068689215","order_no":"2026/08/07-1","slip_no":null,"status":"DRAFT","slip_publish_status":"NOT_REQUIRED","total_amount":1576036.00,"confirmed_at":null,"slip_published_at":null,"idempotency_key":"PO-CONF-1068689215-2","created_at":"2026-08-07T19:35:02.280728","created_by":"d7ac77d4-db1e-45d1-a0bf-e3345cab4f26","modified_at":"2026-08-08T00:16:04.648486","modified_by":"a0000000-0000-0000-0000-000000000001","deleted_at":null,"deleted_by":null,"is_deleted":false,"revision_count":33,"due_date":null,"memo":"S6-직접저장-1786115763971","lock_version":87,"source_estimate_id":null,"deleted_by_name":null,"partner_id":"9592e23e-ed3a-4868-be40-2549030f688d","delivery_address":null}
```

```json
{"id":"5d78eaa1-226c-49ea-a2ac-1b52bccef571","partner_code":"1068689215","biz_code":"1068689215","order_no":"2026/07/30-1","slip_no":null,"status":"DRAFT","slip_publish_status":"NOT_REQUIRED","total_amount":104665.00,"confirmed_at":null,"slip_published_at":null,"idempotency_key":"PO-CONF-1068689215-1","created_at":"2026-07-30T01:12:23.867626","created_by":"d7ac77d4-db1e-45d1-a0bf-e3345cab4f26","modified_at":"2026-07-30T01:12:23.867626","modified_by":"d7ac77d4-db1e-45d1-a0bf-e3345cab4f26","deleted_at":null,"deleted_by":null,"is_deleted":false,"revision_count":0,"due_date":null,"memo":null,"lock_version":0,"source_estimate_id":null,"deleted_by_name":null,"partner_id":"9592e23e-ed3a-4868-be40-2549030f688d","delivery_address":null}
```

### 종합견적서 원문 — `slip_db.estimates`

```json
{"id":"8bea95ed-0976-4d56-9d57-4f9a97879673","estimate_no":"2026/08/07-9","estimate_date":"2026-08-07","seq_no":9,"status":"QUOTE_DRAFT","partner_id":null,"partner_name":"정연재","partner_business_no":"010-4553-6280","partner_address":null,"valid_until":null,"total_supply":0.00,"total_vat":0.00,"total_amount":0.00,"converted_slip_id":null,"sent_at":null,"accepted_at":null,"rejected_at":null,"converted_at":null,"memo":"LOADTEST-1-4","requester_id":"a0000000-0000-0000-0000-000000000004","version":0,"created_at":"2026-08-07T18:34:12.612727","created_by":"a0000000-0000-0000-0000-000000000004","modified_at":"2026-08-07T18:34:12.612727","modified_by":"a0000000-0000-0000-0000-000000000004","deleted_at":null,"deleted_by":null,"is_deleted":false,"deleted_by_name":null}
```

```json
{"id":"0d0eb00c-7f81-466d-8db7-a352a41384b9","estimate_no":"2026/08/07-8","estimate_date":"2026-08-07","seq_no":8,"status":"QUOTE_DRAFT","partner_id":null,"partner_name":"신정호","partner_business_no":"010-3849-4725","partner_address":null,"valid_until":null,"total_supply":0.00,"total_vat":0.00,"total_amount":0.00,"converted_slip_id":null,"sent_at":null,"accepted_at":null,"rejected_at":null,"converted_at":null,"memo":"LOADTEST-2-2","requester_id":"a0000000-0000-0000-0000-000000000004","version":0,"created_at":"2026-08-07T18:34:08.477612","created_by":"a0000000-0000-0000-0000-000000000004","modified_at":"2026-08-07T18:34:08.477612","modified_by":"a0000000-0000-0000-0000-000000000004","deleted_at":null,"deleted_by":null,"is_deleted":false,"deleted_by_name":null}
```

| 원문 | 화면 목록의 작성일에 써야 할 값 | 수정 전 화면 값 |
|---|---|---|
| 주문 `2026/08/07-1` | `created_at = 2026-08-07T19:35:02.280728` | 빈칸 (`confirmed_at = null`) |
| 주문 `2026/07/30-1` | `created_at = 2026-07-30T01:12:23.867626` | 빈칸 (`confirmed_at = null`) |
| 견적 `2026/08/07-9` | `estimate_date = 2026-08-07` | 표시됨 |
| 견적 `2026/08/07-8` | `estimate_date = 2026-08-07` | 표시됨 |

## 4. 적용한 수정

`PartnerOrderSummaryResponse.from()`의 `submittedAt`을 `confirmedAt != null ? confirmedAt : createdAt`으로 변경했다. 이는 서버의 목록 필터·정렬 규칙과 동일하며 UUID를 화면에 추가 노출하지 않는다. 해당 fallback을 검증하는 `PartnerOrderResponseTest` 회귀 테스트도 추가했다.

## 5. 검증

- `:services:partner-order-service:test` — **BUILD SUCCESSFUL**
- `clients/desktop`: `npm test -- --run` 전체 Vitest — **exit 0**, 전체 통과
- `clients/desktop`: `estimateUnifiedListModel.test.ts` — **2/2 통과**
- `git diff --check` — 통과
- 제품 코드/테스트 변경 `git diff --stat`: **28 insertions, 1 deletion** (삭제 줄 1)
- DB 변경: 없음. SELECT만 실행.
- 공유 Docker 스택: 재기동하지 않음.
- 커밋·push: 하지 않음.

## 6. 신규 파일 목록

- `docs/dev-reports/2026-08-08-1092-s7-order-written-date-diagnosis.md`

변경 파일(신규 아님):

- `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/PartnerOrderSummaryResponse.java`
- `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/web/dto/PartnerOrderResponseTest.java`
