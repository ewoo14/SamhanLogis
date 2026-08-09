# PR #1133 / Issue #1095 SOL 5.6 1차 적대검증

- 검증 일시: 2026-08-09 (KST)
- 검증 대상: `feat/1095-sheet-product-status` / `acc7a485d259c08527dc4622198df5ff379b8ab6`
- 질문: 실 사용자 경로로 재현 가능한 결함이 있는가

## 1. 환경 확인

### 1.1 워크트리와 배포물

| 항목 | 확인값 |
|---|---|
| 워크트리 | `C:\dev\Samhan-Public\.claude\worktrees\t1095` |
| 브랜치 | `feat/1095-sheet-product-status` |
| HEAD | `acc7a485d259c08527dc4622198df5ff379b8ab6` |
| 견적 웹 strict port | `5195` (`:::5195`, LISTEN) |
| 검증용 product-service | `t1095-product-acc7`, `127.0.0.1:28084 -> 8084`, health `UP` |
| 실행 이미지 | `t1095-product:acc7a485d` |
| 로컬/실행 JAR SHA-256 | 양쪽 모두 `AEF70933F8B5922BD6FD935136117C886ED3A9BA828B6995B9E860C49A5E9F78` |
| Flyway | 공유 DB `flyway_schema_history`의 V34 성공 적용 확인 |

최초 확인 때 공유 canonical `samhan-product-service`의 클래스 해시가 로컬 빌드와 달랐고 V34도 없었다. 허용 범위대로 product-service만 재빌드·재배포했다. 이후 다른 트랙이 canonical 컨테이너를 V33까지만 든 JAR로 다시 교체한 사실을 로그로 확인했다. 이 경합을 PR 결함으로 세지 않고, 같은 공유 DB를 사용하되 Eureka 등록을 끈 위 격리 product-service로 검증을 마쳤다. 다른 서비스는 재배포하거나 변경하지 않았다.

### 1.2 실제 호출 경로

Playwright의 설치된 Chromium을 직접 headless 기동했다. 캡처 경로는 `QA_SHOTS_DIR=docs/qa/2026-08-09-1095-sol`을 지정하고 저장 전에 `resolveQaShotsDir()`로 해석했다.

브라우저에서 확인한 호출은 다음과 같다.

```text
GET  http://127.0.0.1:5195/                         200
POST http://127.0.0.1:5195/rpc/getGateImages       200
POST http://127.0.0.1:5195/rpc/getCustomerDataAsync 200
POST http://127.0.0.1:5195/rpc/getAllManagers      200
POST http://127.0.0.1:5195/rpc/checkUserAuth       200
POST http://127.0.0.1:5195/rpc/logFrontEvent       200
```

견적 웹이 실제로 조회한 product API는 다음 네 호출이며 모두 HTTP 200이었다.

```text
GET http://127.0.0.1:28084/products/internal/estimate-catalog/products?category=HOME_MULTI&scope=ESTIMATE
GET http://127.0.0.1:28084/products/internal/estimate-catalog/products?category=SINGLE_SET&scope=ESTIMATE
GET http://127.0.0.1:28084/products/internal/estimate-catalog/products?category=COMMERCIAL_MULTI&scope=ESTIMATE
GET http://127.0.0.1:28084/products/internal/estimate-catalog/products?category=LEGACY&scope=ESTIMATE
```

라이브 전용 Playwright 스펙 파일은 추가하지 않았다. 따라서 mock hard gate 제외 목록이나 `resolveQaCredential` skip 규약을 변경할 대상도 없다.

## 2. 판정

**차단 결함 1건이 실 사용자 경로에서 재현된다.**

`DISCONTINUED` 89건과 `NOT_FOR_SALE` 14건, 합계 **103건이 견적 후보에서 숨겨지지 않고 수량 입력까지 가능하다.** 개발책임자 지시인 “단종·미판매는 미표시”의 반대 동작이며 견적 금액에 직접 닿는다.

반대급부는 통과했다. `ACTIVE` 후보 751건 가운데 상태 처리 때문에 차단된 건수는 **0건**이었다. `OUT_OF_STOCK` 3건은 표시되면서 수량 입력이 잠기고 `품절` 텍스트가 나왔다.

## 3. 각도 1 — 반대급부: 정상 품목이 차단되는가

### 3.1 실 데이터 전수 카운트

SQL 원문:

```sql
SELECT p.status, e.estimate_category, COUNT(*) AS count
FROM products p
JOIN product_estimate_exposure e
  ON e.product_id = p.id
 AND e.is_deleted = false
WHERE p.is_deleted = false
  AND p.usage_scope IN ('ESTIMATE', 'BOTH')
GROUP BY p.status, e.estimate_category
ORDER BY p.status, e.estimate_category;
```

원문 결과:

```text
ACTIVE|COMMERCIAL_MULTI|382
ACTIVE|HOME_MULTI|107
ACTIVE|LEGACY|39
ACTIVE|SINGLE_SET|223
DISCONTINUED|COMMERCIAL_MULTI|24
DISCONTINUED|HOME_MULTI|14
DISCONTINUED|LEGACY|1
DISCONTINUED|SINGLE_SET|50
NOT_FOR_SALE|COMMERCIAL_MULTI|2
NOT_FOR_SALE|SINGLE_SET|12
OUT_OF_STOCK|SINGLE_SET|3
```

후보 총 857건 중 `ACTIVE`는 751건이다. API 응답과 렌더러를 전수 대조한 결과 751건 모두 후보로 전달되고 수량 입력을 생성했다. 상태 때문에 막힌 정상 품목은 **0건**이다.

### 3.2 실 GUI

정상 표본 `AC060CS6PBH1SY`에서 수량 `2` 입력 후 소계 `3,320,000` 반영을 확인했다.

- 진입 및 후보 발견: `docs/qa/2026-08-09-1095-sol/00-entry-discovery.png`
- 정상 수량 입력: `docs/qa/2026-08-09-1095-sol/01-active-quantity-input.png`

판정: **통과 — ACTIVE 실 데이터 751건 중 상태 차단 0건.**

## 4. 각도 2 — 단종·미판매·품절 지시 동작

### 4.1 상태별 발화 조건 카운트

| 상태 | 후보 건수 | 기대 | 실제 |
|---|---:|---|---|
| `DISCONTINUED` | 89 | 미표시 | 89건 모두 표시되고 수량 입력 생성 |
| `NOT_FOR_SALE` | 14 | 미표시 | 14건 모두 표시되고 수량 입력 생성 |
| `OUT_OF_STOCK` | 3 | 표시, 수량 입력 잠금, `품절` 표시 | 3건 모두 기대대로 처리 |

표본 0 상태는 없다.

### 4.2 실 GUI 재현

- `DISCONTINUED` 표본 `AC072BSCPBH2SY`: 화면 검색 결과 1행, 수량 입력 1개. `docs/qa/2026-08-09-1095-sol/02-discontinued-visible-defect.png`
- `NOT_FOR_SALE` 표본 `AF60F17D11LS`: 화면 검색 결과 1행, 수량 입력 1개. `docs/qa/2026-08-09-1095-sol/03-not-for-sale-visible-defect.png`
- `OUT_OF_STOCK` 표본 `AR60F09C13WS`: 화면 검색 결과 1행, `품절` 표시, 사용자 수량 입력 0개. `docs/qa/2026-08-09-1095-sol/04-out-of-stock-locked.png`

판정: **실패 — 단종 89건 + 미판매 14건 = 103건이 숨겨지지 않는다. 품절 3건은 통과.**

## 5. 각도 3 — 시트 동기화가 기존 상태를 덮는가

### 5.1 실제 시트 원문 분포와 표기 흔들림

Google Sheets API로 실제 시트의 상태 대상 열을 읽었다.

```text
홈멀티_단가인상!H (헤더 3행 비고): 단종 14
싱글 세트_단가인상!J (헤더 3행 비고): 단종 50, 미판매 12, 품절 3
상업멀티_단가인상!I (헤더 3행 비고): 단종 24, 미판매 2
싱글 구성품 / 상업멀티 구성 / 구형: 상태 표기 0
```

셀 기준 합계는 단종 88, 미판매 14, 품절 3이다. 모델 중복을 합친 동기화 대상 품목 기준으로는 단종 83, 미판매 14, 품절 3이다.

상태 대상 열에서 `단종`, `미판매`, `품절`을 포함하면서 앞뒤 공백·괄호·유사어가 붙은 값은 **0건**이었다. 실제 원문은 세 정확한 표기뿐이다. 상태가 아닌 실제 비고 원문에는 `3실형`, `wifi 내장`, ` 금액 선택(수량 자동)`, `컴팩트`, `조달전용` 등이 있었다. 파서는 trim 후 정확 일치만 상태로 해석하므로 이 값들은 상태 변경을 발화하지 않는다.

### 5.2 동기화 전후 SQL

SQL 원문:

```sql
SELECT status, is_deleted, COUNT(*) AS count
FROM products
GROUP BY status, is_deleted
ORDER BY status, is_deleted;
```

첫 실 동기화 전:

```text
ACTIVE|false|3083
ACTIVE|true|134
DISCONTINUED|true|4
```

첫 실 동기화는 HTTP 200, 11/11 탭 성공, `inserted=2`, `updated=2213`, `softDeleted=1`, `durationMs=55256`이었다. 이후:

```text
ACTIVE|false|2984
ACTIVE|true|135
DISCONTINUED|false|83
DISCONTINUED|true|4
NOT_FOR_SALE|false|14
OUT_OF_STOCK|false|3
```

`ACTIVE false`의 -99는 상태 전환 -100, 신규 +2, soft delete -1로 일치한다. 다시 같은 실제 시트를 동기화한 결과도 다음처럼 멱등이었다.

```text
HTTP 200
successfulTabs=11
failedTabs=0
inserted=0
softDeleted=0
durationMs=51324
before=after=true

ACTIVE|false|2984
ACTIVE|true|135
DISCONTINUED|false|83
DISCONTINUED|true|4
NOT_FOR_SALE|false|14
OUT_OF_STOCK|false|3
```

비고와 상태 문자열의 분리를 확인한 SQL 원문:

```sql
SELECT status,
       COUNT(*) FILTER (WHERE COALESCE(BTRIM(remark), '') <> '') AS nonblank_remark,
       COUNT(*) FILTER (WHERE remark ~ '(단종|미판매|품절)') AS status_word_in_remark,
       COUNT(*) AS total
FROM products
WHERE is_deleted = false
GROUP BY status
ORDER BY status;
```

각 상태 그룹에서 `nonblank_remark=0`, `status_word_in_remark=0`이었다. 공란 또는 상태로 해석되지 않는 비고가 기존 상태를 다시 `ACTIVE`로 덮는 현상은 반복 동기화 전후 SQL에서 없었다.

판정: **통과 — 실제 시트 반복 동기화 전후 상태별 건수 동일.**

## 6. 각도 4 — 기존 견적·주문 영향

상태 품목 100개(`DISCONTINUED` 83 + `NOT_FOR_SALE` 14 + `OUT_OF_STOCK` 3)를 product DB에서 읽고, 그 ID/모델 코드를 읽기 전용 CTE로 각 문서 DB에 대조했다. DB INSERT/UPDATE는 하지 않았다.

원본 품목 SQL:

```sql
SELECT id, model_code, status
FROM products
WHERE is_deleted = false
  AND status IN ('DISCONTINUED', 'NOT_FOR_SALE', 'OUT_OF_STOCK')
ORDER BY status, model_code;
```

각 문서 대조 SQL 형식:

```sql
WITH affected(product_id, model_code, status) AS (
  VALUES /* 위 SELECT가 반환한 100개 행 */
)
SELECT COUNT(*) AS line_count,
       COUNT(DISTINCT document_id) AS document_count,
       COALESCE(SUM(line_amount), 0) AS amount
FROM <estimate_lines | slip_lines | partner_order_lines> l
JOIN affected a ON a.product_id = l.product_id
WHERE l.is_deleted = false;
```

원문 결과:

```text
estimate_lines:      line_count=0, document_count=0, amount=0
slip_lines:          line_count=0, document_count=0, amount=0
partner_order_lines: line_count=0, document_count=0, amount=0
```

저장 견적 snapshot은 JSON 전체 문자열 검색을 쓰면 할인표(`homeDc`, `commDc`) 안의 모델 코드 때문에 4건이 거짓 양성으로 잡혔다. 실제 선택 수량 배열만 펼쳐 다시 셌다.

SQL 원문:

```sql
SELECT q.saved_at,
       q.cust_name,
       k.key,
       e.elem->>0 AS item_key,
       (e.elem->>1)::numeric AS qty,
       q.total_amount
FROM quote_snapshots q
CROSS JOIN LATERAL (
  VALUES ('homeQty'), ('singleQty'), ('commQty'), ('oldQty')
) k(key)
CROSS JOIN LATERAL jsonb_array_elements(q.snapshot_state->'core'->k.key) e(elem)
WHERE q.is_deleted = false
  AND (e.elem->>1)::numeric > 0
ORDER BY q.saved_at, k.key, item_key;
```

양수 수량 17개를 원문 모델과 대조했으며 상태 품목 선택은 0개였다. 금액 `3,222,230`인 snapshot의 실제 선택 품목도 `ACTIVE`인 `AJ060MXHNBC1` 수량 2였고, 나머지는 운임/절삭 같은 특수 항목이었다.

따라서 단종·미판매·품절 품목이 실제 선택된 기존 견적·주문 표본은 다시 세어도 **0건**이다. GUI로 열어 금액 불변을 판정할 실 표본이 없으므로 이 각도는 **판정 불가**다.

## 7. 결함의 코드 경로

DB catalog 변환은 상태를 note로 바꾸지만 행을 제거하지 않는다.

```text
clients/web/estimate-app/lib/db-catalog.js:88,120,135
  note/remarks: r.remark || statusNote(r.status)
```

기존 시트 경로는 `clients/web/estimate-app/lib/code.js:796,876,1069`에서 `isBlockedByNote_(note)`면 `continue`한다. 반면 DB catalog 경로는 전체 행을 `.map()`으로 반환한다. 화면 렌더러는 `clients/web/estimate-app/views/index.ejs:3148`의 `getStockState_()`와 각 렌더 구간에서 품절만 분기하고, 그 외에는 수량 input을 만든다(예: `5877-5900`, `6363-6379`, `6891-6911`).

즉, 상태→note 변환만으로 품절 잠금은 작동하지만 단종·미판매 제거는 작동하지 않는다. GUI 재현 및 89/14건 전수 결과와 일치한다.

## 8. 증거 무결성 메모

- 공유 DB의 `QA-`, `S18`, `QA797` 잔재는 이 PR 결함으로 세지 않았다.
- DB에 표본을 만들기 위한 INSERT/UPDATE를 하지 않았다. 실제 시트 동기화와 기존 실 데이터만 사용했다.
- canonical product-service가 타 트랙에 의해 교체된 뒤 발생한 동기화 HTTP 500은 이 PR 결함으로 세지 않았다. 검증 대상 JAR 해시가 일치하는 격리 product-service에서 반복했고 HTTP 200과 멱등 결과를 얻었다.
- snapshot 전체 JSON 문자열 검색에서 발견한 4건은 카탈로그 할인표의 모델 코드로 인한 거짓 양성이므로, 선택 수량 배열 전개 결과로 정정했다.

## 9. 신규 생성 파일

```text
docs/dev-reports/2026-08-09-1095-r1-sol-adversarial.md
docs/qa/2026-08-09-1095-sol/00-entry-discovery.png
docs/qa/2026-08-09-1095-sol/01-active-quantity-input.png
docs/qa/2026-08-09-1095-sol/02-discontinued-visible-defect.png
docs/qa/2026-08-09-1095-sol/03-not-for-sale-visible-defect.png
docs/qa/2026-08-09-1095-sol/04-out-of-stock-locked.png
```

커밋과 push는 수행하지 않았다.
