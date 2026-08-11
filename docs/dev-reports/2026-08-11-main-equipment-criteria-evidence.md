# 메인장비 판정 기준 업무 근거 조사

> 조사일: 2026-08-11 (Asia/Seoul)  
> DB 측정 구간: 2026-08-11 10:54:57~11:03:57 KST · 최종 재검증 11:13:14 KST  
> 범위: 레거시 종합견적서·거래처 발송 주문서, `slip_db`·`partner_order_db`·`product_db`·`partner_auth_db`·`partner_db` 읽기 전용 조회  
> 금지 준수: 코드·스키마·Git·공유 DB 변경 없음. Git은 `log`·`blame`·`show`·`diff` 읽기만 수행했다.

## 1. 결론 4줄

1. **실거래 표본:** QA·DEV-SEED를 제외한 실내기만 견적 **0건 / 0원**, 실내기만 전표 **0건 / 0원**, 전열교환기만 견적·전표 **0건 / 0원**이다. 삭제 이력과 주문 원본까지 넓혀도 실거래가 0이므로 **판정 불가**다.
2. **역추적 결과:** 실거래 실내기만 행에서 40% 또는 45%를 역산할 행이 **0개**다. 따라서 **40%인지 45%인지 근거 없음**이다.
3. **실제로 갈리는 조합 중 일어날 수 있는 것:** `I`, `E`, `I+E`, `I+A`, `I+E+A`의 **5개**다. 현재 카탈로그에 O/I/E/A가 모두 있고 앱이 각 행 수량을 독립 입력하게 하므로 모두 구성 가능하나, 실운영 발생 빈도는 표본 0이라 알 수 없다.
4. **나중 수정 단서:** 주문 원본 스냅샷이 2026-07-28로 견적 원본 2026-06-09보다 최신이고 주문 쪽 주석·경고가 더 구체적이라는 **정황은 있다**. 그러나 두 판정 줄은 저장소에 2026-06-04 함께 들어온 뒤 변경되지 않아, 주문 기준이 의도적 후속 수정이라는 **직접 증거는 없다**.

## 2. 조사 기준과 모집단

### 2.1 문서·라인 범위

- 견적: `slip_db.estimates` + `estimate_lines`
- 전표: `slip_db.slips` + `slip_lines`
- 레거시 주문 저장 원본 확인: `partner_order_db.partner_orders` + `partner_order_lines`
- 제품명·대/중/소분류 및 견적 노출 범위: `product_db.products` + `classification` + `product_estimate_exposure`
- 정가: 문서일 이하의 `price_history.effective_date` 중 가장 최근 `release_price`
- 저장 실단가: `(supply_amount + vat_amount) / quantity`; 결측 시 `unit_price_with_vat`, 다시 결측이면 `line_total / quantity`
- 모든 DB SQL은 `BEGIN TRANSACTION READ ONLY; ... COMMIT;` 안에서 실행했다.

### 2.2 QA·DEV-SEED 판정식

요약 라벨로 먼저 버리지 않고 작성자·일자·이름 원문을 먼저 셌다. 다음 조건은 그 원문을 확인한 뒤 적용했다.

1. 저장소 시드 계정 원문: `services/auth-service/src/main/resources/db/migration/V5__seed_p0_5_test_accounts.sql:10-18`의 `a000...001~009`.
2. `created_by IN ('system','system-internal', a000...001~009)`는 DEV-SEED/시스템으로 분리했다.
3. `created_by='00000000-0000-0000-0000-000000000000'`인 삭제 전표 14건은 작성자만으로 분리하지 않았다. 실제 행을 펼쳐 `Seed sample remark`, `QA-25`, `D2 merge QA test`, `QA-Partner-P2002`, `FE-BUG-1 fix QA`, `LiveQA`, `LOADTEST-*`를 확인한 뒤 QA로 분리했다.
4. 별도 작성자 전표 2건은 `partner_name='S22 QA'`, `memo IN ('S22-1123-open','S22-1123-closed')`, `product_name='S22 QA product'`를 확인한 뒤 QA로 분리했다.
5. `partner_order_db`의 `2026/07/30-1`은 실제 거래처명을 썼지만, `docs/qa/985-confirm-price-live/R5-REPORT.md:1-7,47-70,99-106`이 PR #985 실화면 QA와 “허용된 실 주문 1건”임을 명시하므로 QA로 분리했다.
6. `2026/08/07-1`은 헤더 메모 `S6-직접저장-1786115763971`과 이후 라인의 DEV-SEED 작성자 반복을 확인해 QA로 분리했다.

## 3. 먼저 센 행 분포

### 3.1 `slip_db` — `is_deleted=false AND deleted_at IS NULL` 헤더 원문 분포

측정 시각: **2026-08-11 10:55:35 KST**.

#### `estimates`

| created_month | created_by | row_count | min_created_at | max_created_at |
|---|---|---:|---|---|
| 2026-07-01 | `a0000000-0000-0000-0000-000000000003` | 29 | 2026-07-16 00:33:11 | 2026-07-17 02:00:03 |
| 2026-08-01 | `a0000000-0000-0000-0000-000000000001` | 15 | 2026-08-09 22:25:59 | 2026-08-10 02:30:12 |
| 2026-08-01 | `a0000000-0000-0000-0000-000000000003` | 8 | 2026-08-05 19:37:22 | 2026-08-07 19:24:17 |
| 2026-08-01 | `a0000000-0000-0000-0000-000000000004` | 18 | 2026-08-07 18:33:42 | 2026-08-08 22:02:56 |

합계는 헤더 70건이다. 이 헤더에 `estimate_lines.is_deleted=false AND estimate_lines.deleted_at IS NULL`을 조인하면 라인 106개다. 라인 테이블만 따로 세면 활성 헤더에 속하지 않는 2개가 더 있어 108개이므로, 거래 구성 집계는 **활성 헤더와 활성 라인의 조인 106개**를 사용했다.

#### `slips`

| created_month | created_by | row_count | min_created_at | max_created_at |
|---|---|---:|---|---|
| 2026-05-01 | `system` | 100 | 2026-05-09 16:59:33 | 2026-05-09 16:59:33 |
| 2026-05-01 | `system-internal` | 3 | 2026-05-30 13:37:02 | 2026-05-30 13:39:39 |
| 2026-07-01 | `a0000000-0000-0000-0000-000000000003` | 193 | 2026-07-15 20:46:53 | 2026-07-30 00:20:30 |
| 2026-08-01 | `656b7049-33b0-4598-9be6-67f2ec9805b0` | 2 | 2026-08-08 20:40:23 | 2026-08-08 20:40:48 |
| 2026-08-01 | `a0000000-0000-0000-0000-000000000001` | 28 | 2026-08-09 01:07:58 | 2026-08-09 22:52:05 |
| 2026-08-01 | `a0000000-0000-0000-0000-000000000003` | 100 | 2026-08-03 19:46:26 | 2026-08-08 21:51:16 |
| 2026-08-01 | `a0000000-0000-0000-0000-000000000004` | 43 | 2026-08-06 05:41:25 | 2026-08-09 01:08:35 |
| 2026-08-01 | `a0000000-0000-0000-0000-000000000006` | 14 | 2026-08-08 21:03:32 | 2026-08-08 22:43:18 |

위 8개 원문 그룹의 합계는 헤더 **483건**이고, 활성 헤더에 속한 활성 라인은 930개다. 선행 정찰본의 “482”는 그룹 합산 오류였으며 이 원문 재합산으로 바로잡았다. 11:13:13 KST 재조회도 헤더 483건·조인 라인 930개였다. 시드 목록 밖 작성자 2건의 원문은 다음과 같았다.

| created_at | created_by | slip_no | partner_name | memo | product_name |
|---|---|---|---|---|---|
| 2026-08-08 20:40:23 | `656b7049-33b0-4598-9be6-67f2ec9805b0` | `2026/08/09-10` | `S22 QA` | `S22-1123-open` | `S22 QA product` |
| 2026-08-08 20:40:48 | `656b7049-33b0-4598-9be6-67f2ec9805b0` | `2026/08/08-37` | `S22 QA` | `S22-1123-closed` | `S22 QA product` |

### 3.2 삭제 이력까지 넓힌 결과

측정 시각: **2026-08-11 11:00:33 KST**.

- `estimates` 전체 2,063건: 시드 목록 밖 `created_by` **0건**.
- `slips` 전체 2,777건: 시드 목록 밖 `created_by` 16건.
  - 14건은 `created_by='00000000-0000-0000-0000-000000000000'`이며 모두 `Seed sample remark`·`QA-*`·`LiveQA`·`LOADTEST-*` 원문을 가진 삭제행이다.
  - 나머지 2건은 위 `S22 QA` 활성행이다.
- 따라서 활성과 삭제를 합쳐도 실거래로 분류할 견적·전표 헤더는 **0건**이다.

### 3.3 `partner_order_db` 저장 원본까지 넓힌 결과

측정 시각: **2026-08-11 11:01:46 KST**.

`partner_orders` 전체 2,025건의 월·작성자 분포는 다음 9그룹이었다.

| is_deleted | created_month | created_by | row_count | total_amount_sum |
|---|---|---|---:|---:|
| true | 2026-05-01 | `a000...001` | 4 | 5,040,000 |
| true | 2026-05-01 | `qa-tester` | 1 | 720,000 |
| true | 2026-05-01 | `system` | 30 | 314,100,000 |
| true | 2026-06-01 | `a000...003` | 489 | 670,800,000 |
| false | 2026-06-01 | `a000...004` | 2 | 2,400,000 |
| true | 2026-06-01 | `a000...004` | 1,494 | 2,129,880,000 |
| false | 2026-07-01 | `d7ac77d4-db1e-45d1-a0bf-e3345cab4f26` | 1 | 104,665 |
| false | 2026-08-01 | `d7ac77d4-db1e-45d1-a0bf-e3345cab4f26` | 1 | 1,576,036 |
| true | 2026-08-01 | `dev_master` | 3 | 2,700,000 |

두 `d7ac...` 헤더도 각각 PR #985 라이브 QA와 `S6-직접저장` QA다. 따라서 레거시 주문 저장 원본에서도 운영 역추적 표본은 **0건**이다.

## 4. 거래 구성 실측

### 4.1 문서 구성 플래그

검사 대상은 `product_estimate_exposure.estimate_category IN ('HOME_MULTI','COMMERCIAL_MULTI')`인 라인이다. 아래 플래그는 **물리 장비 판정이 아니라 두 앱이 실제로 읽는 문자열 판정**이다.

- `O`: `product_name + catM + catL`에 `실외기|outdoor`
- `I`: ERV가 아니면서 `product_name + catM + catL`에 `실내기|indoor|벽걸이`
- `E`: `product_name + catM + catL`에 `전열\s*교환기|erv`
- `A`: O/I/E 어느 것도 아닌 검사 대상

`O`에는 `실외기 받침대`, `I`에는 `Y형 실내기 분기관`·`4WAY 데코커버`, `E`에는 `ERV용 중계기`·`에어콤보용 리모컨`도 들어갈 수 있다. 즉 **두 기존 정규식 어느 쪽도 “본체”를 정확히 뜻하지 않는다**.

### 4.2 QA·DEV-SEED 제외 결과

| 문서 | 실내기만 | 금액 합계 | 전열교환기만 | 금액 합계 | O 문자열 포함 | 금액 합계 |
|---|---:|---:|---:|---:|---:|---:|
| 견적 | **0** | **0** | **0** | **0** | **0** | **0** |
| 전표 | **0** | **0** | **0** | **0** | **0** | **0** |
| 합계 | **0** | **0** | **0** | **0** | **0** | **0** |

이 0은 “그런 업무가 없다”는 뜻이 아니라, **실거래 모집단 자체가 0**이라는 뜻이다.

### 4.3 QA·DEV-SEED 포함 참고치 — 운영 근거로 사용 금지

측정 시각: **2026-08-11 10:59:49 KST**.

| 문서 | 구성 | 문서 수 | 문서금액 합계 |
|---|---|---:|---:|
| 견적 | A | 3 | 2,070,000 |
| 견적 | O | 17 | 635,187,796 |
| 전표 | A | 41 | 36,824,877 |
| 전표 | E | 3 | 0 |
| 전표 | I | 30 | 312,000 |
| 전표 | O | 50 | 23,890,015 |
| 전표 | O+A | 1 | 12,019,141 |
| 전표 | O+E | 5 | 12,443,874 |
| 전표 | O+E+A | 3 | 10,882,597 |

요청한 세 버킷으로만 다시 묶으면 다음과 같다.

| 문서 | 실내기만 | 금액 합계 | 전열교환기만 | 금액 합계 | O 문자열 포함 | 금액 합계 |
|---|---:|---:|---:|---:|---:|---:|
| 견적 QA/시드 | 0 | 0 | 0 | 0 | 17 | 635,187,796 |
| 전표 QA/시드 | 30 | 312,000 | 3 | 0 | 59 | 59,235,627 |

이 QA 참고치에 두 판정을 적용하면 전표 33건·312,000원에서 견적앱은 페널티, 주문앱은 무페널티로 갈렸다. 30건은 I, 3건은 E다. 업무 정본 근거는 아니지만 **판정 차이가 실제 저장 데이터 형태에서 발화할 수 있음**은 확인한다.

## 5. 과거 저장금액 역추적

### 5.1 역산식

```text
적용 정가 = 문서일 이하 effective_date 중 가장 최근 price_history.release_price
저장 실단가 = (supply_amount + vat_amount) / quantity
             → 결측 시 unit_price_with_vat
             → 다시 결측 시 line_total / quantity
역산 할인율(%) = (1 - 저장 실단가 / 적용 정가) × 100
정확히 40/45 = 각 목표값과의 차이 < 0.01%p
```

### 5.2 결과

| 모집단 | 실내기만 문서 | 정가·저장단가 동시 존재 라인 | 정확히 40% | 정확히 45% | 결론 |
|---|---:|---:|---:|---:|---|
| QA·DEV-SEED 제외 견적 | 0 | 0 | 0 | 0 | 근거 없음 |
| QA·DEV-SEED 제외 전표 | 0 | 0 | 0 | 0 | 근거 없음 |
| QA·DEV-SEED 포함 전표 참고치 | 30 | 30 | 0 | 0 | 30라인 모두 기타 할인율; 운영 근거 아님 |

`partner_order_db`의 유일한 실제 브라우저 전송 QA `2026/07/30-1`은 `singleSets` 리모컨 2종뿐이라 홈/상업 메인장비 판정 분모에 들어가지 않는다. `2026/08/07-1`은 O 문자열 포함 QA다. 따라서 주문 원본에서도 I-only 40/45 역추적 행은 없다.

**결론:** 저장금액으로 어느 판정이 운영에 적용됐는지 역추적할 수 없다.

## 6. 두 판정이 갈리는 조합 전수

### 6.1 진리표

정의상:

```text
견적 페널티 = O가 없음
주문 페널티 = ERV를 제외한 뒤 분모가 있고, O 또는 I가 없음
             = O=false, I=false, A=true  (E는 결과에 영향 없음)
```

비어 있지 않은 O/I/E/A 조합 15개 전수는 다음과 같다.

| 조합 | 견적 | 주문 | 두 앱 갈림 |
|---|---|---|---|
| O | 무페널티 | 무페널티 | 아니오 |
| I | 40% | 무페널티 | **예** |
| E | 40% | 분모 0 → 무페널티 | **예** |
| A | 40% | 40% | 아니오 |
| O+I | 무페널티 | 무페널티 | 아니오 |
| O+E | 무페널티 | 무페널티 | 아니오 |
| O+A | 무페널티 | 무페널티 | 아니오 |
| I+E | 40% | 무페널티 | **예** |
| I+A | 40% | 무페널티 | **예** |
| E+A | 40% | 40% | 아니오 |
| O+I+E | 무페널티 | 무페널티 | 아니오 |
| O+I+A | 무페널티 | 무페널티 | 아니오 |
| O+E+A | 무페널티 | 무페널티 | 아니오 |
| I+E+A | 40% | 무페널티 | **예** |
| O+I+E+A | 무페널티 | 무페널티 | 아니오 |

갈림은 한 방향뿐이다. **견적은 40%, 주문은 45% 유지**가 되는 5개 조합이며, 반대 방향은 없다.

### 6.2 현재 카탈로그가 각 원자를 실제로 제공하는가

측정 시각: **2026-08-11 11:03:57 KST**. O/I/E/A는 §4.1의 문자열 플래그로 상호 배타 분류했다.

| estimate_category | A | E | I | O |
|---|---:|---:|---:|---:|
| HOME_MULTI | 50 | 3 | 59 | 11 |
| COMMERCIAL_MULTI | 90 | 13 | 140 | 173 |
| 합계 | **140** | **16** | **199** | **184** |

현재 카탈로그에는 네 원자가 모두 존재한다. 더구나:

- 주문 상업 수량 입력은 `clients/web/order-app/index.html:3031-3039`에서 각 `.qty-input` 값을 독립적으로 `commQty.set(model,q)`에 넣는다.
- 주문 홈 수량도 같은 파일 `:5052-5057`에서 개별 모델 값을 `homeQty.set(model,v)`에 넣는다.
- 견적 홈 수량은 `clients/web/estimate-app/views/index.ejs:6005-6021`에서 각 행 값을 독립적으로 `homeQty`에 넣는다.
- 주문의 전열교환기 리모컨 옵션은 `clients/web/order-app/index.html:5451-5458`에서 `제외`를 허용하므로 E-only도 UI상 구성 가능하다.

따라서 갈림 5개는 다음처럼 모두 **UI·카탈로그상 일어날 수 있다**.

| 갈림 조합 | 가능 근거 | 실제 운영 발생 확인 |
|---|---|---|
| I | I 후보 199개, 독립 수량 입력 | 표본 0 — 확인 불가 |
| E | E 후보 16개, 리모컨 `제외` 가능 | 표본 0 — 확인 불가 |
| I+E | I/E 동시 선택을 막는 검증 없음 | 표본 0 — 확인 불가 |
| I+A | I/A 동시 선택 가능; 파생 부자재도 존재 | 표본 0 — 확인 불가 |
| I+E+A | I/E/A 동시 선택을 막는 검증 없음 | 표본 0 — 확인 불가 |

### 6.3 문자열 판정 자체의 반증

현재 카탈로그에서 견적은 메인 없음, 주문은 메인 있음으로 보는 **행 단위 후보가 199개**다.

- COMMERCIAL_MULTI 140개
- HOME_MULTI 59개
- 모두 `name + catL` 자체에 `실내기|indoor|벽걸이`가 있어 갈린다. 현재 데이터에서는 `catM`만 추가해서 갈리는 행은 0개다.
- 예시는 `4WAY 데코커버 / catL=실내기`, `Y형 실내기 분기관 / catL=실내기`다. 주문 정규식은 이런 부자재도 메인으로 센다.
- 반대로 O 후보에는 `실외기 받침대`가 들어가므로 견적·주문 모두 그것만 있어도 실외기 있음으로 볼 수 있다.

따라서 개발책임자께 올릴 선택지는 단순히 “견적 문자열 vs 주문 문자열”이면 안 된다. 두 문자열 모두 **본체 속성이 아니라 자유 텍스트**를 대리값으로 쓰기 때문이다.

## 7. 레거시 코드와 변경 이력

### 7.1 현재 포팅본의 원문

견적앱:

- `clients/web/estimate-app/views/index.ejs:13887-13912`
  - 주석: `/* 실내기 단독여부 판단 */`
  - `qTotal`은 선택된 홈/상업 전 라인을 센다.
  - `if(/실외기|outdoor/i.test((r.name||'')+' '+(r.catL||''))) qOut += q;`
  - `return (qTotal > 0 && qOut === 0);`
- 같은 파일 `:13938-13942`
  - 주석: `/* 실내기 단독체크 (45% -> 40%) */`

주문앱:

- `clients/web/order-app/index.html:8053-8089`
  - 주석: `/* 장비부재확인 */`, `/* 전열교환기제외 */`, `/* 메인장비확인 */`
  - `txt = name + catM + catL`
  - `전열\s*교환기|erv`는 분모와 메인 수에서 제외한다.
  - `실외기|outdoor|실내기|indoor|벽걸이`를 메인으로 센다.
  - `return (qTotal > 0 && qMain === 0);`
- 같은 파일 `:8199`
  - 사용자 경고: `※실외기, 실내기가 없는 경우 할인율이 강제 조정됩니다.`

주석은 주문 쪽이 “실외기와 실내기가 모두 없는 경우”라는 정책을 사용자에게 직접 표시한다. 견적 쪽 함수명·주석은 “실내기 단독”이라고 쓰지만 실제 구현은 E-only와 A-only까지 모두 포함해 이름보다 넓다.

### 7.2 원본 GAS 스냅샷

- 주문 원본 `tools/legacy-gas/거래처 발송 주문서/index.html:7684-7720`은 현재 주문 포팅본과 같은 판정이다.
- 견적 원본 `tools/legacy-gas/종합견적서/index.html:13300-13326`은 현재 견적 포팅본과 같은 판정이다.
- 포팅 과정에서 두 기준이 새로 갈라진 것이 아니라 **레거시 원본부터 이미 달랐다**.

### 7.3 읽기 전용 Git 이력

| 관측 | 결과 |
|---|---|
| 원본 두 판정 줄의 최초/마지막 blame | 둘 다 `2ebab5f76f25...`, 2026-06-04 07:36 KST |
| `git log -G`로 판정 함수/정규식 변경 검색 | 두 원본 모두 위 2026-06-04 스냅샷 커밋 1건만 검출 |
| 주문 원본 파일의 가장 최근 라이브 갱신 | `9c7f0d546d68...`, 2026-07-28, “Drive 라이브 27개” |
| 견적 원본 파일의 가장 최근 라이브 갱신 | `8453da597ace...`, 2026-06-10, “06-09 clasp 기준” |
| 위 최신 갱신 사이의 판정 줄 diff | 주문·견적 모두 0줄 |
| 현재 포팅본 최초 커밋 순서 | 주문 `13ce6f89...` 2026-05-05 16:22, 견적 `98e7ecf7...` 18:10; 둘 다 “legacy 그대로/100% 보존” 성격 |

해석:

1. **정황상 더 최신 운영 스냅샷은 주문 원본**이다.
2. 그러나 주문 판정 줄이 견적 판정을 고친 커밋, 이슈, 주석은 찾지 못했다.
3. 두 줄은 저장소가 원본을 수집한 시점부터 각각 존재했고 이후 그대로였다.
4. 그러므로 “주문 기준이 나중의 의도적 수정이므로 정본”이라고 단정할 수 없다. 최신 스냅샷이라는 **약한 우선 신호**만 있다.

## 8. 개발책임자 결정에 올릴 수 있는 사실 경계

1. 실거래 데이터와 저장금액은 어느 쪽도 지지하지 않는다. 표본이 없기 때문이다.
2. 갈림 5개 조합은 전부 UI상 가능하므로 “일어날 수 없는 조합 제거”로 선택지를 더 줄일 수 없다.
3. 주문 기준은 더 최신 원본 스냅샷과 명시적 사용자 경고라는 정황상 우세가 있으나, 의도적 수정 이력은 없다.
4. 기존 두 문자열은 모두 본체 분류로 부정확하다. 업무 질문은 최소한 다음 의미를 분리해야 한다.
   - 실외기 본체가 있어야 45%인가.
   - 실내기 본체만 있어도 45%인가.
   - 전열교환기 본체만 있는 거래는 면제인가.
   - 받침대·분기관·판넬·리모컨의 이름에 `실외기/실내기/ERV`가 들어가도 본체로 세지 않을 것인가.

본 조사만으로는 첫 두 질문의 업무 정답을 확정할 수 없다. 다만 **기존 정규식 두 개를 그대로 선택지로 올리는 것은 근거상 부적절**하다.

## 부록 A. 실행 SQL 원문

### A.1 월·작성자 분포

```sql
BEGIN TRANSACTION READ ONLY;
SELECT clock_timestamp() AT TIME ZONE 'Asia/Seoul' AS measured_at_kst;

SELECT 'estimates' AS table_name,
       date_trunc('month', created_at)::date AS created_month,
       created_by,
       count(*) AS row_count,
       min(created_at) AS min_created_at,
       max(created_at) AS max_created_at
FROM estimates
WHERE is_deleted = false AND deleted_at IS NULL
GROUP BY 1,2,3
ORDER BY 2,3;

SELECT 'slips' AS table_name,
       date_trunc('month', created_at)::date AS created_month,
       created_by,
       count(*) AS row_count,
       min(created_at) AS min_created_at,
       max(created_at) AS max_created_at
FROM slips
WHERE is_deleted = false AND deleted_at IS NULL
GROUP BY 1,2,3
ORDER BY 2,3;
COMMIT;
```

삭제 이력은 `WHERE`를 제거하고 `is_deleted, (deleted_at IS NULL), date_trunc('month',created_at)::date, created_by`를 그대로 `GROUP BY`했다.

### A.2 시드 목록 밖 헤더 원문 펼치기

```sql
BEGIN TRANSACTION READ ONLY;
SELECT s.created_at::date AS created_date, s.created_at, s.created_by,
       s.is_deleted, s.deleted_at, s.slip_no, s.slip_date,
       s.partner_name, s.memo, s.source_type, s.source_id, s.idempotency_key,
       count(sl.id) AS line_count,
       string_agg(DISTINCT concat_ws(' / ',sl.product_name,sl.model_name,sl.note),
                  ' | ' ORDER BY concat_ws(' / ',sl.product_name,sl.model_name,sl.note)) AS line_text
FROM slips s
LEFT JOIN slip_lines sl ON sl.slip_id=s.id
WHERE coalesce(s.created_by,'') NOT IN (
  'system','system-internal',
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000004',
  'a0000000-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000006',
  'a0000000-0000-0000-0000-000000000007',
  'a0000000-0000-0000-0000-000000000008',
  'a0000000-0000-0000-0000-000000000009')
GROUP BY s.id,s.created_at::date,s.created_at,s.created_by,s.is_deleted,s.deleted_at,
         s.slip_no,s.slip_date,s.partner_name,s.memo,s.source_type,s.source_id,s.idempotency_key
ORDER BY s.created_at,s.slip_no;
COMMIT;
```

### A.3 현재 카탈로그 O/I/E/A 분포

```sql
BEGIN TRANSACTION READ ONLY;
WITH exposed AS (
  SELECT pe.estimate_category,p.id,p.name,
         coalesce(cl.name,'') AS cat_l,
         coalesce(cm.name,'') AS cat_m,
         coalesce(cs.name,'') AS cat_s,
         lower(coalesce(p.name,'')||' '||coalesce(cm.name,'')||' '||coalesce(cl.name,'')) AS txt
  FROM product_estimate_exposure pe
  JOIN products p ON p.id=pe.product_id
                 AND p.is_deleted=false AND p.deleted_at IS NULL
  LEFT JOIN classification cl ON cl.id=p.cat_l_id
  LEFT JOIN classification cm ON cm.id=p.cat_m_id
  LEFT JOIN classification cs ON cs.id=p.cat_s_id
  WHERE pe.is_deleted=false AND pe.deleted_at IS NULL
    AND pe.estimate_category IN ('HOME_MULTI','COMMERCIAL_MULTI')
), flagged AS (
  SELECT *,
    txt ~ '실외기|outdoor' AS has_o,
    (txt ~ '실내기|indoor|벽걸이')
      AND NOT (txt ~ '전열[[:space:]]*교환기|erv') AS has_i,
    txt ~ '전열[[:space:]]*교환기|erv' AS has_e
  FROM exposed
)
SELECT estimate_category,has_o,has_i,has_e,
       count(*) AS selectable_product_count,
       min(concat_ws(' / ',name,cat_l,cat_m,cat_s)) AS example_min_lexical,
       max(concat_ws(' / ',name,cat_l,cat_m,cat_s)) AS example_max_lexical
FROM flagged
GROUP BY estimate_category,has_o,has_i,has_e
ORDER BY estimate_category,has_o,has_i,has_e;
COMMIT;
```

### A.4 거래 라인 원문 추출

`slip_db`와 `product_db`는 서로 다른 PostgreSQL DB이므로 DB에 FDW·임시 테이블을 만들지 않았다. 다음 두 읽기 결과를 프로세스 메모리에서 `product_id`로 결합했다.

```sql
-- slip_db
BEGIN TRANSACTION READ ONLY;
SELECT 'estimate' AS doc_type,e.id,e.estimate_no AS doc_no,e.estimate_date AS doc_date,
       e.created_at,e.created_by,e.partner_name,e.memo,e.total_amount AS doc_amount,
       el.product_id,el.product_name,el.quantity,el.unit_price,el.unit_price_with_vat,
       el.supply_amount,el.vat_amount,el.line_total
FROM estimates e
JOIN estimate_lines el ON el.estimate_id=e.id
                      AND el.is_deleted=false AND el.deleted_at IS NULL
WHERE e.is_deleted=false AND e.deleted_at IS NULL
UNION ALL
SELECT 'slip',s.id,s.slip_no,s.slip_date,s.created_at,s.created_by,s.partner_name,s.memo,
       (SELECT sum(sl2.line_total) FROM slip_lines sl2
         WHERE sl2.slip_id=s.id AND sl2.is_deleted=false AND sl2.deleted_at IS NULL),
       sl.product_id,sl.product_name,sl.quantity,sl.unit_price,sl.unit_price_with_vat,
       sl.supply_amount,sl.vat_amount,sl.line_total
FROM slips s
JOIN slip_lines sl ON sl.slip_id=s.id
                  AND sl.is_deleted=false AND sl.deleted_at IS NULL
WHERE s.is_deleted=false AND s.deleted_at IS NULL;
COMMIT;
```

```sql
-- product_db
BEGIN TRANSACTION READ ONLY;
SELECT p.id,p.name,coalesce(cl.name,'') AS cat_l,coalesce(cm.name,'') AS cat_m,
       coalesce(cs.name,'') AS cat_s,
       string_agg(DISTINCT pe.estimate_category,',' ORDER BY pe.estimate_category)
         FILTER (WHERE pe.is_deleted=false AND pe.deleted_at IS NULL) AS exposure_categories
FROM products p
LEFT JOIN classification cl ON cl.id=p.cat_l_id
LEFT JOIN classification cm ON cm.id=p.cat_m_id
LEFT JOIN classification cs ON cs.id=p.cat_s_id
LEFT JOIN product_estimate_exposure pe ON pe.product_id=p.id
WHERE p.is_deleted=false AND p.deleted_at IS NULL
GROUP BY p.id,p.name,cl.name,cm.name,cs.name;

SELECT product_id,effective_date,release_price
FROM price_history
WHERE is_deleted=false AND deleted_at IS NULL
ORDER BY product_id,effective_date;
COMMIT;
```
