# PR #1047 / Issue #1012 R5 — R4 postfix 재수렴 리뷰

## 판정

**PASS — 이번 R4 새 표면에서 머지를 차단할 결함을 확인하지 못했다.**

- 실 데이터에서 분류 근거가 있는 4행은 각자의 칩에서 모두 반환된다. 자기 칩 누락은 **0/5 memberships**다. `PC1NWSK3NW`가 `판넬`과 `홈멀티` 두 칩에 속하므로 membership은 5개다.
- 화면 기본 기간·상태의 원천 **82라인 → 모델 집계 61행**이 유지되고, 무필터도 **61행**을 반환한다.
- 기본 기간의 61행은 전부 분류 근거가 없으며 `미분류`에서 **61/61행** 반환된다. 분류된 행 혼입은 **0행**이다.
- 분류된 실 4행만 재생하면 `미분류` 반환은 **0/4행**이다.

분류된 실 4행은 현재 모두 `SENT` 상태라 화면 집계 상태인 `CONFIRMED`, `DELIVERED`, `COMPLETED`에는 포함되지 않는다. 따라서 “분류된 4행의 자기 칩 보존”은 현재 DB의 실 품목 값에 HEAD의 실제 `modelChips`/`filterInOutRows` 함수를 직접 적용해 검증했고, “현재 화면 모집단의 행 수·칩별 건수”는 별도로 82라인/61행 모집단에 적용했다. 서로 다른 모집단을 섞어 화면에 4행이 보인다고 주장하지 않는다.

## 1. 기준 상태와 배포본 나이

- 조사일: 2026-08-02 KST
- 브랜치: `feat/1012-inout-analysis`
- HEAD: `265701c678e60d0d584fe40f9e646f3cd8c70900`
- DB 세션: `PGOPTIONS="-c default_transaction_read_only=on"`
- DB write/DDL, 합성 데이터, Docker 이미지 재빌드·컨테이너 재시작: 없음

실행 원문:

```text
HEAD=265701c678e60d0d584fe40f9e646f3cd8c70900
HEAD_COMMIT_TIME=2026-08-02T20:56:34+09:00
/samhan-slip-service|2026-08-02T04:30:03.970155657Z|infrastructure-slip-service
/samhan-product-service|2026-07-31T14:25:25.972348444Z|infrastructure-product-service
```

`slip-service` 생성 시각 `04:30:03Z`는 KST `13:30:03`, `product-service`는 KST `2026-07-31 23:25:25`다. 둘 다 R4 HEAD 커밋 시각 `20:56:34 KST`보다 오래됐다. 공유 API의 구 endpoint/500 또는 화면 0건은 R4 결함 증거로 사용하지 않았고 이미지도 재빌드하지 않았다.

## 2. 각도 1 — 분류된 실 4행이 자기 칩에서 보이는가

### 2.1 실 DB 원천

전표 상태·기간 원문:

```text
  model_name  | slip_type | status | lines |  min_date  |  max_date  
--------------+-----------+--------+-------+------------+------------
 AC023CN1DBC1 | OUTBOUND  | SENT   |     1 | 2026-05-20 | 2026-05-20
 AC023CX1DBC1 | OUTBOUND  | SENT   |     1 | 2026-05-20 | 2026-05-20
 AR-EC05      | OUTBOUND  | SENT   |     1 | 2026-05-20 | 2026-05-20
 PC1NWSK3NW   | OUTBOUND  | SENT   |     1 | 2026-05-20 | 2026-05-20
(4 rows)
```

활성 product 정본 원문:

```text
  model_name  |             name             | product_category | is_deleted | status 
--------------+------------------------------+------------------+------------+--------
 AC023CN1DBC1 | 무풍 1way 냉방전용 실내기    | SINGLE_PART      | f          | ACTIVE
 AC023CX1DBC1 | 무풍 1way 냉방전용 실외기    | SINGLE_PART      | f          | ACTIVE
 AR-EC05      | 무선리모컨(냉방전용)         | HOME_MULTI       | f          | ACTIVE
 PC1NWSK3NW   | 판넬 1way 무풍중형 WIFI 내장 | HOME_MULTI       | f          | ACTIVE
(4 rows)
```

### 2.2 HEAD 함수 직접 재생

현재 DB에서 읽은 위 product 행을 입력으로 사용했다. `inoutAnalysisModel.ts`를 TypeScript `transpileModule`로 메모리에서 변환한 뒤, HEAD의 `modelChips`와 `filterInOutRows`를 그대로 호출했다. 파일·fixture·합성 행은 만들지 않았다.

실행 원문:

```text
CLASSIFIED_ROWS=4
CLASSIFIED AC023CN1DBC1 chips=실내기 own=실내기:true in_미분류=false
CLASSIFIED AC023CX1DBC1 chips=실외기 own=실외기:true in_미분류=false
CLASSIFIED AR-EC05 chips=홈멀티 own=홈멀티:true in_미분류=false
CLASSIFIED PC1NWSK3NW chips=판넬+홈멀티 own=판넬:true,홈멀티:true in_미분류=false
HEAD_FILTER_CLASSIFIED4_실외기=1
HEAD_FILTER_CLASSIFIED4_실내기=1
HEAD_FILTER_CLASSIFIED4_홈멀티=2
HEAD_FILTER_CLASSIFIED4_싱글중대형=0
HEAD_FILTER_CLASSIFIED4_상업멀티=0
HEAD_FILTER_CLASSIFIED4_판넬=1
HEAD_FILTER_CLASSIFIED4_미분류=0
```

| 실 데이터 행 | 계산된 칩 | 자기 칩 반환 | `미분류` 반환 |
|---|---|---:|---:|
| `AC023CN1DBC1` | 실내기 | 예 | 아니오 |
| `AC023CX1DBC1` | 실외기 | 예 | 아니오 |
| `AR-EC05` | 홈멀티 | 예 | 아니오 |
| `PC1NWSK3NW` | 판넬, 홈멀티 | 둘 다 예 | 아니오 |

판정: 분류된 4행의 자기 칩 false-negative는 **0행**이다.

## 3. 각도 2 — 무필터 82라인 → 61행 보존

화면 기본 기간 `2026-01-01`~`2026-12-31`, 화면 상태 `CONFIRMED/DELIVERED/COMPLETED`, 활성 slip/line 조건을 적용했다.

DB 집계 원문:

```text
 eligible_lines | eligible_models 
----------------+-----------------
             82 |              61
(1 row)
```

HEAD 함수 재생 원문:

```text
SOURCE_DEFAULT_LINES=82 SOURCE_DEFAULT_GROUPED_ROWS=61
HEAD_FILTER_DEFAULT_UNFILTERED=61
```

`selectedChips.size === 0` 경로는 집계된 61행을 그대로 반환했다. R4 전후 기준인 **82라인 → 61행**은 변하지 않았다.

## 4. 각도 3 — `미분류`가 미분류 행만 반환하는가

기본 기간 61모델은 product 정본 매칭이 없고 라인 `category_key`도 모두 null이며 품목명 패턴 분류도 없다. 같은 모집단에서 모델별 품목명·category source의 변동 여부도 확인했다.

```text
 models | multi_product_name | multi_category_key | any_category_key 
--------+--------------------+--------------------+------------------
     61 |                  0 |                  0 |                0
(1 row)
```

HEAD의 `MODEL_CHIPS`에서 마지막 상수인 `미분류`를 선택해 재생한 원문:

```text
MI_CHIP_FROM_HEAD=미분류
DEFAULT_UNFILTERED=61
DEFAULT_MI_RETURNED=61
DEFAULT_MI_CLASSIFIED_CONTAMINATION=0
CLASSIFIED4_MI_RETURNED=0
```

- 기본 기간: 미분류 61행 중 반환 61행, 분류행 혼입 0행.
- 분류 실데이터 4행: `미분류` 반환 0행.

판정: `미분류`는 확인한 두 실 모집단에서 분류 근거 없는 행만 반환한다.

## 5. 각도 4 — 칩별 반환 건수

### 5.1 현재 화면 기본 모집단 대비

| 칩 | 반환 행 | 무필터 61행 대비 |
|---|---:|---:|
| 무필터 | 61 | 100.00% |
| 실외기 | 0 | 0.00% |
| 실내기 | 0 | 0.00% |
| 홈멀티 | 0 | 0.00% |
| 싱글중대형 | 0 | 0.00% |
| 상업멀티 | 0 | 0.00% |
| 판넬 | 0 | 0.00% |
| 미분류 | 61 | 100.00% |

실행 원문:

```text
HEAD_FILTER_DEFAULT_UNFILTERED=61
HEAD_FILTER_DEFAULT_실외기=0
HEAD_FILTER_DEFAULT_실내기=0
HEAD_FILTER_DEFAULT_홈멀티=0
HEAD_FILTER_DEFAULT_싱글중대형=0
HEAD_FILTER_DEFAULT_상업멀티=0
HEAD_FILTER_DEFAULT_판넬=0
HEAD_FILTER_DEFAULT_미분류=61
```

### 5.2 분류된 실 4행 대비

| 칩 | 반환 행 | 분류된 실 4행 대비 |
|---|---:|---:|
| 무필터 | 4 | 100.00% |
| 실외기 | 1 | 25.00% |
| 실내기 | 1 | 25.00% |
| 홈멀티 | 2 | 50.00% |
| 싱글중대형 | 0 | 0.00% |
| 상업멀티 | 0 | 0.00% |
| 판넬 | 1 | 25.00% |
| 미분류 | 0 | 0.00% |

`PC1NWSK3NW`가 복수 칩이므로 칩별 반환 합계는 5지만 고유 행은 4다.

## 6. 레거시 미계승 이월 2건 재확인 — 결함 미산입

요청대로 재확인만 했고 이번 R5 결함으로 세지 않았다.

월 차원 원천:

```text
 model_month_points | months 
--------------------+--------
                 79 |      4
(1 row)
```

현 응답·화면의 월 필드 검색 원문:

```text
RESPONSE_MONTH_FIELD_HITS=0
PAGE_MONTH_FIELD_HITS=0
```

분석(20) 계승 항목에 해당하는 전년/당년·추이·수요예측·Top/Bottom·추천·알림의 화면 의미 요소 검색 원문:

```text
PAGE_SEMANTIC_ANALYSIS_HITS=0
```

재확인 결과는 기존과 같다: 월 차원은 **0/79점 표현**, 분석(20) 계승 항목은 **0건**이다. 둘 다 이 라운드 범위 밖이며 판정의 결함 수에는 포함하지 않았다.

## 7. 재현 절차 요약

1. `git show -s`와 `docker inspect`로 HEAD와 공유 배포본 생성 시각을 비교했다.
2. `PGOPTIONS="-c default_transaction_read_only=on"`을 강제한 `psql`로 기본 기간의 원천 82라인/61모델과 분류된 실 4행의 상태·product 정본을 읽었다.
3. DB 결과를 환경변수의 JSON으로 메모리에 전달했다.
4. HEAD의 `inoutAnalysisModel.ts`를 TypeScript API로 메모리 변환하고 실제 `modelChips`/`filterInOutRows`를 호출했다.
5. 무필터·7개 칩의 반환 수, 분류 4행의 자기 칩 membership, `미분류` 오염 수를 출력했다.
6. 대상 Vitest를 별도로 재실행해 7/7 통과를 확인했다.

```text
Test Files  1 passed (1)
Tests       7 passed (7)
Duration    665ms
```

초기 재생 시도 1회는 PowerShell이 SQL의 quoted alias를 분해해 PostgreSQL에서 `unterminated quoted identifier`로 실행 전 실패했다. 그 출력은 측정 근거에서 제외했다. SQL alias를 `json_build_object`로 바꾼 뒤 위 원문을 얻었으며 DB·파일 변경은 없었다. 또한 첫 성공 출력의 직접 한글 리터럴 한 줄은 PowerShell→Node 파이프 인코딩으로 깨져 `DEFAULT_MI_RETURNED=0`이라는 무효 결과를 냈다. 이를 HEAD의 `MODEL_CHIPS.at(-1)` 값으로 재실행한 최종 원문이 `MI_CHIP_FROM_HEAD=미분류`, `DEFAULT_MI_RETURNED=61`, 오염 0이다. 보고서의 판정과 표는 재실행 결과만 사용했다.

## 8. 이 라운드가 보지 않은 것

- R4 HEAD가 반영된 공유 `slip-service`/`product-service`와 최신 렌더러의 end-to-end 화면은 보지 않았다. 공유 배포본이 HEAD보다 오래됐고 Docker 이미지 재빌드가 금지되어 있기 때문이다. API JSON을 화면 증거로 대체하지 않았다.
- 분류된 실 4행이 `SENT`에서 화면 포함 상태로 실제 전이되는 운영 시나리오는 조사하지 않았다. DB write 금지 때문에 상태를 변경하지 않았다.
- 레거시 월 차원 0/79와 분석(20) 항목 0건은 재확인만 했고 원인·구현 대안·결함 판정을 조사하지 않았다.
- 권한, 메뉴 active 상태, 이익률, 월별 추이, 예측, Top/Bottom, 추천·알림, 모바일·웹 클라이언트는 조사하지 않았다.
- 대상 `inoutAnalysisModel.test.ts` 7개는 재실행했지만 `npm test` 전체와 `npm run typecheck` 전체는 R4 직전 결과를 재인용하지 않았고 이번 라운드에서는 조사하지 않았다. 이번 판정은 실 DB 재생, HEAD 필터 함수 직접 실행, 대상 7개 테스트에 한정한다.
- DB write/DDL, 합성 데이터, mock/fixture, Docker 이미지 재빌드, 컨테이너 재시작은 수행하지 않았다.

## 9. 새 파일 경로 목록

- `docs/dev-reports/2026-08-02-1012-r5-postfix-reconvergence.md`

이번 라운드에서 새로 만든 파일은 위 보고서 1개다. 기존 보고서는 수정하지 않았다.
