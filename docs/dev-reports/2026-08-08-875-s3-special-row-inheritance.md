# #875 S3 특수행 계승 구현 보고서

작성일: 2026-08-08  
범위: 웹 종합견적서 특수행(`운임`·`절삭`)의 DB 상품 계승, 0원 행 보존, 자동 절삭행 출처 분리

## 1. 구현 전 현행 좌표 전수 조사

적용 대상은 `clients/web/estimate-app/views/index.ejs`의 종합견적서 흐름이다. `clients/desktop/src/renderer/routes/EstimateFormPage.tsx`에는 현재 `handleFreightInput`·`applyCutoffLogic`·특수행 전용 state가 없으므로 이번 S3에서 동작을 재작성하지 않는다.

| 파일:줄 | 단계 | 현행 역할 | 이름·모델만으로 키를 만드는가 | 이번에 고치는가 |
|---|---|---|---|---|
| `clients/web/estimate-app/views/index.ejs:2304` | sync/state | 구형 상품 수량 `oldQty` Map 초기화 | Y — `model` 단독 | Y — 출처 포함 특수행 row metadata와 함께 유지 |
| `clients/web/estimate-app/views/index.ejs:2621~2624` | sync/state | 카테고리별 사용자 단가 Map | Y — `model`/`id` 단독 | Y — 특수행 단가 state의 출처를 row metadata로 운반 |
| `clients/web/estimate-app/views/index.ejs:4512~4514` | sync/state | 홈/싱글/상업 수량 Map | Y — `model`/`id` 단독 | Y — 특수행 q=0/1 semantics 적용 |
| `clients/web/estimate-app/views/index.ejs:5761~5883` | 화면/sync | 홈 특수행 렌더 및 `handleFreightInput` 연결 | Y — 특수행 model 단독 | Y |
| `clients/web/estimate-app/views/index.ejs:6257~6362` | 화면/sync | 싱글 특수행 렌더 및 전용 금액 input 연결 | Y — 싱글 id 단독 | Y |
| `clients/web/estimate-app/views/index.ejs:6782~6894` | 화면/sync | 상업 특수행 렌더 및 전용 금액 input 연결 | Y — model 단독 | Y |
| `clients/web/estimate-app/views/index.ejs:7402~7491` | 화면/sync | 구형 특수행 렌더 및 전용 금액 input 연결 | Y — model 단독 | Y |
| `clients/web/estimate-app/views/index.ejs:4248~4252` | 계산 | 홈/싱글/상업 합계의 `price × quantity` 경로 | N | Y — q=0은 0, q=1은 실제 금액 반영 |
| `clients/web/estimate-app/views/index.ejs:9590` | 계산 | 미리보기/전송 전 `applyCutoffLogic(rows)` 호출 | N | Y — 자동행을 별도 출처로 생성 |
| `clients/web/estimate-app/views/index.ejs:16617~16655` | 계산 | 합계 절삭 자동행 생성 | N — 대상행 속성만 검사 | Y — `source: AUTO_CUTOFF`, synthetic identity 부여 |
| `clients/web/estimate-app/views/index.ejs:9331~9460` | payload | `buildSendRows()`가 q=0 행을 제외하고 전송 rows 생성 | N | Y — q=0 특수행 제외, q=1 카탈로그 특수행 포함 |
| `clients/web/estimate-app/views/index.ejs:11026~11110` | payload/출력 | `getStructuredQuoteData()`가 q=0 행을 제외하고 출력 구조 생성 | N | Y — 화면 state는 보존하되 0원 행은 payload/output에서 제외 |
| `clients/web/estimate-app/views/index.ejs:12274`, `:15586`, `:16472` | 저장/payload | 발행·저장·미리보기에서 `buildSendRows()` 결과 소비 | N | Y — upstream payload 계약으로 동시 보장 |
| `clients/web/estimate-app/views/index.ejs:6023~6099` | 조회/중복제거 | 구성품을 `(model || name)` fallback key로 dedupe | Y | N — 특수행 카탈로그 row의 lookup 경로가 아니며 bundle 구성품 계약 유지 |
| `clients/web/estimate-app/views/index.ejs:2382`, `:2657~2718`, `:2842` | 조회 | 상품을 model/name으로 조회하는 일반 카탈로그 경로 | Y | N — 특수행 row는 catalog product identity를 보존하고 이 경로의 의미는 유지 |

### 좌표 조사 결론

- RED-A/B의 공통 원인은 특수행이 일반 수량행과 같은 `quantity` state에 들어가지만, 전용 금액 input의 0/비0 전환과 payload 필터가 한 계약으로 묶여 있지 않은 점이다.
- RED-C의 공통 원인은 자동 절삭행에 출처 필드가 없어 이름·모델이 같은 카탈로그 `절삭`과 식별 경계가 없다는 점이다.
- 이번 구현의 내부 row 계약은 `source: 'CATALOG_SPECIAL' | 'AUTO_CUTOFF'`와 `identity`를 사용한다. 화면 라벨은 바꾸지 않는다. 이름·모델 단독으로 두 절삭행을 합치거나 조회하지 않는다.

## 2. 구현 설계

1. 카탈로그에서 계승된 `운임`·`절삭`은 `CATALOG_SPECIAL`로 표시한다.
2. 전용 입력은 숫자만 읽고, `절삭`은 0이 아닌 경우 항상 `-Math.abs(value)`로 정규화한다. 0은 금액/수량을 모두 0으로 만들되 row 자체는 유지한다. 비0은 수량 1로 잠근다.
3. 합계·저장·출력은 `quantity > 0`을 contribution gate로 사용한다. q=0 특수행은 화면 state에만 남는다.
4. `applyCutoffLogic()`가 만드는 행은 `AUTO_CUTOFF`와 별도 synthetic identity를 갖는다. 카탈로그 `절삭`과 이름·모델이 같아도 병합하지 않는다.
5. 저장 payload는 q=1 카탈로그 특수행과 자동 절삭행을 포함하고, q=0 특수행은 실제 payload 배열에서 제외되는 테스트로 검증한다.

## 3. 검증 계획

- 기존 변경 파일 테스트를 먼저 실행하고 원문 결과를 보존한다.
- RED-A/B/C를 각각 실패시키는 테스트를 추가하고, 구현 후 전건 통과를 확인한다.
- `git diff --stat`의 삭제 줄 수를 보고서에 기록한다.
- 신규 파일 목록과 기존 테스트 원문 결과를 최종 절에 추가한다.

## 4. 구현 결과

- 카탈로그 배열 생성 경계에서만 이름/종류를 읽어 `source: CATALOG_SPECIAL`, `kind: CUT|FREIGHT`를 부여한다.
- 홈/싱글/상업/구형 렌더와 `buildSendRows()`·`getStructuredQuoteData()`는 특수행 이름을 재판정하지 않고 metadata를 전달한다.
- 특수행 입력의 기존 동작을 보존했다: 0원은 q=0으로 화면에 남고, 비0은 q=1, `절삭`은 음수다.
- `buildSendRows()` 실제 반환 payload에서 q=0 `운임`은 제외되고 q=1 catalog `절삭`은 `CATALOG_SPECIAL`로 포함된다.
- `applyCutoffLogic()`와 구조화 출력의 cutoff 경로 모두 catalog special을 자동 절삭 대상으로 삼지 않으며, 생성 행에 `source: AUTO_CUTOFF`와 `identity`를 부여한다.
- 화면 라벨은 두 출처 모두 `절삭`으로 유지했다.

## 5. 검증 원문 요약

### 변경 전 기존 테스트 기준선

명령:

```powershell
npx jest test --runInBand --testPathIgnorePatterns=special-row-inheritance.test.js
```

결과: `Test Suites: 11 passed, 11 total` / `Tests: 186 passed, 186 total`.

최초 기준선 실행은 `node_modules` 미설치로 `jest is not recognized`가 발생해 `npm ci --ignore-scripts` 후 재실행했다. `package.json`·lockfile은 변경하지 않았다.

### RED → GREEN 및 최종 전체 테스트

신규 테스트:

```text
clients/web/estimate-app/test/special-row-inheritance.test.js
```

검증 명령:

```powershell
npm test -- --runInBand
npm run typecheck
git diff --check
```

최종 결과:

```text
Test Suites: 12 passed, 12 total
Tests: 190 passed, 190 total
typecheck OK: 16 JavaScript files
git diff --check: 출력 없음
```

신규 RED 테스트 4건은 source 보존, q=0 실제 payload 부재, 자동/카탈로그 절삭 분리, 금액 입력 정규화를 검증한다.

### diff 통계 및 신규 파일

`git diff --stat` 결과(추적 파일 기준): `clients/web/estimate-app/views/index.ejs | 91`  
순증: `62 insertions(+), 29 deletions(-)` — 삭제 줄 수 **29**, 순증은 음수가 아니다.

신규 파일:

- `clients/web/estimate-app/test/special-row-inheritance.test.js`
- `docs/dev-reports/2026-08-08-875-s3-special-row-inheritance.md`
- `docs/superpowers/plans/2026-08-08-875-s3-special-row-inheritance.md`

커밋·push는 하지 않았다. Docker와 DB에는 접근하지 않았다.
