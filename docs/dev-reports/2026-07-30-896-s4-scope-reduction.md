# PR #996 (#896 슬4) — Slice A 범위 축소 보고서

작성일: 2026-07-30  
기준 HEAD: `5f76c40cf` (`feat/896-s4-quantity-sync-config`)  
목적: fix 누적을 중단하고 S-03 설정을 관측 전용(shadow-only)으로 되돌림

## 1. PM 결정과 최종 범위

직전 재수렴 판정의 PM 수치는 다음과 같다.

```text
수렴비 c = 이번 라운드 도달가능 / 직전 = 4/4 = 1.0 (목표 < 0.45)
fix-유발률 r = 3/4 = 0.75
```

F-01~F-04가 모두 evaluator가 실제 사용자 계산을 담당하는 데서 발생했으므로,
이번 라운드는 가드를 더 추가하지 않고 evaluator의 사용자 경로를 제거했다.
결함을 숨기거나 검증을 생략한 것이 아니다. 결함이 존재하던 계산·차단 표면을
사용자 경로에서 없애고, 같은 계산은 shadow 관측 표면에만 남겼다.

남긴 범위:

- 로그인 후 `GET /api/v1/quantity-sync-rules`를 읽는 `samhanApi` 경로
- 읽은 S-03 설정을 기존 하드코딩 계산과 대조하는 shadow evaluator/하네스
- 실 catalog 4개 source와 `ADP-F075SP`를 담은 기존 `V29` seed
- 설정 저장 시점의 서버측 정수 계약 validator
- 이번 판단과 다음 슬라이스 경계를 기록한 정찰·라운드 보고서

뺀 범위:

- order-app 사용자 경로의 설정 기반 수량 계산 및 target 교체
- 설정 기반 수량의 화면·금액·전송 payload 반영
- 주문 전송 차단, 설정 오류의 사용자 경고 게이팅
- 저장 주문 복원 로직 변경
- 브라우저의 설정 계수 정수 판정

`V29` migration과 `QuantitySyncRuleValidator`의 저장 시점 가드는 이 범위 축소에서
그대로 보존했다. 이 라운드에서 migration 번호나 공유 실데이터를 변경하지 않았다.

## 2. 구현 경계

`clients/web/order-app/index.html`은 `recomputeSingleExtras()`에서 기존의
`실링` 하드코딩 수식을 그대로 수행한다. 다음 표면은 제거됐다.

- `configuredSingleS03_()` 호출과 설정 target으로의 동적 수량 반영
- 설정 target 교체 시 구 target을 지우던 `clearSingleS03DerivedQty_()`
- `SINGLE_CATALOG_MISSING_MODELS`를 주문 준비/클릭 차단에 연결하던 guard
- 설정 조회 실패를 `singleCatalogWarnings`에 표시하던 사용자 경고

설정 API read는 `loadSingleS03QuantitySync_()`에 남겼다. 성공·실패는
`[quantity-sync shadow]` `console.info` 흔적으로만 남고, DOM·버튼·수량·합계·전송
payload를 변경하지 않는다. `main.ts`는 `selectSingleS03Rule()`로 읽은 rule의
관측 상태만 보존하며 `evaluateSingleS03Rule()`을 브라우저 bridge에 노출하지 않는다.
evaluator는 shadow script와 테스트가 직접 import한다.

## 3. 불변식 1 — S-03 source 4개 전수 대조 실행 원문

실 fixture의 source 4개를 bitmask 15개(공집합을 제외한 모든 단독·동시 조합)로
만들고, 각 조합에 수량 `0, 1, 4, 77`을 적용했다. 총 60건에서 legacy 결과와
shadow 결과의 target 수량, catalog 단가를 곱한 원 단위 전체 소계, SINGLE 전송
payload를 비교했다. 하나라도 다르면 하네스가 예외로 종료한다.

실행:

```powershell
PS> npm exec vite-node scripts/quantity-sync-s03-shadow.mjs
```

실행 원문:

```json
{"fixture":{"fetchedOn":"2026-07-29","s03SourceCount":4,"combinationCount":15,"s03Sources":[{"id":"싱글 실링61","model":"AC072BSCPBH2SY","name":"싱글 실링","price":1430000},{"id":"싱글 실링62","model":"AC090BSCPBH2SY","name":"싱글 실링","price":1490000},{"id":"싱글 실링63","model":"AC130BSCPHH2SY","name":"싱글 실링","price":1730000},{"id":"싱글 실링64","model":"AC145BSCPHH2SY","name":"싱글 실링","price":1860000}],"target":{"id":"실링용 드레인펌프75","model":"ADP-F075SP","name":"실링용 드레인펌프","price":79200}},"rule":{"ruleKey":"SINGLE_S03_CEILING_DRAIN_PUMP","sourceProductCodes":["AC072BSCPBH2SY","AC090BSCPBH2SY","AC130BSCPHH2SY","AC145BSCPHH2SY"],"targetProductCode":"ADP-F075SP","factor":1,"multiplier":1,"inactiveBehavior":"ZERO"},"selectedStatus":"ready","checkedMasks":["0001","0010","0011","0100","0101","0110","0111","1000","1001","1010","1011","1100","1101","1110","1111"],"quantityCases":[0,1,4,77],"resultCount":60,"allQuantityEqual":true,"allSubtotalEqual":true,"allPayloadEqual":true,"representativeResults":[{"label":"mask=0001,qty=1","sourceQuantities":{"싱글 실링61":1,"싱글 실링62":0,"싱글 실링63":0,"싱글 실링64":0},"beforeQuantity":1,"afterQuantity":1,"beforeSubtotal":1509200,"afterSubtotal":1509200,"beforePayload":[{"section":"SINGLE","model":"AC072BSCPBH2SY","qty":1},{"section":"SINGLE","model":"ADP-F075SP","qty":1}],"afterPayload":[{"section":"SINGLE","model":"AC072BSCPBH2SY","qty":1},{"section":"SINGLE","model":"ADP-F075SP","qty":1}]},{"label":"mask=1111,qty=1","sourceQuantities":{"싱글 실링61":1,"싱글 실링62":1,"싱글 실링63":1,"싱글 실링64":1},"beforeQuantity":4,"afterQuantity":4,"beforeSubtotal":6826800,"afterSubtotal":6826800,"beforePayload":[{"section":"SINGLE","model":"AC072BSCPBH2SY","qty":1},{"section":"SINGLE","model":"AC090BSCPBH2SY","qty":1},{"section":"SINGLE","model":"AC130BSCPHH2SY","qty":1},{"section":"SINGLE","model":"AC145BSCPHH2SY","qty":1},{"section":"SINGLE","model":"ADP-F075SP","qty":4}],"afterPayload":[{"section":"SINGLE","model":"AC072BSCPBH2SY","qty":1},{"section":"SINGLE","model":"AC090BSCPBH2SY","qty":1},{"section":"SINGLE","model":"AC130BSCPHH2SY","qty":1},{"section":"SINGLE","model":"AC145BSCPHH2SY","qty":1},{"section":"SINGLE","model":"ADP-F075SP","qty":4}]},{"label":"mask=1111,qty=77","sourceQuantities":{"싱글 실링61":77,"싱글 실링62":77,"싱글 실링63":77,"싱글 실링64":77},"beforeQuantity":308,"afterQuantity":308,"beforeSubtotal":525663600,"afterSubtotal":525663600,"beforePayload":[{"section":"SINGLE","model":"AC072BSCPBH2SY","qty":77},{"section":"SINGLE","model":"AC090BSCPBH2SY","qty":77},{"section":"SINGLE","model":"AC130BSCPHH2SY","qty":77},{"section":"SINGLE","model":"AC145BSCPHH2SY","qty":77},{"section":"SINGLE","model":"ADP-F075SP","qty":308}],"afterPayload":[{"section":"SINGLE","model":"AC072BSCPBH2SY","qty":77},{"section":"SINGLE","model":"AC090BSCPBH2SY","qty":77},{"section":"SINGLE","model":"AC130BSCPHH2SY","qty":77},{"section":"SINGLE","model":"AC145BSCPHH2SY","qty":77},{"section":"SINGLE","model":"ADP-F075SP","qty":308}]}]}
```

위 원문에서 source 4개·조합 15개·입력 4종·결과 60건이며,
`allQuantityEqual=true`, `allSubtotalEqual=true`, `allPayloadEqual=true`다.
비교 대상은 S-03 source 단독·동시 line을 포함한 전체 SINGLE payload다.

## 4. F-01~F-04 재현 시도 결과

동일한 재현 순서를 shadow/legacy 경계 하네스로 실행했다.

```powershell
PS> node -e "const h=require('./src/__tests__/quantitySyncS03Harness.cjs'); console.log(JSON.stringify({F01:h.runOrderReadiness({missingModel:'ADP-F075SP'}),F02:h.runLegacyS03({sourceQuantity:3}),F03:h.runLegacyS03TargetSwap(),F04:h.runLegacyCaseDistinctSource()}))"
```

실행 원문:

```json
{"F01":{"disabled":false,"missingMapSize":1,"unrelatedOrder":{"model":"SI-AL700a","quantity":1,"subtotal":25000}},"F02":{"sourceQuantity":3,"targetQuantity":3,"manualLock":false},"F03":{"oldTargetQuantity":1,"newTargetQuantity":0,"targetSubtotal":79200,"sendModels":["AC072BSCPBH2SY","ADP-F075SP"]},"F04":{"legacyPumpQty":0,"legacyPumpSubtotal":0,"caseDistinctSourceQuantity":1}}
```

- F-01: reset 뒤 누락 Map 크기는 1로 남겨 재현 조건을 유지했지만, S-03과 무관한
  `SI-AL700a` 1개·25,000원 주문의 버튼은 `disabled=false`다. Map은 더 이상
  주문 준비나 클릭 guard에 연결되지 않는다.
- F-02: 서버 validator는 저장 시점에만 정수 계약을 검사한다. 브라우저 bridge는
  evaluator를 호출하지 않으며, legacy 수식은 source 3개 입력을 target 3개로
  유지하고 거부하지 않는다. 따라서 설정 factor의 브라우저 오차가 사용자 수량을
  0.000000000000001만큼 바꾸거나 최종 전송을 거부하는 경로가 없다. 십진 설정의
  shadow 오차는 다음 슬라이스의 관측 대상이지 사용자 실패가 아니다.
- F-03: 로그인→legacy 최초 재계산→저장 snapshot 복원 순서를 적용해도 현재
  legacy target `ADP-F075SP` 1개만 남고, `AIM-N01`은 0개다. target 소계는
  79,200원이며 구·신 target 혼입 97,350원은 발생하지 않는다. 동적 target
  교체 코드 자체를 제거했기 때문이다.
- F-04: 대소문자만 다른 `ac090bscPbh2sy`/이름 `벽걸이 신규품`을 1개 넣어도
  legacy 수식의 pump 수량·소계는 각각 0이다. evaluator의 대소문자 매칭은
  shadow 표면에만 남고 사용자 계산에는 도달하지 않는다.

## 5. 불변식 6개 확인 방법과 결과

| 불변식 | 확인 방법 | 결과 |
|---|---|---|
| 1. 수량·금액·전송 payload 불변 | 위 60건 전수 shadow 실행, `allQuantityEqual/allSubtotalEqual/allPayloadEqual` 확인; order-app 전체 회귀도 실행 | PASS |
| 2. 정상 주문 비차단 | F-01 하네스에서 누락 Map을 남긴 채 `SI-AL700a` 주문 준비를 확인; `checkOrderReady()`와 클릭 handler의 S-03 guard 제거를 정적 확인 | PASS |
| 3. 설정 조회 실패 비가시화 | 조회 실패·bridge 부재·rule 오류가 `console.info`만 남기고 DOM 경고·버튼·재계산을 호출하지 않는 코드와 테스트 확인 | PASS |
| 4. F-01~F-04 사용자 도달 표면 제거 | index에서 configured evaluator/동적 target/주문 blocking symbol 부재 확인; 네 재현 하네스 결과 확인 | PASS |
| 5. S-03 외 19개 계열 불변 | legacy 계산을 유지하고 `legacy-quantity-golden.test.ts` 73건 및 order-app 전체 243건 실행 | PASS |
| 6. 반복 계산 결정성 | evaluator는 shadow 결과 Map만 새로 만들고 입력 Map을 변경하지 않음; 동일 입력 반복 비교 테스트와 전수 하네스 통과 | PASS |

## 6. 검증 원문

order-app typecheck:

```text
> @samhan/order-app@0.4.0 typecheck
> tsc -p tsconfig.json --noEmit
```

order-app 전체 테스트:

```text
> @samhan/order-app@0.4.0 test
> vitest run

Test Files  20 passed (20)
Tests       243 passed (243)
```

product-service 저장 validator 범위 실행:

```powershell
PS> $env:GRADLE_USER_HOME='D:\dev\Samhan-Public\.gradle-t22'; .\gradlew.bat :services:product-service:test --tests com.samhanair.logis.product.quantitysync.QuantitySyncRuleValidationTest --rerun-tasks --no-build-cache --no-daemon --console=plain
```

```text
> Task :services:product-service:compileJava
> Task :services:product-service:compileTestJava
> Task :services:product-service:testClasses
> Task :services:product-service:test

BUILD SUCCESSFUL in 55s
13 actionable tasks: 13 executed
```

`UP-TO-DATE`와 `FROM-CACHE`는 위 Gradle 실행 출력에 없었다. Docker를 실행하지
않았고, 포트도 열지 않았으며, 공유 실데이터에 POST/PUT/DELETE를 수행하지 않았다.
`git add`, `commit`, `push`, `checkout`도 수행하지 않았다.

## 7. 변경 파일과 파일별 numstat

아래는 scope reduction 구현을 적용한 뒤 `git diff --numstat`의 파일별 원문이다.
합산 막대 수치는 쓰지 않았다.

```text
14	81	clients/web/order-app/index.html
36	17	clients/web/order-app/scripts/quantity-sync-s03-shadow.mjs
0	2	clients/web/order-app/src/__tests__/catalogMissingSignal.test.ts
42	17	clients/web/order-app/src/__tests__/quantitySyncS03.test.ts
53	45	clients/web/order-app/src/__tests__/quantitySyncS03Harness.cjs
6	6	clients/web/order-app/src/__tests__/quantitySyncS03Integration.test.ts
3	11	clients/web/order-app/src/main.ts
6	24	clients/web/order-app/src/quantitySync.ts
```

변경 파일 목록:

- `clients/web/order-app/index.html` — 사용자 계산을 legacy-only로 복원하고 설정 read를 console shadow로 격리
- `clients/web/order-app/scripts/quantity-sync-s03-shadow.mjs` — 15조합×4수량 전수 비교
- `clients/web/order-app/src/__tests__/catalogMissingSignal.test.ts` — 제거된 동적 target helper 의존 제거
- `clients/web/order-app/src/__tests__/quantitySyncS03.test.ts` — shadow-only 계약 및 F-01~F-04 회귀
- `clients/web/order-app/src/__tests__/quantitySyncS03Harness.cjs` — legacy 경계 재현 하네스
- `clients/web/order-app/src/__tests__/quantitySyncS03Integration.test.ts` — legacy 사용자 경계 테스트
- `clients/web/order-app/src/main.ts` — evaluator browser bridge 제거, rule read 상태만 유지
- `clients/web/order-app/src/quantitySync.ts` — evaluator 정수 gate 제거 및 shadow 전용 문서화

신규 파일 목록:

- `docs/dev-reports/2026-07-30-896-s4-scope-reduction.md` — 본 범위 축소 보고서, 실행 원문, 불변식·다음 경계 (`+215/-0`, `git diff --no-index --numstat -- /dev/null docs/dev-reports/2026-07-30-896-s4-scope-reduction.md`)

신규 파일은 일반 `git diff --numstat`에 포함되지 않으므로 기존 변경 파일 numstat과
섞지 않았다. 신규 report의 수치는 `git diff --no-index --numstat -- /dev/null
docs/dev-reports/2026-07-30-896-s4-scope-reduction.md` 원문으로 확인했다.

## 8. 다음 슬라이스에 남기는 경계

다음 슬라이스에서 evaluator를 실제 사용자 계산으로 켜려면 먼저 다음 증명을
완료해야 한다.

1. shadow 불일치 0을 fixture가 아니라 실 catalog·실 rule 응답에서 확인한다.
   source/target의 product ID를 기준으로 단독·모든 동시 조합과 실제 사용 수량
   분포를 replay하고 수량·원 단위 소계·최종 payload를 모두 비교한다.
2. 서버 `BigDecimal` 저장 결과와 브라우저/클라이언트 표현을 같은 canonical 정수
   계약으로 비교한다. `0.28×25`, `0.1×10`, 복수 source 합산을 포함해 저장 성공
   설정이 shadow에서 오차·거부를 만들지 않아야 한다.
3. catalog 식별은 대소문자 정규화가 아닌 product ID 또는 서버 canonical code로
   증명한다. 대소문자만 다른 합법 catalog row, source/target 중복, 비노출 row를
   각각 replay한다.
4. reset→재계산→로그인→현재 rule 적용→과거 snapshot 복원 생명주기를 실제
   저장 구조로 replay해 구 target 잔존·신 target 혼입이 0임을 증명한다.
5. 설정 조회 실패, 빈 catalog, target 누락, 십진 계수 입력에서 사용자 화면·버튼·
   payload가 legacy와 동일하다는 별도 계약 테스트를 먼저 통과시킨다. 그 뒤에도
   주문 전송 차단·사용자 경고 게이팅은 별도 PM 범위 결정 없이는 추가하지 않는다.

그 증명이 끝나기 전까지 V29는 다음 슬라이스의 입력 데이터로만 사용하고, 현재
PR의 shadow-only 경계를 유지한다.
