# PR #996 (#896 슬4 슬라이스 A) SOL 재수렴 적대검증

- 검증 대상: `feat/896-s4-quantity-sync-config`
- 대상 HEAD: `12e3178115e350e2fdff1a5f1d39382d8ccb5143`
- 검증일: 2026-07-30
- 질문: **fix가 바꾼 표면 전체에서 실 사용자 경로로 재현 가능한 결함이 있는가?**
- 최종 판정: **FAIL — 실 사용자 도달 결함 4건, 증거 무결성 불일치 1건**

## 1. 조사 방식과 범위

다음 5개 에이전트 트랙이 fix 표면을 병렬·파동 조사했고, 겹치는 핵심 경로는
서로 독립된 함수 실행과 원 단위 산술로 재확인했다.

1. 정상 주문 차단: S-03 무관 주문, 부분 catalog, 조회 실패, reset 이후 상태
2. 정수 계약: Java `BigDecimal` 저장 판정과 브라우저 `Number` 계산·최종 전송
3. 저장 복원·과다 계산: target 교체 생명주기, 다중 source, 기존 수식 대조
4. fixture·증거: 실 bootstrap API 생성성, shadow·테스트·금액·numstat 원문
5. 전면 red-team: 위 트랙의 반증과 S-03 외 공용 경로 재수렴

Docker, 공유 DB write, V29 적용은 하지 않았다. 실 catalog 확인은 read-only
`GET /api/v1/partner-orders/bootstrap`만 사용했다.

## 2. 각도별 판정

| 각도 | 판정 | 결론 |
|---|---|---|
| 1. 결함 4 fix가 정상 주문을 막는가 | **FAIL** | 누락 target 상태에서 S-03 수량을 한 번 입력한 뒤 `싱글중대형 초기화`하면 누락 Map이 남는다. 이후 S-03과 무관한 `SI-AL700a` 주문만 담아도 전송이 차단된다(F-01). 처음부터 S-03 수량이 0인 무관 주문, 조회 실패, 누락 target 요구량이 0인 경로는 legacy 계산으로 전송 가능했다. |
| 2. 정수 계약 fix가 합법 설정을 깨는가 | **FAIL** | 서버의 정확한 십진 연산과 브라우저 이진 부동소수 연산이 달라, 공식 PUT으로 저장된 합법 설정이 legacy fallback 또는 최종 전송 거부로 이어진다(F-02). |
| 3. 저장 주문 복원 fix가 다른 복원을 깨는가 | **FAIL** | 로그인 시 현재 target으로 한 번 재계산한 뒤 과거 target이 든 저장 주문을 복원하면 구·신 target이 함께 전송된다(F-03). 비-S-03 저장 수량에서 별도의 값 변동은 확인하지 못했다. |
| 4. source 4개 fix가 과다 계산하는가 | **FAIL** | 현재 canonical catalog와 seed에서는 4개 source 합계가 기존 수식과 일치했다. 그러나 공식 Product API로 만들 수 있는 대소문자만 다른 별도 품목을 source와 같은 품목으로 매칭해 펌프를 과다 가산한다(F-04). |
| 5. fixture가 실 API 상태인가 | **PASS** | 현재 실 bootstrap HTTP 200, `singleSets=288`에서 fixture의 source 4개, `ADP-F075SP`, `AIM-N01`의 ID·model·name·price가 모두 재현됐다. 배열 순서는 실 API에서 AIM→ADP, fixture에서 ADP→AIM이지만 소비 경로가 ID/model `.find`라 이 차이로 도달 결함은 생기지 않았다. |
| 6. S-03 외 19개 계열 무영향 | **FAIL(F-01 한정)** | clean state의 19개 계열 계산에는 별도 도달 결함을 찾지 못했다. 다만 S-03 누락 상태를 거친 뒤 reset하면 공용 전송 guard가 남아 S-03과 무관한 계열만 담은 주문도 막으므로 “무영향”은 성립하지 않는다. |

### 판정불가지만 결함으로 계상하지 않은 경계

공식 quantity-sync DTO와 validator는 target 여러 개를 저장할 수 있지만
order-app은 `targets.length !== 1`을 거부한다. 일반 설계에는 1:N 문구가 있는 반면,
슬라이스 A의 S-03 consumer 계약에는 target 1개 제한이 명시돼 있다. S-03 관리자에게
1:N 저장을 보장해야 한다는 단일 계약을 확정할 근거가 없어 이번 결함 수에는 넣지 않았다.

## 3. 확정 결함

### F-01. reset 뒤 남은 누락 Map이 25,000원짜리 정상 주문을 차단한다

**실 사용자 경로**

부분 catalog에서 S-03 source는 있으나 현재 target `ADP-F075SP`가 없는 상태로
사용자가 S-03 품목을 입력했다가 `싱글중대형 초기화`를 누르고, 이후 S-03과 무관한
`SI-AL700a`만 주문하는 경로다. `SI-AL700a`는 실 bootstrap에서 1개 25,000원인
정상 주문 품목이다.

**재현 절차**

1. `ADP-F075SP`만 빠지고 `AC072BSCPBH2SY`와 `SI-AL700a`는 있는 부분 catalog를
   로드한다.
2. `AC072BSCPBH2SY` 수량 1을 입력한다. legacy fallback이 누락 target
   `ADP-F075SP`를 `SINGLE_CATALOG_MISSING_MODELS`에 기록한다.
3. `싱글중대형 초기화`를 누른다. 모든 `singleQty`는 0이 되지만 누락 Map을
   초기화하는 `recomputeSingleDerived()`는 호출되지 않는다.
4. `SI-AL700a` 수량 1만 입력한다. 이 품목은 `SEND_AS_SET_IDS`라 재계산 trigger가
   아니므로 누락 Map이 그대로 남는다.
5. 배송 정보와 연락처를 정상 입력하고 전송을 시도한다.

**관측된 잘못된 결과**

전송 버튼이 계속 비활성이고 click guard도 즉시 return한다. 주문 대상은
`SI-AL700a` 1개 **25,000원**뿐이고 S-03 source 수량은 0인데도 정상 주문이
전송되지 않는다.

```json
{"blocking":{"disabled":true},"resetClearsQty":true,"resetRecomputes":false,"resetClearsMissingMap":false,"siAl700aTriggersRecompute":false}
```

**파일:행 근거**

- `clients/web/order-app/index.html:5101-5118` — 품목 입력 후 trigger일 때만 재계산
- `clients/web/order-app/index.html:5251-5256` — `SEND_AS_SET_IDS`는 trigger 제외
- `clients/web/order-app/index.html:5630-5643` — 양수 파생 target 누락을 Map에 기록
- `clients/web/order-app/index.html:5676-5679` — Map 크기만으로 전송 차단 판정
- `clients/web/order-app/index.html:6483` — 전송 버튼 비활성
- `clients/web/order-app/index.html:6735` — reset이 Map 재계산·초기화를 하지 않음
- `clients/web/order-app/index.html:6768-6772` — click guard 즉시 return

### F-02. 서버가 허용한 정확한 십진 정수를 브라우저가 오판한다

**실 사용자 경로**

관리자가 공식 quantity-sync PUT으로 S-03 계수를 저장하고, 사용자가 해당 source를
정수 수량으로 주문하는 정상 경로다. 서버는 `BigDecimal`로 정확히 정수 결과임을
확인하지만 order-app은 JavaScript `Number`로 다시 판정·계산한다.

**재현 절차 A — 설정 거부 후 legacy fallback**

1. 활성 S-03의 source factor를 각각 `0.28`, target multiplier를 `25`,
   rounding mode를 `NONE`으로 PUT한다.
2. 서버에서는 `0.28 × 25 = 7.00`이고 trailing zero 제거 후 scale이 0이므로
   저장된다.
3. 사용자가 `AC072BSCPBH2SY` 1개를 입력한다.
4. 브라우저의 `0.28 * 25`는 `7.000000000000001`이어서
   `Number.isInteger`가 false가 되고 설정을 거부한 뒤 legacy 계산으로 후퇴한다.

**관측된 잘못된 결과 A**

정상 설정의 기대 펌프는 7개, **554,400원**이다. 실제 주문에는 legacy 펌프 1개,
**79,200원**만 들어가 **475,200원**이 누락된다. source까지 포함한 기대 합계는
**1,984,400원**, 실제 합계는 **1,509,200원**이다.

**재현 절차 B — selection 통과 후 전체 전송 거부**

1. source factor `0.1`, target multiplier `10`, rounding mode `NONE`을 PUT한다.
   서버의 계수는 정확히 `1.0`이므로 저장된다.
2. 사용자가 `AC072BSCPBH2SY` 3개를 입력한다.
3. selection의 `0.1 * 10`은 1이라 통과하지만 evaluator는
   `(3 * 0.1) * 10 = 3.0000000000000004`를 만든다.
4. 최종 주문 변환의 정수 guard가 이 수량을 거부한다.

**관측된 잘못된 결과 B**

기대 펌프 3개는 **237,600원**, source 포함 정상 주문 총액은
**4,527,600원**이다. 실제로는 임시저장·확정 요청 전 전체 주문이 전송되지 않는다.
factor `0.1`, `0.2`, multiplier `10`인 source 두 개를 각 1개 주문해도 합계가
`3.0000000000000004`가 되어 같은 전송 거부가 재현된다.

```json
{"coefficientCheck":1,"selection":"ready","sourceContribution":0.30000000000000004,"raw":3.0000000000000004,"evaluation":"ready","targetQty":3.0000000000000004,"isInteger":false,"targetSubtotal":237600.00000000003,"expectedQty":3,"expectedSubtotal":237600,"fullExpectedOrder":4527600,"finalGuard":"reject"}
```

**파일:행 근거**

- `services/product-service/src/main/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleValidator.java:458-477`
  — `BigDecimal` 계수의 정확한 정수 저장 판정
- `clients/web/order-app/src/quantitySync.ts:96-105` — 브라우저 계수 정수 판정
- `clients/web/order-app/src/quantitySync.ts:165-170` — selection 단계 거부
- `clients/web/order-app/src/quantitySync.ts:210-222` — source 합계와 target 수량 계산
- `clients/web/order-app/index.html:5209-5229` — 설정 오류 시 legacy fallback
- `clients/web/order-app/src/samhanApi.ts:217-228` — 최종 정수 quantity guard
- `clients/web/order-app/src/samhanApi.ts:360-371` — guard 이후에만 draft 요청

### F-03. 로그인 후 과거 저장 주문을 복원하면 구·신 target 97,350원이 함께 남는다

**실 사용자 경로**

사용자가 target이 `ADP-F075SP`이던 때 S-03 source 1개가 든 주문을 저장하고,
관리자가 target을 `AIM-N01`로 바꾼 뒤 사용자가 새로 로그인해 저장내역에서 과거
주문을 복원하는 경로다.

**재현 절차**

1. target `ADP-F075SP` 상태에서 `AC072BSCPBH2SY` 1개와 자동 target
   `ADP-F075SP` 1개가 든 snapshot을 저장한다.
2. 관리자가 현재 rule target을 `AIM-N01`로 변경한다.
3. 사용자가 새 페이지에 로그인한다. 최초 재계산은 기존 ADP를 0으로 지우고
   추적 Set에는 현재 AIM만 남긴다.
4. 저장내역에서 1번 snapshot을 복원한다. `applySnapshot()`이 과거
   `singleQty`의 ADP 1개를 되살린 뒤 재계산한다.
5. clear 함수는 현재 추적 Set의 AIM만 순회하므로 복원된 ADP를 알지 못해 지우지
   못한다. 현재 AIM 1개도 새로 계산된다.
6. 주문 전송 목록을 만든다.

**관측된 잘못된 결과**

기대 target은 AIM 1개 **18,150원**이다. 실제 target은 ADP 1개
**79,200원**과 AIM 1개 **18,150원**, 합계 **97,350원**이며
**79,200원**이 과다하다. source 포함 기대 주문은 **1,448,150원**, 실제 주문은
**1,527,350원**이다. 두 독립 에이전트의 현재 함수 실행에서
`oldQty=1`, `newQty=1`, `targetSubtotal=97350`이 동일하게 재현됐다.

```json
{"afterLoginTracked":["호환중계기(EHP용)66"],"oldQty":1,"newQty":1,"oldWon":79200,"newWon":18150,"targetSubtotal":97350}
```

**파일:행 근거**

- `clients/web/order-app/index.html:2912-2923` — 추적 Set과 현재 알려진 target만 clear
- `clients/web/order-app/index.html:5209-5218` — 로그인 후 현재 target으로 교체
- `clients/web/order-app/index.html:9233-9240` — 저장 snapshot의 `singleQty`
- `clients/web/order-app/index.html:9506-9540` — 과거 `singleQty` 복원
- `clients/web/order-app/index.html:9562-9569` — 복원 뒤 파생 수량 재계산
- `clients/web/order-app/index.html:6659-6685` — 0이 아닌 구·신 target을 모두 전송행으로 생성

### F-04. 대소문자만 다른 별도 catalog 품목이 새 source로 중복 가산된다

**실 사용자 경로**

관리자가 공식 Product 생성 API로 기존 source와 대소문자만 다른 모델코드를 가진
별도 싱글 주문 품목을 등록하고, 사용자가 그 새 품목만 주문하는 경로다. Product
조회와 DB unique index는 대소문자를 구분하지만 order-app의 S-03 source 매칭은
대소문자를 제거한다.

**재현 절차**

1. 기존 source `AC090BSCPBH2SY`가 있는 상태에서 Product 생성 API로
   modelName/modelCode `ac090bscPbh2sy`, name `벽걸이 신규품`, usage scope
   `BOTH`, estimate category `SINGLE_SET`인 활성 품목을 등록한다.
2. 생성 경로의 중복 검사는 정확 일치이고 DB unique index도 대소문자를 구분하므로
   이 별도 품목은 공식 경로로 생성·bootstrap 노출될 수 있다.
3. 현재 source 4개 S-03 규칙을 로드한다.
4. 사용자가 새 소문자 품목만 1개 주문한다.
5. `rowsForProductCode()`가 양쪽 코드를 대문자로 바꿔 비교하여 새 품목을
   `AC090BSCPBH2SY` source 수량으로 합산한다.

**관측된 잘못된 결과**

정확 식별자 기준 기대 펌프는 0개, **0원**이다. 실제 configured 계산은 펌프
1개 **79,200원**을 추가한다. 기존 하드코딩 수식은 이름·모델에 `실링`이 없는
이 새 품목을 합산하지 않아 0원이므로 fix 이후 configured 경로에서만
**79,200원** 과다 계산된다.

```json
{"selection":"ready","legacyPumpQty":0,"configuredPumpQty":1,"wrongAmount":79200}
```

**파일:행 근거**

- `services/product-service/src/main/java/com/samhanair/logis/product/web/dto/CreateProductRequest.java:20-40`
  — modelName 대소문자 형식 제한 없이 공식 생성 가능
- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java:469-495`
  — 정확 일치 중복 확인 후 modelName을 modelCode로 생성·노출
- `services/product-service/src/main/resources/db/migration/V3__migration_extension.sql:47`
  — 원문 modelCode unique index
- `services/product-service/src/main/java/com/samhanair/logis/product/repository/ProductRepository.java:29-40`
  — modelName 정확·대소문자 구분 조회 계약
- `services/product-service/src/main/java/com/samhanair/logis/product/repository/ProductRepository.java:277-289`
  — 노출된 SINGLE_SET catalog 조회
- `clients/web/order-app/src/quantitySync.ts:69-74` — 대소문자 제거 source 매칭
- `clients/web/order-app/src/quantitySync.ts:215-222` — 일치한 모든 row의 수량 합산

## 4. 결함 1 fix의 정상 seed 합산 대조

현재 V29 seed의 canonical source 4개에는 서로 같은 row가 없고, 각 factor와 target
multiplier가 1이다. 현재 HEAD shadow를 재실행한 결과는 기존 하드코딩 수식과
정확히 같았다.

| 입력 | 기존 수식 펌프 | configured 펌프 | target 소계 |
|---|---:|---:|---:|
| source 4개 각각 1 | 4 | 4 | 316,800원 |
| source 4개 각각 4 | 16 | 16 | 1,267,200원 |
| source 4개 각각 77 | 308 | 308 | 24,393,600원 |

따라서 **정상 seed 자체의 다중 source 중복 가산은 반증됐다.** F-04는 공식 API가
만들 수 있는 case-distinct catalog row가 추가될 때 정확 식별자 경계가 무너지는
별도 실사용 결함이다.

## 5. fixture 실경로 판정

2026-07-30 read-only 실 bootstrap 재호출 결과는 HTTP 200,
`singleSets=288`이었다. 다음 6개 행은 fixture와 ID·model·name·price가 일치했다.

| ID | model | price |
|---|---|---:|
| 싱글 실링61 | AC072BSCPBH2SY | 1,430,000원 |
| 싱글 실링62 | AC090BSCPBH2SY | 1,490,000원 |
| 싱글 실링63 | AC130BSCPHH2SY | 1,730,000원 |
| 싱글 실링64 | AC145BSCPHH2SY | 1,860,000원 |
| 실링용 드레인펌프75 | ADP-F075SP | 79,200원 |
| 호환중계기(EHP용)66 | AIM-N01 | 18,150원 |

공식 Product 생성과 시트 sync 모두 ACTIVE Product, 주문 노출 scope,
SINGLE_SET exposure, delivery price를 만들 수 있고 bootstrap이 이를
`id=name+rowIndex`, `model=modelCode`로 변환한다. 따라서 fixture의 변경 상태는
raw SQL만으로 가능한 가상 세계가 아니다.

파일 근거:

- `clients/web/order-app/src/__tests__/fixtures/singleSetsBootstrap.fixture.json:3-7,16-21`
- `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/BootstrapService.java:299-305,410-429`
- `services/product-service/src/main/java/com/samhanair/logis/product/web/dto/CreateProductRequest.java:20-40`
- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java:469-503`
- `services/product-service/src/main/java/com/samhanair/logis/product/repository/ProductRepository.java:277-289`

## 6. 증거 무결성 대조

### 재현된 원문·실측

- `npm run typecheck`: 성공
- order-app 전체: `Test Files 20 passed (20)`, `Tests 242 passed (242)`
- fix 집중 3파일: 16 + 2 + 14 = 32 tests 통과
- product-service validator:
  `--rerun-tasks --no-build-cache`, `BUILD SUCCESSFUL`,
  `13 actionable tasks: 13 executed`
- shadow 20행:
  `resultCount=20`, `allQuantityEqual=true`, `allSubtotalEqual=true`,
  `allPayloadEqual=true`, `sourceCount=4`, `targetPrice=79200`
- 금액:
  source 2개 `2,860,000원` + target 77개 `6,098,400원`
  = 전체 `8,958,400원`
- target `0/1/4/77` 소계:
  `0 / 79,200 / 316,800 / 6,098,400원`
- target swap harness가 제시한 출력 자체도 현재 HEAD에서 재현됐다. F-03은 그
  출력의 진위를 문제 삼는 것이 아니라, 실제 로그인 선행 재계산 후 복원 경로에서
  다른 제품 상태가 재현된 결함이다.

### 재현되지 않은 원문

`docs/dev-reports/2026-07-30-896-s4-slice-a.md:715-728`은 `git diff --numstat`
원문이라며 보고서 자체를 `235  0`으로 적었다. 그러나 현재 fix commit의 실제
`git show --numstat 12e317811`은 다음과 같다.

```text
242	0	docs/dev-reports/2026-07-30-896-s4-slice-a.md
```

나머지 10개 파일의 numstat와 `git diff --check` 성공은 재현됐다. 보고서에
후속 7줄이 추가된 뒤 최종 commit된 것으로 보이지만, 중간 tree SHA가 제시되지 않아
“원문”으로 적힌 `235`는 현재 검증 대상에서 재현할 수 없다. 이는 제품 결함 수와
분리한 **증거 무결성 불일치 1건**이다.

## 7. 직전 라운드 결함 4건 해소 판정

| 직전 결함 | 판정 | 근거 |
|---|---|---|
| 1. source 3개 누락 | **해소** | canonical 실 catalog의 source 4개가 모두 계산되고, 단독·동시 20개 shadow의 수량·원 단위 소계·payload가 기존 수식과 일치했다. F-04는 case-distinct 신규 품목에서 생긴 새 정확 식별자 결함이다. |
| 2. 소수 설정 저장 후 주문 정수 guard 실패 | **부분 해소 / 재수렴 실패** | 실제 비정수 계수는 서버가 저장 전에 차단한다. 그러나 서버에서 정확한 정수인 합법 십진 계수도 브라우저 표현 오차로 fallback 또는 최종 거부되어 같은 사용자 실패가 남았다(F-02). |
| 3. 저장 주문 복원 시 구·신 target 혼입 | **미해소** | fresh harness 한 순서에서는 지워지지만, 실제 로그인→현재 target 최초 재계산→과거 snapshot 복원 순서에서 ADP와 AIM이 함께 남아 79,200원 과다다(F-03). |
| 4. target catalog 부재 시 경고만 하고 전송 | **원 경로 해소, 새 회귀 발생** | source 양수·target 누락 상태는 버튼과 click guard가 막는다. 하지만 reset이 차단 상태를 해제하지 않아 이후 S-03 무관 25,000원 주문까지 막는다(F-01). |

## 8. 이 라운드가 보지 않은 것

- 테스트의 강도·mock 충실도·가드 커버리지·문서 표현 품질은 평가하지 않았다.
  단, 사용자가 허용한 증거 무결성 원문 대조만 수행했다.
- Docker를 실행하지 않았고, 공유 DB 최신 V28에 V29를 적용·rollback하지 않았다.
- 공유 실데이터에 POST/PUT/DELETE를 하지 않았으며, 공식 write 경로의 도달성은
  DTO·service·repository·migration 계약으로 확인했다.
- estimate-app은 조사하지 않았다.
- 나머지 19개 계열의 전환 제안, H-07·C-09 설계는 하지 않았다.
- V29 번호 재조정과 원격 migration 충돌 조사는 하지 않았다.
- 성능, 보안, 배포, 운영 관측성, 접근성, UI 미관은 이번 유일 질문의 범위 밖이다.
- 새 이슈 등록, 브랜치 생성, git add/commit/push/checkout은 하지 않았다.
