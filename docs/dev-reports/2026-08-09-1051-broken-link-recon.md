# #1051 전표↔품목 끊긴 연결 재정찰

> 범위: 정찰만. 코드/DB/Docker 변경 없음. 모든 DB 쿼리는 `BEGIN TRANSACTION READ ONLY`로 실행했다.  
> 주 측정 시각: **2026-08-09 01:36:14.839152 KST**. HTTP 재현: **01:38:11 KST**. 공유 DB이므로 숫자는 이 시각의 스냅샷이다.  
> UUID는 집합 비교에만 사용했고 아래 원문에서는 `[UUID 비공개]`로 치환했다.

## 요약 표

판정 단위는 **라인 행**이며 괄호 안은 서로 다른 문서 수다. “사용자 노출 범위”는 헤더와 라인이 모두 `is_deleted=false`인 행이다.

| 갈래 | 사용자 노출 범위 | DB 보존 전체 | 측정 시각 | 판정 근거 |
|---|---:|---:|---|---|
| 실 데이터 | 전표 0 / 견적 0 | 전표 0 / 견적 0 | 01:36:14 KST | 끊긴 전건이 아래 QA/시드 provenance로 소진됨 |
| QA 잔재 | 전표 **636행(289전표)** / 견적 **51행(25견적)** | 전표 **3,278행(2,462전표)** / 견적 **2,057행(2,018견적)** | 01:36:14 KST | `QA797`, `[Stage 2 시드]`, Playwright 고정 source, `issue-1096-test-seed-cleanup` |
| 판정 불가 | 전표 0 / 견적 0 | 전표 0 / 견적 0 | 01:36:14 KST | 위 provenance에 포함되지 않은 끊긴 행 0 |

핵심 결론은 두 가지다.

1. 기존 보고서의 **`549 전표 + 63 견적`은 재현된다.** 정확히는 QA797 품목 3 UUID를 참조하는 **전표 라인 549행(현재 202전표) + 견적 라인 63행(32견적)**이다. 과거 보고서의 전표 문서 수 208은 현재 202로 움직였지만 라인 수 549/63은 같다.
2. 2026-08-08 이후 `issue-1096-test-seed-cleanup`이 시드 품목을 soft-delete하여 전체 끊김은 전표 3,278행·견적 2,057행으로 커졌다. 이것은 신규 업무 손실이 아니라, 정리된 테스트 시드 문서까지 “활성 품목 없음” 조건에 들어온 결과다.

QA797 최근단가도 **활성 8행**으로 재현됐다. 최솟값 77,000원, 최댓값 **9,999,999,999,999원**이며 최대행 `created_by=qa-r9-estimate-bait`, `source=LINE_SAVE`다.

## 1. 정확한 모집단과 조인 키

### 1.1 키 채움률을 먼저 확인했다

| 테이블/범위 | 전체 | `product_id` | `model_name` | `product_name` |
|---|---:|---:|---:|---:|
| `slip_lines` 전체 | 3,586 | 3,586 (100%) | 3,586 (100%) | 3,586 (100%) |
| 사용자 노출 `slip_lines` | 906 | 906 (100%) | 906 (100%) | 906 (100%) |
| `estimate_lines` 전체 | 2,095 | 2,095 (100%) | 2,095 (100%) | 2,095 (100%) |
| 사용자 노출 `estimate_lines` | 89 | 89 (100%) | 89 (100%) | 89 (100%) |

라인 테이블에는 `product_code`와 `model_code` 컬럼이 **없다**. 반면 `product_db.products`는 다음과 같다.

| product 범위 | 행 | `model_code` | `product_code` | `model_name` | `name` |
|---|---:|---:|---:|---:|---:|
| 활성 | 3,083 | 3,083 (100%) | 2,696 (87.45%) | 3,083 (100%) | 3,083 (100%) |
| 삭제 | 138 | 38 (27.54%) | 100 (72.46%) | 138 (100%) | 138 (100%) |

따라서 persisted 참조축은 100% 채워진 **라인 `product_id` UUID ↔ `products.id` UUID**로 정했다. `model_name`은 화면용 snapshot이고 FK가 아니며, 현재 끊긴 5,335행 중 활성 product의 동일 `model_name` 후보는 **0행**이다. 모델명 fallback으로 자동 복구할 근거도 없다.

양쪽 표본도 눈으로 확인했다.

- 라인: `2026/01/01-1`, `TEST-MODEL-0001`, `created_by=system`, product 행 0.
- 라인/삭제 product: `2026/07/15-11`, `QA797-PART-01`, line creator `[DEV-SEED] 개발매니저`, product `created_by=qa798`, `deleted_by=system-sheet-sync`.
- product 정상 표본: 활성 행은 `model_code/model_name/name`이 채워졌지만 `product_code`는 일부 비어 있었다.

### 1.2 전수 계수 방법

서비스별 DB라 단일 cross-database SQL JOIN은 불가능하다. DB write나 임시 테이블을 쓰지 않기 위해 각 DB를 read-only SQL로 전수 추출하고, PowerShell 메모리 hash set으로 동등 조인했다.

```sql
-- slip_db
BEGIN TRANSACTION READ ONLY;
SELECT s.slip_no, s.is_deleted AS header_deleted,
       l.product_id, l.model_name, l.product_name,
       l.is_deleted AS line_deleted, l.created_at, l.created_by
FROM slip_lines l JOIN slips s ON s.id=l.slip_id;

SELECT e.estimate_no, e.is_deleted AS header_deleted,
       l.product_id, l.model_name, l.product_name,
       l.is_deleted AS line_deleted, l.created_at, l.created_by
FROM estimate_lines l JOIN estimates e ON e.id=l.estimate_id;
COMMIT;

-- product_db
BEGIN TRANSACTION READ ONLY;
SELECT id, is_deleted, model_code, model_name, product_code, name,
       created_at, created_by, deleted_at, deleted_by
FROM products;
COMMIT;
```

메모리 분류식은 다음과 같다.

```text
ABSENT       = line.product_id ∉ 모든 products.id
SOFT_DELETED = line.product_id ∈ products.id AND products.is_deleted=true
ACTIVE       = line.product_id ∈ products.id AND products.is_deleted=false
BROKEN       = ABSENT ∪ SOFT_DELETED
```

전수 결과:

| 테이블 | 전체 라인 | ACTIVE | ABSENT | SOFT_DELETED | BROKEN |
|---|---:|---:|---:|---:|---:|
| `slip_lines` | 3,586 | 308 | **303** | **2,975** | **3,278** |
| `estimate_lines` | 2,095 | 38 | 0 | **2,057** | **2,057** |

사용자 노출 범위만 보면 전표 906행 중 636행, 견적 89행 중 51행이 끊겨 있다.

## 2. 세 갈래 분류와 대표 사례

### 2.1 실 데이터 — 0행

대표 사례 없음. 현재 끊긴 전건이 QA/시드 provenance로 설명된다. 업무 의미를 추론해 일부를 실 데이터로 승격하지 않았다.

### 2.2 QA 잔재 — 전체 5,335행, 사용자 노출 687행

| 전표/견적번호 | 품목코드 역할의 snapshot | 생성시각 | 생성자 | 결정 근거 |
|---|---|---|---|---|
| `2026/01/01-1` | `TEST-MODEL-0001` | 2026-05-09 16:59:33.210336 | `system` | 응답 memo `[Stage 2 시드]`, `SlipSeeder` 결정적 100전표/300라인 |
| `2026/05/30-1` | `AR07TXEAAWKNEU-03` / `Product A` | 2026-05-30 13:37:02.475652 | `system-internal` | 고정 source 주문이 `phase-2-6a-order-convert` Playwright 스펙/캡처 스크립트에 직접 등장 |
| `2026/07/22-6` | `QA797-PART-01` | 2026-07-22 22:57:48.181957 | `[DEV-SEED] 개발영업` | 이름에 `QA797`, 단가/합계 9,000,000,000,000원, 삭제 라인/헤더 |

QA 근거별 전수 분해:

| 근거 | 전표 라인 | 견적 라인 | 서로 다른 참조 품목 | 상태 |
|---|---:|---:|---:|---|
| `TEST-MODEL-*` Stage 2 시드 | 300 | 0 | 100 | product 행 자체 없음 |
| Playwright 주문전환 `Product A` | 3 | 0 | 1 | product 행 자체 없음 |
| `QA797-*`, product `created_by=qa798` | 549 | 63 | 3 | product soft-delete |
| `issue-1096-test-seed-cleanup` 대상 | 2,426 | 1,994 | 합집합 33 | product soft-delete |
| 합계 | **3,278** | **2,057** | — | 분류 누락 0 |

QA797 549/63의 현재 세부는 다음과 같다.

| | 라인 | 문서 | 사용자 노출 라인 |
|---|---:|---:|---:|
| 전표 | 549 | 202 | 333 |
| 견적 | 63 | 32 | 51 |

### 2.3 판정 불가 — 0행

대표 사례 없음. 단, 이 판정은 “공유 개발 DB에서 생성 provenance를 추적할 수 있었음”에 한정한다. 같은 이름/금액만 보고 업무 여부를 판단한 것이 아니다.

## 3. 증상과 원인 분리

| 원인 | 전표 라인 | 견적 라인 | 설명 |
|---|---:|---:|---|
| 품목 master가 명시적으로 soft-delete됨 | 2,975 | 2,057 | QA797 3품목은 `system-sheet-sync`, 시드 품목은 `issue-1096-test-seed-cleanup` |
| 시드 세대/UUID 생성 규칙 불일치 | 300 | 0 | `SlipSeeder`가 `TEST-MODEL-*` UUID를 자체 합성했으나 현 product 계보에는 해당 행 없음 |
| 애초 등록 증거 없는 synthetic UUID | 3 | 0 | Playwright 주문전환 source의 `Product A`; product 전체에 UUID 행 없음 |
| 코드 체계 변경 | 0 | 0 | 끊긴 snapshot과 동일한 활성 `model_name` 후보가 전건 0이므로 이번 모집단 원인으로 입증되지 않음 |
| 조인 키 오선정 | 0 | 0 | 저장 FK축 `product_id` 100%; 코드 컬럼은 라인에 존재하지 않음 |

`SOFT_DELETED`는 증상만이 아니라 삭제 actor와 migration까지 확인했다.

- `V31__soft_delete_test_seed_products.sql`: `created_by IN ('system','qa-seed')` 품목을 `issue-1096-test-seed-cleanup`으로 soft-delete.
- `V117__soft_delete_test_seed_documents.sql`: 위 시드 품목을 참조하는 전표/견적 라인과 빈 헤더를 같은 actor로 soft-delete.
- QA797 3품목: `created_by=qa798`, 이름/모델에 `QA797`, `deleted_by=system-sheet-sync`.

### 시드가 없어도 재현되는가

**경로는 있다. 실행하지 않았다.** 정상 관리자 API만으로도 다음 순서가 가능하다.

1. `POST /products`로 품목 생성.
2. `POST /slips`로 그 UUID를 쓰는 전표 생성. 이때 `SlipService.create()`는 `productClient.lookup()`으로 존재를 검증한다.
3. `DELETE /products/{id}`로 품목 soft-delete. `ProductService.delete()`는 product 자체와 product-service 소유 하위만 지우며, 별도 DB의 `slip_lines` 참조를 검사하지 않는다.
4. `GET /slips/{id}`는 product master를 재조회하지 않고 저장 snapshot을 반환하므로 연결이 끊긴 채 200이 된다.

즉 시더 자체가 유일 원인은 아니다. **cross-service 삭제 무결성/참조 정책 부재**가 같은 증상을 관리자 API에서도 만들 수 있다.

## 4. 사용자에게 지금 보이는 것

브라우저 연결은 이 세션에 없어 GUI를 새로 캡처하지 못했다. 대신 실행 중인 실제 `slip-service`에 사용자 헤더를 붙여 GET을 직접 호출했다. gateway 무토큰 호출은 401이었고, 인증 뒤 전달되는 동일 controller/service 경로의 직접 호출은 아래와 같았다.

### 4.1 활성 헤더 + 끊긴 라인: 200 OK, snapshot이 그대로 보임

`2026/01/01-1` 응답 원문(UUID 치환):

```json
{"success":true,"code":"OK","message":"성공","data":{"id":"[UUID 비공개]","slipType":"OUTBOUND","slipNo":"2026/01/01-1","slipDate":"2026-01-01","seqNo":1,"status":"SENT","sourceType":"MANUAL","partnerId":"[UUID 비공개]","partnerName":"거래처-P-2026-0001","partnerCode":null,"sourceWarehouseId":"[UUID 비공개]","destinationWarehouseId":null,"deliveryTag":"DAY","memo":"[Stage 2 시드] 프로젝트=삼성 강남점 신규 / 인수자=010-1000-1000","requesterId":"kimmiseon","version":2,"lines":[{"id":"[UUID 비공개]","productId":"[UUID 비공개]","productName":"테스트제품-TEST-MODEL-0001","modelName":"TEST-MODEL-0001","specification":"380V","quantity":1,"unitPrice":109000.00,"lineTotal":109000.00,"note":"Stage 2 시드","unitPriceWithVat":119900.00,"supplyAmount":109000.00,"vatAmount":10900.00,"unitPriceDomain":null,"setHead":false,"parentSetModel":null,"setOptions":null}]},"timestamp":"2026-08-08T16:38:11.407408381Z"}
```

`2026/07/15-11`도 **HTTP 200**이고 라인 원문은 다음과 같다.

```json
"lines":[{"productId":"[UUID 비공개]","productName":"[QA797] 구성품A(기본2개)","modelName":"QA797-PART-01","quantity":2,"unitPrice":80000.00,"lineTotal":160000.00},{"productId":"[UUID 비공개]","productName":"[QA797] 구성품B(기본1개)","modelName":"QA797-PART-02","quantity":1,"unitPrice":50000.00,"lineTotal":50000.00}]
```

`2026/07/16-1` 견적도 **HTTP 200**이며 `memo="R5 BUNDLE 무수정 편집 오염 실서버 QA"`, QA797 두 라인과 금액을 그대로 반환했다.

결론: **200 OK인데 빈 값도 아니다.** 저장된 `productName/modelName/금액` snapshot이 정상처럼 보여 master 연결 단절을 조용히 가린다. `SlipService.getOne()`은 `SlipDetailResponse.from(slip)`만 사용하며 product-service를 재조회하지 않는다. 데스크톱도 이 snapshot을 렌더링하므로 사용자에게 별도 단절 경고가 없다.

### 4.2 삭제 헤더: 404

삭제된 QA 전표 `2026/07/22-5` 실제 응답:

```json
{"success":false,"code":"NOT_FOUND","message":"전표를 찾을 수 없습니다","data":null,"timestamp":"2026-08-08T16:38:11.442542170Z"}
```

따라서 전체 549/63을 모두 “화면에서 열린다”고 말하면 틀리다. 활성 헤더/라인 부분은 200 snapshot, soft-delete된 헤더는 404다.

## 5. 복구 가능성

실 데이터 갈래가 **0행**이므로 정상 사용자 복구 대상도 0행이다.

- 현재 끊긴 snapshot과 동일한 활성 `model_name` 후보: 전표/견적 전건 **0**.
- 활성 DRAFT 전표는 화면에서 다른 활성 품목을 재선택할 수 있으나, 올바른 업무 대체품 근거가 없고 전부 QA 산물이므로 복구로 실행하면 안 된다.
- 삭제 헤더는 정상 상세 화면에서 404라 사용자 경로로 열 수 없다.
- 관리자 `reactivate`로 QA797을 되살리면 전표 549 + 견적 63뿐 아니라 최근단가 8행과 9,999,999,999,999원도 다시 정상 품목처럼 작동한다. 복구 수단이 아니라 오염 재활성화다.

업무 데이터가 향후 발견될 경우 필요한 것은 `(a) 원 업무 원문/불변 품목코드`, `(b) 현재 활성 품목의 유일 매핑`, `(c) 전표·재고·회계 영향 검증`, `(d) 감사 trail`이다. 현재 모집단에는 이 네 조건을 적용할 실 데이터 후보가 없다.

## 6. PM 슬라이스 제안

구현 지시가 아니라 분리 경계 제안이다.

| 슬라이스 | 같은 파일/테이블 묶음 | 이유 |
|---|---|---|
| A. QA797 잔재 격리 | `product_db.products` 3품목 + `slip_db.slip_lines/estimate_lines/partner_product_price_memory` | 549/63/8과 극단 금액이 한 provenance |
| B. #1096 시드 cleanup 사후 검증 | product `V31__soft_delete_test_seed_products.sql` + slip `V117__soft_delete_test_seed_documents.sql` + 해당 삭제 행 | 현재 신규로 늘어난 2,426/1,994가 이 migration 한 쌍의 결과 |
| C. synthetic UUID 생성 차단 | `SlipSeeder.java` + 주문전환 Playwright fixture/source + 생성 전 product lookup 계약 | ABSENT 300+3의 생성 경로가 soft-delete와 다름 |
| D. 조용한 snapshot 경고 | `SlipController/SlipService/SlipDetailResponse` + desktop `SlipDetailPage` | DB 정리와 분리해 200 정상처럼 보이는 관측성만 다룸 |
| E. 관리자 삭제 무결성 정책 | `ProductController/ProductService.delete` + cross-service 참조 확인/정책 | 시드 없이도 관리자 API로 재현 가능한 구조 원인 |

A와 B를 합치면 QA797 가격 오염과 #1096 시드 정리가 서로 다른 actor/복구 경계를 잃는다. C는 삭제가 아니라 생성 시점 원인이므로 분리해야 한다.

## 7. 개발책임자 판단이 필요한 질문

1. 향후 #1051 정본 모집단을 `(가) DB 보존 전체 5,335행`과 `(나) 사용자 노출 687행` 둘 다 계속 보고할지, 사용자 노출 범위만 게이트로 삼을지 결정이 필요하다. 본인은 둘 다 유지 권고한다. 전체만 보면 삭제 잔재가 과대계수되고, 활성만 보면 복구/오염 범위를 놓친다.
2. `2026/05/30-1~-3`을 향후 정리 대상 QA로 확정할지 판단이 필요하다. 코드/문서상 Playwright 주문전환 source와 직접 연결되지만, 업무 데이터 삭제 의미는 추론하지 않았다.
3. 활성 문서 상세에 “품목 master 연결 끊김” 경고를 노출할지, snapshot 표시만 유지할지 제품 정책 결정이 필요하다. 현재는 200 정상처럼 보이며 사용자가 단절을 알 수 없다.

## 8. 변경/신규 파일

- 신규: `docs/dev-reports/2026-08-09-1051-broken-link-recon.md`
- 그 외 변경 없음.

커밋/push, 코드 수정, DB INSERT/UPDATE/DELETE, Docker 재배포, 이슈 생성은 수행하지 않았다.
