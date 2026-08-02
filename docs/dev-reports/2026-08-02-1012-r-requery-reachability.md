# PR #1047 재수렴 적대검증 — 조회 키 fix 전체 표면

## 결론

**BLOCK**이다.

- 행 집계 자체는 현재 소스 기준으로 확정 원천 라인 82건을 모델 61행으로 보존한다. 82→61은 동일 모델 집계이므로 행 누락으로 세지 않는다.
- 그러나 화면에 실제로 들어가는 확정 모델 61개는 `products.model_name` 새 키로도 **0/61 매칭**이다. `slip_lines.category_key`도 0/61이고 품목명 보조 분류도 0/61이므로, 무필터 61행에서 여섯 칩 중 어느 하나를 선택하면 **61행 전부가 사라져 0행**이 된다. 조회 키 fix가 화면의 실 분류 도달성을 해소하지 못했다.
- 레거시 입출고 내역의 핵심 표현 데이터인 월 차원은 실 DB에 모델-월 79점(4개월)이 있지만 신규 응답·화면에는 월 필드가 없어 **79/79점이 표현되지 않는다**.
- 레거시 입출고 분석의 전년/당년 출고 추이, 수요예측, Top 3, Bottom 3, 추천·알림도 응답과 화면에 항목 자체가 없다. 이는 레이아웃 차이가 아니라 기능·표현 데이터 누락이다.
- 게이트웨이 실호출은 현재 500/0행이지만, product/slip 배포본이 fix보다 오래되어 신규 endpoint 자체가 없는 상태임을 먼저 확인했다. 이 500은 PR 코드 결함 건수에는 넣지 않았고, **fix 배포본의 게이트웨이 재검증은 미완료**로 판정한다.

## 1. fix와 이번 라운드가 본 표면

최근 15개 커밋에서 조회 키 fix는 다음 커밋이다.

```text
c633531db [FIX] #1012 조회 키를 model_name 으로 — 이카운트 계보 100건 구조적 누락 해소
947c56660 [FIX] #1012 eslint no-unused-expressions — 삼항을 문장으로 쓰던 것
6c030e14a Merge remote-tracking branch 'origin/main' into feat/1012-inout-analysis
...
4053b1f71 [FIX] #1012 bulk lookup fallback — 다만 46품목이 product DB 에 없다
```

`c633531db`가 건드린 표면은 다음과 같다.

1. slip-service `InOutAnalysisService`: `SlipLine.modelName` 수집, 100건 청크, 신규 `lookupByModelNames`, 응답 map의 `modelName` 키 사용.
2. slip-service `ProductClient`: 신규 `/products/internal/lookup-by-model-names`, `modelNames` body, 오류 시 fail-closed.
3. product-service controller/DTO/service: `model_name IN (...)` 정확일치, 요청 최대 100건, 활성 상품만 반환.
4. 집계 전 조회 범위: 상태 필터 전에 기간 내 INBOUND/OUTBOUND 전표 라인 전체를 lookup하고, 이후 확정 상태만 화면 행으로 집계한다.
5. FE 소비 표면: product 매칭 결과의 `categoryKey`와 품목명으로 여섯 칩을 만들고, 칩 선택 시 OR 필터한다.
6. 레거시 완전계승 표면: 입출고 내역(19)의 월별 입·출고 값, 입출고 분석(20)의 추이·예측·순위·추천 값.

## 2. 배포본 나이와 게이트웨이 실호출

요청대로 404/0건을 결함으로 세기 전에 컨테이너 생성시각을 확인했다.

```text
samhan-slip-service|2026-08-02T04:30:03.970155657Z|infrastructure-slip-service
samhan-api-gateway|2026-07-31T15:15:50.070347996Z|infrastructure-api-gateway
samhan-product-service|2026-07-31T14:25:25.972348444Z|infrastructure-product-service
samhan-postgres|2026-07-26T16:08:22.576572053Z|postgres:16-alpine
```

fix 커밋 시각은 `2026-08-02 13:36:08 +0900`이다. product-service는 fix보다 약 이틀 오래됐고 slip-service도 fix 커밋 6분 전 생성본이다.

게이트웨이 로그인과 조회 원문:

```text
LOGIN_HTTP=200 token_present=True
HTTP_ERROR=500
```

slip-service 로그:

```text
org.springframework.web.servlet.resource.NoResourceFoundException:
No static resource slips/query/inout-analysis.
```

배포 product-service의 신규/기존 internal endpoint 비교:

```text
/products/internal/lookup-by-model-names HTTP=500 BODY=
/products/internal/lookup-by-model-codes HTTP=200 BODY={"success":true,...,"data":[]...}
```

따라서 현재 게이트웨이에서 실제 보이는 행은 0건이지만, 원인은 fix 배포본 부재다. 이를 신규 코드의 BLOCK으로 세지 않는다. 다만 CI 42건 green만으로는 fix의 게이트웨이 도달성이 재검증됐다고 할 수 없다.

## 3. 원천 행 수 ↔ 화면 행 수

기간은 화면 기본값과 같은 `2026-01-01`~`2026-12-31`, 상태는 코드와 같은 `CONFIRMED/DELIVERED/COMPLETED`, soft-delete 제외다. 모든 SQL은 `BEGIN READ ONLY`와 `ROLLBACK`으로 실행했다.

### 3.1 통합 화면의 원천과 집계

```text
lookup_scope_line_rows | lookup_scope_distinct_trimmed | confirmed_source_line_rows | screen_group_rows_exact_key | null_or_empty | surrounding_space_rows | max_model_name_len | over_100_rows
-----------------------+-------------------------------+----------------------------+-----------------------------+---------------+------------------------+--------------------+--------------
                  2776 |                           138 |                         82 |                          61 |             0 |                      0 |                 17 |             0
```

```text
slip_type | source_line_rows | grouped_screen_rows | quantity
----------+------------------+---------------------+---------
INBOUND   |               20 |                  20 |      122
OUTBOUND  |               62 |                  46 |      344
```

- product lookup 입력 표면: 2,776라인, 서로 다른 trim 모델명 138개, 100+38의 두 청크.
- 실제 화면 집계 표면: 확정 원천 82라인 → 동일 모델별 61행.
- null/빈 모델명 0, 앞뒤 공백 0, 100자 초과 0이므로 이번 실 DB에는 DTO 길이·trim 경계로 차단되는 행이 없다.
- 코드상 입출고 내역(19)과 분석(20)은 별도 응답/화면이 아니라 동일 `/inventory/inout-analysis` 한 화면과 동일 61행을 쓴다.

### 3.2 새 키 매칭 — 전체 lookup 범위와 실제 화면 범위가 다르다

상태 필터 전 전체 lookup 범위:

```text
requested | new_key_matched | new_key_unmatched | old_key_matched | matched_products_with_null_old_key | category_filled | ambiguous
----------+-----------------+-------------------+-----------------+------------------------------------+-----------------+----------
      138 |              35 |               103 |               4 |                                 31 |               4 |         0
```

실제 화면에 들어가는 확정 모델만 제한한 결과:

```text
requested | new_key_matched | new_key_unmatched | old_key_matched | matched_products_with_null_old_key | category_filled | ambiguous
----------+-----------------+-------------------+-----------------+------------------------------------+-----------------+----------
       61 |               0 |                61 |               0 |                                  0 |               0 |         0
```

즉 새 키는 상태 필터 전에 조회되는 비확정 전표 모델 35개에는 닿지만, 화면 61행에는 한 건도 닿지 않는다. fix 보고서의 단건 상품 조회 성공을 화면 도달 성공으로 일반화할 수 없다.

### 3.3 fix 이전에 저장된 기존 행

확정 화면 원천은 전부 fix 이전 행이다.

```text
confirmed_lines | pre_fix_lines | pre_fix_distinct_names | oldest                     | newest
----------------+---------------+------------------------+----------------------------+---------------------------
             82 |            82 |                     61 | 2026-05-09 16:59:33.426485 | 2026-05-09 16:59:33.88205
```

이 82개 구 저장행은 slip 집계에서는 61행으로 남지만 product 새 키 조회는 0/61이다. 따라서 “구 저장행이 새 키로 조회되어 product 분류를 얻는가”의 답은 **아니다**.

반면 `model_code IS NULL`인 이카운트 상품 계보 자체는 실제로 존재한다.

```text
active_products | old_key_null_products | new_key_available
----------------+-----------------------+------------------
           1220 |                   100 |               100
```

실제 값:

```text
model_name        | model_code | name             | product_category | created_at
------------------+------------+------------------+------------------+----------------------------
AC1000CNCDEH-85   | NULL       | 삼성 천장형 20톤 | NULL             | 2026-05-31 00:45:23.710294
```

이 모델의 기존 slip 행도 새로 만든 데이터가 아니다.

```text
model_name        | status | slip_type | line_rows | min_date   | max_date
------------------+--------+-----------+-----------+------------+-----------
AC1000CNCDEH-85   | DRAFT  | INBOUND   |         4 | 2026-07-17 | 2026-07-17
AC1000CNCDEH-85   | DRAFT  | OUTBOUND  |        73 | 2026-07-16 | 2026-07-18
```

이 77라인은 새 키 exact match 대상이지만 `DRAFT`라 화면에서 제외되는 것이 정상이다. 전체 lookup 범위에서 새 키가 살린 `model_code NULL` 상품은 31개지만, 확정 화면 범위에서는 0개다.

## 4. 실제 값으로 재현한 차단

### 결함 R-01 — 여섯 칩이 정상 61행을 전부 차단한다 (BLOCK)

확정 61모델의 분류 근거:

```text
rows | outdoor_name | indoor_name | panel_name | category_rows
-----+--------------+-------------+------------+--------------
  61 |            0 |           0 |          0 |             0
```

product 새 키 매칭도 0/61이므로 `HOME_MULTI/SINGLE_SET/COMMERCIAL_MULTI`도 공급되지 않는다. FE `modelChips` 규칙에 따라 여섯 칩 카운트는 전부 0이고, 어떤 칩이든 선택하면 무필터 61행이 0행이 된다.

실제 행 예:

```text
model_name        | product_name                 | category_key | inbound_qty | outbound_qty | source_lines
------------------+------------------------------+--------------+-------------+--------------+-------------
TEST-MODEL-0001   | 테스트제품-TEST-MODEL-0001  | NULL         | NULL        |            5 |            1
TEST-MODEL-0073   | 테스트제품-TEST-MODEL-0073  | NULL         |           7 |           10 |            3
TEST-MODEL-0100   | 테스트제품-TEST-MODEL-0100  | NULL         | NULL        |            8 |            1
```

위 세 행을 포함한 61행은 무필터에서는 나와야 하지만 `실외기/실내기/홈멀티/싱글중대형/상업멀티/판넬` 어느 칩에도 속하지 않아 전부 차단된다. 조회 키 fix의 목적인 분류 도달성이 실 화면 데이터에서는 해소되지 않았다.

### 결함 R-02 — 입출고 내역(19)의 월별 표현 데이터 79점이 사라진다 (BLOCK)

실 DB의 월 차원:

```text
source_lines | model_rows | actual_model_month_points | active_months
-------------+------------+---------------------------+--------------
          82 |         61 |                        79 |             4
```

```text
month   | source_lines | models | inbound_qty | outbound_qty
--------+--------------+--------+-------------+-------------
2026-01 |            7 |      7 |        NULL |           27
2026-02 |           48 |     45 |        NULL |          268
2026-03 |            7 |      7 |        NULL |           49
2026-04 |           20 |     20 |         122 |         NULL
```

레거시 내역은 모델별 `YYYYMM` 입고·출고를 표현한다. 현재 API DTO는 모델 총 입고/출고만 반환하고 월 필드가 없으므로 79개 모델-월 값 중 월별로 표현되는 값은 0개다. 합계 61행이 나온다는 사실로 월별 완전계승을 충족할 수 없다.

### 결함 R-03 — 입출고 분석(20)의 표현 항목이 없다 (BLOCK)

레거시 GAS 원문은 다음 값을 계산·표현한다.

- 작년 출고 12개월, 올해 출고 12개월, 수요예측 12슬롯.
- 출고 합계 Top 3, Bottom 3.
- 최상위 모델의 입고-출고 잔여량 기반 `발주 권장/주력 상품`과 전년 동기 대비 수요 상승 알림.
- 모델 검색과 분류 필터.

현재 `InOutAnalysisResponse`와 `InOutAnalysisPage`에는 위 연도별 월 배열, 예측값, 순위, 추천값, 모델 검색값이 모두 0개다. 현재 DB 행에 레거시 분석의 6개 접두사·길이·실내기 규칙을 적용하면 대상도 `eligible_lines=0`, `eligible_models=0`이다. 즉 새 화면의 61행 합계/이익률은 추가 기능일 뿐, 레거시 분석의 기능·표현 데이터를 대신하지 않는다.

이 판정은 화면 모양이 다르기 때문이 아니라 응답과 화면에 필요한 값 자체가 없기 때문이다.

## 5. 레거시 GAS와 값 비교

정적 원문 기준 차이는 확정할 수 있다.

| 레거시 표현 데이터 | 현재 | 판정 |
|---|---:|---|
| 내역 모델별 월 입고/출고 | 실 DB 79 모델-월점 중 응답 월점 0 | 미계승 |
| 분석 전년/당년 월별 출고 | 필드 0 | 미계승 |
| 분석 수요예측 | 필드 0 | 미계승 |
| Top 3 / Bottom 3 | 항목 0 / 0 | 미계승 |
| 추천·알림 | 항목 0 | 미계승 |
| 모델 검색 | 입력·필터 0 | 미계승 |
| 모델별 총 입고/출고·매입/판매·이익 | 61행 | 신규/확장 기능 |

레거시가 읽는 Google Drive의 `이카운트입출고내역.xlsx`와 출고/입고 CSV 실파일은 저장소에 없고 이번 지시는 외부 쓰기·합성 데이터를 금지한다. 따라서 **레거시 실파일의 현재 행 수와 현 DB의 값 단위 동일성은 조사하지 않음**으로 남긴다. 소스가 서로 다른 상태에서 숫자를 만들어 동등하다고 주장하지 않았다.

## 6. 최종 판정

**BLOCK**.

1. fix 이전 확정행 82건/61모델은 새 product 키로 0건 매칭된다. 행 자체는 fallback 집계로 남지만 분류가 전건 미해소다.
2. 이 결과 여섯 칩 선택 시 나와야 할 61행이 전부 0행이 된다.
3. 입출고 내역의 실 모델-월 79점이 응답에서 월 차원을 잃는다.
4. 입출고 분석의 추이·예측·순위·추천 값이 구현되어 있지 않아 완전계승 기준을 충족하지 않는다.
5. fix가 포함된 product/slip 배포본의 게이트웨이 검증은 아직 이루어지지 않았다. 현재 500은 오래된 배포본 때문이므로 별도 결함으로 중복 집계하지 않는다.

## 7. 이 라운드가 보지 않은 것

- fix 커밋이 포함된 product-service와 slip-service를 배포한 뒤 게이트웨이 `:8080`에서의 실제 200/61행: Docker 이미지 재빌드 금지 때문에 조사하지 않음.
- Electron 실제 DOM/픽셀에서 61행과 칩 카운트를 읽는 GUI QA: backend 배포본이 없어 조사하지 않음.
- Google Drive의 레거시 XLSX/CSV 실파일 현재 행 수와 값: 저장소·로컬에 원본 데이터가 없어 조사하지 않음.
- 2025 레거시 실데이터와 2026 실데이터의 예측값 정확성: 원본 부재 및 현 구현 항목 부재로 조사하지 않음.
- 모바일/웹 클라이언트: PR의 데스크톱 입출고 화면 범위 밖이라 조사하지 않음.
- 코드 수정, 테스트 데이터 생성, DB 쓰기, Docker 재빌드·재기동은 수행하지 않음.

## 8. 새로 만든 파일

- `docs/dev-reports/2026-08-02-1012-r-requery-reachability.md`
