# PR #1047 / Issue #1012 R3 분류 커버리지 재수렴 리뷰

## 결론

**BLOCK**.

`product_db`에 실제로 존재하는 품목만 남기면, 전체 활성 전표 모집단의 화면 단위인 모델 집계 행 35개 중 분류가 붙는 행은 4개(11.43%), 붙지 않는 행은 31개(88.57%)다. 라인 가중치로는 2,143라인 중 4라인(0.19%)만 분류되고 2,139라인(99.81%)이 미분류다.

따라서 `chips.size === 0 -> return true`는 소수 레거시 예외를 보존하는 규칙이 아니다. 실 품목 모델의 88.57%를 모든 칩에 공통 노출하며, 라인 가중치로는 99.81%를 공통 노출한다. 실제 계산 결과 여섯 칩 각각이 실 품목 모델의 88.57~94.29%, 라인의 99.81~99.91%를 반환한다. 필터 의미가 사실상 사라진다.

다만 이 blanket 통과 이후 **현재 실데이터에서 분류 근거가 빈 정상 행이 사라지는 false-negative는 재현되지 않았다**. 빈 칩 31모델은 모두 통과하고, 분류된 4모델은 자기 칩에서 통과한다. 이는 blanket 통과가 옳다는 뜻이 아니라, 행 소실을 필터 무력화로 바꾼 상태라는 뜻이다.

## 1. 조사 기준과 DB 스냅샷

- 조사 시각: `2026-08-02T20:41:54+09:00`
- 코드: 브랜치 `feat/1012-inout-analysis`, HEAD `9c47d139b322c672d4abce396a68fca253e4b48e`
- 화면 기본 기간: `2026-01-01`~`2026-12-31`
- 화면 집계 대상 상태: `CONFIRMED`, `DELIVERED`, `COMPLETED`
- 전체 활성 모집단: soft delete되지 않은 `slips`와 `slip_lines`의 내부 조인
- 실 품목 판정: soft delete되지 않은 `product_db.products.model_name`과 `slip_lines.model_name`의 정확 일치
- 분류 판정은 HEAD의 실제 순서대로 적용했다.
  1. product 매칭 성공 시 product 정본의 `name`과 `product_category`를 사용한다.
  2. `product_category`는 `HOME_MULTI -> homemulti`, `SINGLE_SET -> singleSets`, `COMMERCIAL_MULTI -> commercialMulti`일 때 각각 홈멀티·싱글중대형·상업멀티 칩이 된다.
  3. 정본 품목명에 `실외기`, `실내기`, `판넬` 또는 `패널`이 포함되면 해당 칩이 된다.
  4. product의 category key가 null일 때만 전표 라인의 `category_key`가 fallback이다.

모든 SQL은 다음처럼 PostgreSQL 세션 자체를 읽기 전용으로 강제해 실행했다.

```text
docker exec -e PGOPTIONS="-c default_transaction_read_only=on" samhan-postgres psql ...
```

DB write, DDL, Docker 이미지 재빌드, 컨테이너 재시작은 하지 않았다.

## 2. QA 데이터 제외 기준과 제외 건수

### 2.1 제외 기준

이름 prefix만으로 QA 여부를 추정하지 않았다. 활성 `product_db.products`에 동일 `model_name`이 없는 전표 라인을 제외했다. 이 기준은 `QA797-*`뿐 아니라 `TEST-MODEL-*`도 동일하게 제외하며, 반대로 `AR*`, `AC*`라는 모양만으로 실 품목이라 간주하지 않는다.

현재 DB의 전체 활성 전표 모집단 원문은 다음과 같다.

```text
all_lines                : 2776
all_models               : 138
excluded_lines           : 633
excluded_models          : 103
real_lines               : 2143
real_models              : 35
trim_only_lines          : 0
trim_only_models         : 0
```

제외 633라인/103모델의 family 분포:

```text
 excluded_family | active_lines | models
-----------------+--------------+--------
 QA797-*         |          333 |      3
 TEST-MODEL-*    |          300 |    100
```

즉 제외 건수는 **633라인, 103개 모델 집계 행**이며, 제외 후 실 품목은 **2,143라인, 35개 모델 집계 행**이다. trim 후에만 product가 존재하는 경우는 0건이므로 현재 모집단에서 공백 정규화 때문에 생긴 매칭 실패는 없다.

### 2.2 PM 제공 수치와 현재 스냅샷의 차이

PM이 정정한 `QA797-PART-01 140건`, `QA797-PART-02 138건`, `AR09... 126건`, `AR07... 117건`은 “구조적으로 product 매칭이 0이 아니다”라는 방향에서 옳다. 다만 이 라운드의 현재 DB는 동시 트랙 데이터 변경으로 그 원시 건수가 더 이상 같지 않다.

```text
    model_name     | count
-------------------+-------
 AR09TXEAAWKNEU-04 |   300
 QA797-PART-01     |   225
 QA797-PART-02     |   209
 AR07TXEAAWKNEU-03 |   117
```

위 수치는 soft-delete 여부를 가리지 않은 현재 `slip_lines` 원시 행 수다. 본 커버리지의 정본 수치는 화면 데이터 흐름에 맞춰 활성 slip/line만 남겼으므로, 예를 들어 활성 `AR09TXEAAWKNEU-04`는 115라인이다. 보고서에서는 PM의 과거 스냅샷 숫자를 현재 실행 결과로 재인용하지 않았다.

### 2.3 화면 기본 기간의 좁은 모집단

현재 화면과 완전히 같은 기간·상태를 적용하면 다음과 같다.

```text
eligible_lines            : 82
eligible_models           : 61
excluded_unmatched_lines  : 82
excluded_unmatched_models : 61
real_matched_lines        : 0
real_matched_models       : 0
```

현재 61모델은 전부 `TEST-MODEL-*`이며 product DB에 없다. 그러므로 이 좁은 화면 스냅샷만으로 “실 품목 커버리지”를 계산하면 분모가 0이다. 아래 구조적 커버리지는 이 한계를 숨기지 않고, 전체 활성 전표에서 product DB 존재 품목만 남겨 계산했다.

## 3. 실 품목 분류 커버리지

모델 집계 행이 실제 화면의 한 행이므로 이를 주 지표로 삼고, 라인 가중치를 함께 제시한다.

| 기준 | 분류 있음 | 분류 없음 | 합계 | 커버리지 |
|---|---:|---:|---:|---:|
| 모델 집계 행(주 지표) | 4 | 31 | 35 | **11.43%** |
| 원천 전표 라인(가중치) | 4 | 2,139 | 2,143 | **0.19%** |

실제로 분류된 4모델/4라인의 원문:

```text
model        lines product_name                  product_category chips
AC023CN1DBC1     1 무풍 1way 냉방전용 실내기      SINGLE_PART     실내기
AC023CX1DBC1     1 무풍 1way 냉방전용 실외기      SINGLE_PART     실외기
PC1NWSK3NW       1 판넬 1way 무풍중형 WIFI 내장  HOME_MULTI      판넬,홈멀티
AR-EC05          1 무선리모컨(냉방전용)           HOME_MULTI      홈멀티
```

- category key가 칩을 준 모델: 2개(`HOME_MULTI` 2개)
- 품목명 패턴이 칩을 준 모델: 3개(실내기 1, 실외기 1, 판넬 1)
- 두 source가 겹친 모델: 1개(`PC1NWSK3NW`)
- 합집합: 4개

## 4. 미분류 원인

미분류 실 품목은 **31모델/2,139라인**이다. 원인은 다음처럼 수렴한다.

| 원인 | 모델 | 라인 | 판정 |
|---|---:|---:|---|
| product lookup 매칭 실패 | 0 | 0 | 실 품목 35모델 모두 exact match. trim-only도 0 |
| product `product_category` 결손 | 31 | 2,139 | 전부 null |
| 전표 라인 `category_key` 결손 | 31 | 2,139 | 해당 모델의 활성 라인 전부 null |
| 정본 품목명 패턴 불일치 | 31 | 2,139 | `실외기/실내기/판넬/패널` 문자열이 없음 |

여기서 마지막 세 행은 독립 합산 항목이 아니라 동일 31모델에 동시에 성립하는 원인 사슬이다.

대표 원문:

```text
model             lines product_name          product_category lineCats chips
AR07TXEAAWKNEU-03   117 삼성 윈드프리 7평형   (null)           (null)   (empty)
AR09TXEAAWKNEU-04   115 삼성 윈드프리 9평형   (null)           (null)   (empty)
AR16TXEAAWKNEU-08   114 삼성 윈드프리 16평형  (null)           (null)   (empty)
```

PM 정정에서 언급한 `category_id 보유`와 현재 칩의 `categoryKey`는 같은 값이 아니다. `products.category_id`는 스키마상 모든 product에 필수이며 위 품목들도 예컨대 `벽걸이형` category를 보유한다. 그러나 `ProductSummaryResponse.categoryKey`는 `category_id`가 아니라 nullable `products.product_category`에서 만들어진다. 실제 원문:

```text
    model_name     |        name         | product_category | category_name
-------------------+---------------------+------------------+--------------
 AR05TXEAAWKNEU-01 | 삼성 윈드프리 5평형 | (null)           | 벽걸이형
```

따라서 원인은 “product DB 매칭 0”이 아니다. **매칭은 성공하지만 칩이 읽는 `product_category`와 라인 `category_key`가 모두 비고, 정본 이름도 협소한 한글 substring 규칙에 걸리지 않는 것**이다.

## 5. `chips.size === 0 -> return true` 판정

**최종 선택으로는 부적합하며 BLOCK 사유다.**

실 품목 모델의 대부분(31/35, 88.57%)이 빈 칩이다. blanket 통과 후 칩별 결과는 다음과 같다.

| 선택 칩 | 반환 모델 | 실 품목 모델 대비 | 반환 라인 | 실 품목 라인 대비 |
|---|---:|---:|---:|---:|
| 실외기 | 32/35 | 91.43% | 2,140/2,143 | 99.86% |
| 실내기 | 32/35 | 91.43% | 2,140/2,143 | 99.86% |
| 홈멀티 | 33/35 | 94.29% | 2,141/2,143 | 99.91% |
| 싱글중대형 | 31/35 | 88.57% | 2,139/2,143 | 99.81% |
| 상업멀티 | 31/35 | 88.57% | 2,139/2,143 | 99.81% |
| 판넬 | 32/35 | 91.43% | 2,140/2,143 | 99.86% |

싱글중대형과 상업멀티에 실제로 매칭되는 실 품목은 0개인데도 각각 31모델/2,139라인을 반환한다. 이는 “근거 없는 소수 행을 보존”하는 결과가 아니라 선택 칩과 무관한 대부분의 행을 결과에 남기는 결과다.

현재 화면 기본 기간의 61행은 실 품목 분모가 0이므로 여섯 칩이 모두 61행을 반환한다. 전체 활성 실 품목으로 각도를 바꿔도 위 표처럼 결론은 바뀌지 않는다. 대부분이 미분류여서 현재 필터 자체가 무의미하다.

## 6. 차단되면 안 되는 것이 차단되는가

### 현재 실데이터에서 확인한 결과

**blanket fix 이후 새 false-negative는 확인하지 못했다.**

- 빈 칩 31모델은 `return true`로 여섯 칩 모두에서 보존된다.
- 분류된 4모델은 자기 칩에서 모두 통과한다.
- `PC1NWSK3NW`는 `판넬`과 `홈멀티` 양쪽에서 통과한다.
- exact product 매칭에 실패한 실 품목은 0이고, trim-only 매칭 실패도 0이다.
- 분류가 있는 행이 관계없는 칩에서 제외되는 것은 필터의 의도된 동작이다.

따라서 이번 실데이터 재생에서 “보여야 할 자기 칩에서 정상 행이 사라진다”는 별도 차단 결함은 입증되지 않았다. 차단 사유는 false-negative가 남아서가 아니라, 이를 피한 방식이 88.57%의 미분류 모델을 모든 칩에 노출하는 false-positive이기 때문이다.

### 코드상 경계

`InOutAnalysisPage.toRow`는 항상 계산된 `chips` Set을 행에 넣고, `filterInOutRows`는 그 Set을 그대로 사용한다. 빈 Set이면 blanket 통과하고, 하나라도 있으면 선택 칩과의 교집합만 통과한다. 현재 UI 경로에서 빈 Set이 다시 품목명/category로 재계산되지 않는 문제는 결과를 바꾸지 않는다. `toRow`에서 이미 같은 함수로 계산했기 때문이다.

## 7. 배포본 나이 확인

게이트웨이/공유 컨테이너의 500 또는 0건을 HEAD 결함으로 오판하지 않기 위해 실행 검증 전에 나이를 확인했다.

```text
product-service container created: 2026-07-31 23:25:25 +09:00
slip-service container created:    2026-08-02 13:30:03 +09:00
model_name lookup fix c633531db:   2026-08-02 13:36:08 +09:00
blanket fix 9c47d139b:             2026-08-02 19:30:51 +09:00
```

- product-service는 lookup fix보다 약 이틀 오래됐다.
- slip-service는 lookup fix보다 약 6분 먼저 만들어졌다.
- 둘 다 blanket fix를 포함하지 않는다.

따라서 공유 gateway/container 실호출은 HEAD 분류 커버리지의 증거로 사용하지 않았다. Docker 이미지는 재빌드하지 않았다. 이번 수치는 HEAD의 순수 분류 규칙을 현재 DB의 실제 행에 적용한 읽기 전용 결과다.

## 8. 이 라운드가 보지 않은 것

- standalone jar로 최신 product-service/slip-service를 별도 포트에 기동한 end-to-end HTTP 응답은 조사하지 않음. DB와 순수 분류 데이터 흐름만 검증했다.
- 공유 gateway/container의 500·0건은 배포본이 HEAD보다 오래되어 결함 판정에 사용하지 않음.
- Docker 이미지 재빌드·컨테이너 재시작은 하지 않음.
- DB write/DDL, 합성 데이터, mock, 테스트 fixture는 사용하지 않음.
- 레거시 내역의 월 차원, 추이·예측·Top/Bottom·추천 분석 구현은 조사하지 않음.
- 권한, 메뉴 active 상태, 이익률 계산, 모바일·웹 클라이언트는 조사하지 않음.
- 품목 정본의 `product_category`를 어떤 정책으로 채울지, category master를 여섯 칩에 어떻게 매핑할지는 설계·수정하지 않음.
- 동시 트랙이 만든 DB 스냅샷 변화의 생성 주체와 시간별 변경 이력은 조사하지 않음.

## 9. 새로 만든 파일

- `docs/dev-reports/2026-08-02-1012-r3-classification-coverage.md`

기존 파일은 수정하지 않았다. 코드 수정, commit, push, checkout, 브랜치 조작은 수행하지 않았다.
