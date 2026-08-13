# PR #1126 R12 — 리모컨 누적·golden 경계·단가 판정

## 판정

R12 범위의 ①은 golden 하네스 경계를 정본 함수에 맞췄고, golden 기대값은 수정하지 않았다. ②의 원인은 R11 직전 리모컨 계산의 누적 대입과 0 초기화 부재였으며, 현재 HEAD(R11)에 이미 두 보정이 들어 있다. R12 실측에서 정상 증가·감소와 재계산 불변식을 확인했다. ③은 두 품목 모두 카탈로그 기준가 없음으로 판정한다. 금액 계산 경로는 고치지 않았다.

## ① golden RED → GREEN

fix 전 하네스에서 정본 `index.ejs`의 `recomputeHomeDerived()`가 호출하는 `recomputeHomeHoses_()`를 boundary가 추출하지 않아 발생한 원문:

```text
FAIL test/legacy-quantity-golden.test.js
Tests: 24 failed, 49 passed, 73 total
ReferenceError: recomputeHomeHoses_ is not defined
```

원인과 수정:

- 원인: `clients/web/legacy-quantity-golden/legacyQuantityBoundary.js`의 `runHome()` 함수 bundle에 `recomputeHomeHoses_`와 `applyServerHomeQuantitySync_`가 없었다.
- 수정: 정본 함수 두 개를 bundle에 추가하고, 하네스 컨텍스트에 `evaluateQuantitySyncRules`와 `HOME_QUANTITY_SYNC_RULES`를 주입했다.
- 기대값 `goldens.js`는 변경하지 않았다.

GREEN 원문:

```text
PASS test/legacy-quantity-golden.test.js
Tests: 73 passed, 73 total
```

## ② 리모컨 누적 원인 확정

R11 직전의 두 결함 지점은 다음이다.

- `clients/web/estimate-app/views/index.ejs:8257` — `homeQty.set(m, (homeQty.get(m) || 0) + q)`로 이전 계산값에 `+=` 누적.
- `clients/web/estimate-app/views/index.ejs:8237` — 계산 대상 리모컨을 매번 0으로 초기화하지 않으면 위 누적이 남음.

R11 현재 코드는 이를 다음처럼 고쳤다.

- `8237`: 비수동 리모컨 target을 `homeQty.set(r.model, 0)`으로 초기화.
- `8257`, `8277`: 임시 `wantedRemotes` Map에 계산값을 모은 뒤 한 번 대입.

fix 전 변이 실측 원문(동일 화면):

```text
[R12 accumulation] {"at2":[{"model":"AR-EC05","qty":2}],"at4After2":[{"model":"AR-EC05","qty":6}],"at4Direct":[{"model":"AR-EC05","qty":10}]}
```

이 변이에서 하드게이트는 `at4After2 !== at4Direct`로 실패했다. 별도 fresh 화면 기준으로 읽어야 하는 요구값인 0→2→4의 중간 결과는 `2 → 6`으로, 개발책임자 제공 원문 `2 → 6`과 일치한다.

## R12 라이브 대조

표본 `AM052BN6PBH1`, 같은 화면에서 연속 입력. 다섯 품목군 중 0이 아닌 행을 합산했다.

| 경로 | 판넬 | 호스 | 분기관 | 발통 | 리모컨 |
|---|---:|---:|---:|---:|---:|
| 0→2 | 2 | 2 | 0 | 0 | 2 |
| 0→2→4 최종 | 2 | 2 | 0 | 0 | 4 |
| 0→4 한 번 | 2 | 2 | 0 | 0 | 4 |

실 원문:

```text
[R12 accumulation] {"at2":[{"model":"AR-EC05","qty":2}],"at4After2":[{"model":"AR-EC05","qty":4}],"at4Direct":[{"model":"AR-EC05","qty":4}]}
[R12 hard-gate] unexpected=0
```

캡처: [01-0-2-4-vs-0-4.png](/C:/dev/Samhan-Public/.claude/worktrees/t1126/docs/qa/2026-08-10-896-r12/01-0-2-4-vs-0-4.png)

## ③ FH-LFHIF·발통 금액 0 판정

결론은 **계산 결함이 아니라 카탈로그 기준가 없음**이다. 금액 계산은 `unitPrice × quantity` 경로를 정상 통과한다.

카탈로그 SELECT에 해당하는 기존 실 검증 원문:

```text
FAIL|n=209|kind=singleSet|model=FH-LFHIF|stage=confirm|status=500|class=fail-closed-zero-basis|raw={"success":false,"code":"INTERNAL_ERROR","message":"확정 가격 기준가 없음: FH-LFHIF","data":null}
FAIL|n=337|kind=singleSet|model=발통세트|stage=confirm|status=500|class=fail-closed-zero-basis|raw={"success":false,"code":"INTERNAL_ERROR","message":"확정 가격 기준가 없음: 발통세트","data":null}
```

```text
DB_QUERY_OUTPUT_BEGIN
 target_kind | db_rows | nonzero_rows | zero_rows | null_rows
------------+----------+--------------+-----------+----------
 fixedDc     | 144      | 144          | 0         | 0
 singleSet   | 193      | 193          | 0         | 0
DB_QUERY_OUTPUT_END
```

출처: `docs/dev-reports/2026-07-29-985-r4-price-base-parity-verification.md:149-160,178-192`. 해당 검증의 `singleSet` 4행은 기준가 없음으로 fail-closed 되었고, 0원 저장은 없었다. R11 실 화면에서도 `FH-LFHIF 2 / 0`, `발통세트 2 / 0`이 같은 이유로 관찰되었다.

## RED-C R11 옵션 6개 표 보존

R11 표본 `AM052BN6PBH1` 수량 2의 최종 확인값:

| 옵션 | 결과 |
|---|---|
| 리모컨 기본 | AR-EC05 `2 / 27,830` |
| 유연호스 제외 | `0 / 0` |
| 유연호스 I형 | FH-LFHIF `2 / 0`, L형 `0` |
| 분기관 제외 | `0 / 0` |
| 발통 포함 | `2 / 0` |
| 판넬 제외 / 공청 | 제외 `0 / 0`, 공청 PC6NUCK1NW `2 / 1,113,200` |

R11 캡처·표는 수정하지 않았다.

## RED-D/E 및 검증

```text
PASS legacy-quantity-golden.test.js
Tests: 73 passed, 73 total

PASS quantity-sync.test.js
Test Suites: 2 passed, 2 total
Tests: 81 passed, 81 total

PASS estimate-app 전체
Test Suites: 14 passed, 14 total
Tests: 207 passed, 207 total

PASS R12 accumulation real QA
1 passed
[R12 hard-gate] unexpected=0
```

규칙 0건 golden exact diff는 73/73이며, 규칙 소비 경계·비상품 납품가 수량 1·`multiselect-chip-count` 하위호환·`#1133` 품목 상태 축은 건드리지 않았다.

## 신규 파일

- `clients/desktop/playwright/896-r12-accumulation-real-qa/896-r12-accumulation-real-qa.spec.ts`
- `clients/desktop/playwright/896-r12-accumulation-real-qa/playwright.config.ts`
- `docs/qa/2026-08-10-896-r12/01-0-2-4-vs-0-4.png`
- 본 보고서

## 못 한 것 / 범위 밖

- 주문서 규칙 소비 경로·옵션 평가기·45계열 이관은 지시대로 건드리지 않았다.
- FH-LFHIF·발통세트의 단가를 임의로 보정하지 않았다. 단가 등록은 별도 데이터 작업이다.
- 공유 DB write, `tools/legacy-gas/**`, main 병합, commit/push는 하지 않았다.
- 보고서·캡처·로그에 자격 증명을 남기지 않았다.
