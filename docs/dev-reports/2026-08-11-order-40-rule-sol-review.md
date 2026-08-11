# PR #1166 S2 주문 40% 규칙 SOL 검토

- 검토 기준: `011d039cf` (`[FEAT] #1166 S2 — 주문 40% 규칙 (격리 검증)`)
- 검토일: 2026-08-11
- 판정: **FAIL — 머지 보류**
- 차단 결함: **2건**
- 공유 DB: `default_transaction_read_only=on` 및 `BEGIN TRANSACTION READ ONLY`로 조회만 수행

## 1. 결론

S2가 추가한 Java 판정 자체는 미분류를 “없음”이 아니라 “판정 불가”로 처리하고, 실외기·실내기·고정DC·변동DC 비대상 회귀도 표적 테스트에서 지킨다. 강제 재실행한 세 서비스 테스트도 정확히 **1,378건, 실패 0, 에러 0, skip 0**이다.

그러나 확정 사양의 두 경계가 코드 계약으로 닫히지 않았다.

1. 실제 주문 웹 앱에 별도의 40% 판정과 값 변경이 살아 있어 “주문 경로 단일 지점”이 아니다. 새 서버 판정과 이미 서로 다른 결과를 낸다.
2. 공용 가격 계산기가 `callerService`를 검사하지 않아 `estimate-service` 요청에도 물리 코드만 채워지면 40%를 적용한다. 현재 견적 호출자가 그 필드를 비워 보내는 우연에 의존하므로 “견적 경로 변경 0”을 계약으로 보장하지 못한다.

따라서 이번 라운드는 PASS가 아니다.

## 2. 차단 결함

### BLOCKER-1 — 실제 주문 웹 앱에 두 번째 40% 규칙이 남아 있다

좌표:

- `clients/web/order-app/index.html:8054-8089` — 상품명/중·대분류 문자열로 메인 장비 부재 판정
- `clients/web/order-app/index.html:8116-8119` — 별도 `0.40` 대입
- `clients/web/order-app/index.html:8189-8200` — 별도 경고 UI
- `clients/web/order-app/src/samhanApi.ts:360-381` — 이 앱이 실제 `drafts → confirm` 주문 API를 호출
- `scripts/launch-local-stack.ps1:165` — order-app 실행 대상
- `services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/service/PriceCalculationService.java:40,61,115-116` — S2 서버 규칙

두 구현은 단순 중복이 아니라 이미 분기됐다.

| 새 조합 | 주문 웹 판정 | S2 서버 판정 | 결과 |
|---|---:|---:|---|
| 전열교환기(HVAC)만, 변동DC=true | 전열교환기를 수량 합계에서 제외하여 40% 미발동 | 허용 코드이며 메인 장비가 아니므로 40% | 불일치 |
| HVAC만, 기존율 7% | 웹은 45%일 때만 40%로 변경하므로 7% 유지 | 기존율과 무관하게 40% | 불일치 |
| 미분류 명칭에 “실외기/실내기” 문자열 없음 + 기존율 45% | 물리 코드가 아니라 문자열로 판정하여 40% 가능 | `UNCLASSIFIED`가 하나라도 있으면 기존율 유지 | 안전 차단 불일치 |

`40`을 S2 변경 파일 안에서만 세면 Java 상수 한 곳이지만, **실 주문 경로 전체로 세면 두 곳**이다. 레거시 주문 화면과 서버가 각각 할인 결정을 소유하므로 확정 사양의 단일 지점을 충족하지 않는다.

### BLOCKER-2 — 견적 제외가 호출자 계약으로 강제되지 않는다

좌표:

- `PriceCalculationRequest.java:15-22` — 같은 DTO의 호출자로 `estimate-service / partner-order-service`를 명시
- `PriceCalculationService.java:61` — `callerService` 확인 없이 모든 요청에 주문 자격 판정
- `PriceCalculationService.java:94` — `callerService`는 감사 로그에만 사용
- `PriceCalculationService.java:134-139` — 판정 입력이 lines뿐임

격리 표적 재현:

```text
callerService      = estimate-service
physicalCategory   = HVAC
hasVariableDiscount= true
category           = HOMEMULTI
listPrice          = 1,000,000
기존 기대 할인율   = 0.0700
실제 할인율        = 0.40
```

실패 원문:

```text
PriceCalculationServiceTest > sol_review_estimate_caller_must_never_receive_order_40_percent_rule() FAILED
expected: 0.0700 but was: 0.40
```

검토용 테스트는 실패 증거를 얻은 뒤 원본에서 제거했다. S2 commit은 견적 서비스 파일을 직접 수정하지 않았고 기존 `495,000 → 420,750` 회귀도 통과한다. 하지만 공용 계산 서비스의 행위 경계는 넓어졌으므로, 견적 제외는 “현재 물리 코드를 안 보낸다”가 아니라 `partner-order-service`만 규칙을 열도록 코드와 테스트로 고정해야 한다.

## 3. 정상 주문 영향 건수 — 공유 DB 읽기 전용 실측

공유 DB에는 V38이 없어, V38 Java 분류기의 정확한 규칙 순서와 구성품 fallback을 조회 결과에 메모리상 적용했다. DB write는 없었다. 현재 비삭제 주문은 **4건 / 8라인**뿐이므로 아래 수치는 이 표본에 현재 카탈로그와 S2 규칙을 적용한 전향 계수다.

| 항목 | 주문 | 라인 |
|---|---:|---:|
| 전체 비삭제 표본 | 4 | 8 |
| 실외기 포함 | 1 | 해당 주문에 포함 |
| 실내기 포함 | 1 | 해당 주문에 포함 |
| 실외기 또는 실내기 포함 | 1 | — |
| 변동DC 비대상 품목만 | 0 | — |
| 미분류/미지 코드 포함 | 2 | — |
| 서버 규칙상 실제 40% 대상 | **1** | **1** |
| 보호 대상인데 잘못 40%가 되는 건 | **0** | **0** |
| 기존 정상 할인율이 40%로 덮이는 건 | **0** | **0** |

현재 4건 중 실외기와 실내기는 같은 주문에 함께 들어 있다. 따라서 “실외기 주문 1 + 실내기 주문 1”을 서로 다른 2건으로 합산하면 안 된다. 변동DC 비대상만으로 구성된 실 주문 표본은 0건이라 그 축의 실데이터 부재도 숨기지 않는다.

V38 예상 제품 분포도 읽기 전용으로 다시 계산했다.

| 제품구분 | 건수 |
|---|---:|
| OUTDOOR | 201 |
| INDOOR | 415 |
| INDOOR_WALL | 40 |
| INDOOR_CEILING | 61 |
| HVAC | 11 |
| PIPING | 167 |
| CONTROL | 29 |
| SERVICE | 34 |
| UNCLASSIFIED | **2,126** |
| 합계 | **3,084** |

미분류 2,126건을 “없음”으로 간주하지 않는 서버 구현은 확인했다. 다만 BLOCKER-1의 주문 웹 문자열 판정은 이 안전 경계를 공유하지 않는다.

## 4. 미분류·할인 회귀 매트릭스

S2 서버 단위 테스트와 강제 재실행 결과:

| 조합 | 확인 결과 |
|---|---|
| 미분류만 / variable=true | 기존 7%, 40% 미발동 |
| 미분류 + HVAC / variable=true | 주문 전체 기존 7%, 40% 미발동 |
| 미분류 + 실외기 / variable=true | 주문 전체 기존 7%, 40% 미발동 |
| 실외기 / variable=true | 기존 7% |
| 실내기 / variable=true | 기존 7% |
| HVAC / variable=true | 40% |
| PIPING / variable=false | 0%, 40% 미발동 |
| 고정DC 25% + 40% 자격 | 고정DC 25% 우선 |
| 정액DC 495,000 | 420,750 유지 |
| 빈 주문 | 미발동 |
| null/blank/미지 미래 코드 | 기존율 유지 |

`qualifiesForNoMainEquipmentRule()`은 허용 목록 밖 코드와 `UNCLASSIFIED`를 판정 불가로 차단한다. 이 부분만 놓고 보면 “미분류는 없음이 아님” 불변식을 지킨다.

## 5. 강제 재실행 결과

실행 명령:

```powershell
.\gradlew.bat :services:dc-config-service:test :services:partner-order-service:test :services:product-service:test --rerun-tasks --no-build-cache --console=plain
```

JUnit XML `<testsuite>` 헤더를 다시 합산했다.

| 모듈 | tests | skipped | failures | errors |
|---|---:|---:|---:|---:|
| dc-config-service | 77 | 0 | 0 | 0 |
| partner-order-service | 520 | 0 | 0 | 0 |
| product-service | 781 | 0 | 0 | 0 |
| 합계 | **1,378** | **0** | **0** | **0** |

Gradle 결과는 `BUILD SUCCESSFUL`이며 4분 33초였다. 종료 시 partner-order의 Testcontainer 종료 뒤 Hikari/metrics shutdown 로그가 있었지만 XML 실패·에러에는 포함되지 않았고 합계도 0이다.

S1 회귀:

- Desktop Vitest: **152 passed, 1 skipped**, 실패 0
- 기존 S1 Playwright: **2 passed** — 미분류 필터 `3,084 → 2,126 → 3,084`와 등록 폼 미분류 표시
- product-service 781에서 V38 apply/reapply/rollback/ECOUNT 복원 회귀 통과
- 받침대 지정 11건, 구성품 역산 41건, 충돌 11건 해소 분포 유지
- 분류기는 모델코드를 입력으로 받지 않으며 모델코드 접두 분류 없음

V38 확인:

- 검토 시 `origin/main` product migration: V1~V37, 37개, 최대 V37
- PR: Java migration V38
- 따라서 현재 `origin/main` 최대값 +1이 맞다.

## 6. Desktop Chromium-1217 Live QA

`clients/desktop` 안에서 임시 Playwright 하네스를 직접 실행했다. API fixture로 동일 주문 상세 화면에 서버 계산 결과 상태를 주입했으며, 공유 DB에는 쓰지 않았다.

최종 결과: **3 passed (3.5s)**

- [40% 적용 — 600,000원](../qa/2026-08-11-order40-sol/01-order-40-applied-visible.png)
- [실외기 포함 차단 — 930,000원](../qa/2026-08-11-order40-sol/02-order-outdoor-blocked-visible.png)
- [미분류 혼합 차단 — 930,000원](../qa/2026-08-11-order40-sol/03-order-unclassified-blocked-visible.png)

DOM 존재만으로 판정하지 않았다. 제목·상태 badge·품목 행·메모에 `toBeVisible`, 양수 bounding box, viewport 교차를 모두 확인했고, 캡처 3장을 원본 해상도로 다시 열어 금액이 실제 보이는 것을 확인했다. 화면 본문 UUID 노출도 없었다.

최초 실행은 제품이 아니라 임시 하네스의 exact-text locator 때문에 timeout이 났다. 실패 원문은 [playwright-first-run-failure.txt](../qa/2026-08-11-order40-sol/playwright-first-run-failure.txt), 최종 원문과 종료 확인은 [playwright-final-output.txt](../qa/2026-08-11-order40-sol/playwright-final-output.txt)에 보존했다. QA Vite 서버와 잔존 Playwright process는 종료했다.

## 7. 구현자 수정 지시서

### 불변식

1. 주문 40% 규칙은 `partner-order-service` 주문 계산에서만 발동한다.
2. 실제 주문 경로의 할인 판정 소유자는 한 곳이어야 한다.
3. null/blank/`UNCLASSIFIED`/미지 코드는 “장비 없음”이 아니라 “판정 불가”이며 주문 전체 40%를 차단한다.
4. 실외기·실내기 존재, 변동DC=false, 고정DC, 정액DC, 견적 계산은 기존 결과를 유지한다.
5. 견적 UI의 기존 커스텀 40% 로직은 이번 S2 범위 밖이므로 수정하지 않는다. 공용 서버에서 주문 규칙이 침범하지 않게만 한다.

### 좌표 전수

- 서버 게이트: `PriceCalculationService.calculate()` / `qualifiesForNoMainEquipmentRule()` / `pickCategoryRate()`
- 호출자 계약: `PriceCalculationRequest.callerService`, `DcConfigClient.CALLER`
- 주문 확정 배선: `PartnerOrderConfirmService`, `ProductClient`, `ProductSummary`, `ProductSummaryResponse`
- 중복 주문 규칙: `clients/web/order-app/index.html`의 `isNoMainUnit`, `runWithAdjustedRates`, `noMainWarn`
- 실제 API 연결: `clients/web/order-app/src/samhanApi.ts`의 `sendOrderFromUi`
- 표적 테스트: `PriceCalculationServiceTest`, `DcConfigClientTest`, `ProductClientTest`, `PartnerOrderConfirmServiceIT`, 주문 웹 계산 회귀 테스트

### 필수 수정 및 재현 데이터

1. `callerService == partner-order-service`일 때만 주문 40% 자격 판정을 열고, `estimate-service`와 다른/미지 호출자는 기존 계산만 수행하도록 고정한다.
2. 다음 회귀를 추가한다: `estimate-service + HVAC + variable=true + HOMEMULTI + 1,000,000`은 7%/930,000이어야 한다. 현재 실제값은 40%/600,000이다.
3. 주문 웹의 독립 `isNoMainUnit → calcH/calcC=0.40` 판정을 제거하고 서버 확정 계산을 정본으로 사용한다. 경고가 필요하면 서버가 확정한 결과/사유를 표시해야 하며 이름 regex로 다시 판정하면 안 된다.
4. 주문 웹에서 다음 불일치 조합을 회귀로 고정한다.
   - HVAC만 + variable=true + 기존율 7%: 서버와 화면 모두 40%
   - HVAC만 + variable=true + 기존율 45%: 서버와 화면 모두 40%
   - UNCLASSIFIED + HVAC + 기존율 45%: 둘 다 기존율, 40% 금지
   - ERV 명칭이지만 physical code=HVAC: 이름과 무관하게 서버 결과 표시
5. 실 주문 API `drafts → confirm` IT에서 확정 응답/저장 스냅샷/재조회 금액이 같은지 확인한다.

### RED-A 표적

- 현재 실 표본 4주문/8라인에서 40% 대상 1주문/1라인
- 실외기·실내기·미분류 보호 주문의 오발동 0주문/0라인
- 기존 할인율의 잘못된 40% 덮어쓰기 0주문/0라인
- 변동DC 비대상만 있는 실 주문 표본은 현재 0건이므로 격리 실 API 표본을 별도로 만든다.

### RED-B 표적

- 미분류 필터 `3,084 → 2,126 → 3,084`
- 받침대 11, 구성품 역산 41, 충돌 해소 11
- `classification_manual` apply/reapply/rollback/ECOUNT 복원 불가침
- 모델코드 접두 분류 없음
- product-service 781, Desktop 152 유지

### 새 조합 전수

- caller: `partner-order-service`, `estimate-service`, null/blank 검증 실패, 다른 내부 서비스명
- physical code: OUTDOOR, INDOOR, INDOOR_WALL, INDOOR_CEILING, HVAC, PIPING, CONTROL, SERVICE, UNCLASSIFIED, null, blank, 미래 코드
- variable: true, false, null
- fixed DC: null, 15%, 25%
- 주문 구성: 단일, 메인+비메인, 미분류+비메인, 미분류+메인, 빈 주문
- 표면: 주문 웹 미리보기, draft payload, confirm 응답, 저장 후 상세 재조회

### 전제가 틀렸을 때 중단 조건

**제 전제가 틀렸다면 고치지 말고 중단·보고한다.** 구체적으로:

- `clients/web/order-app`이 실제 배포·라우팅되지 않는 폐기 코드라는 증거가 있다면 임의 삭제하지 말고 **중단·보고**한다. 배포 manifest, gateway/hosting route, 빌드 산출물의 객관 증거를 제출한다.
- `callerService`를 행위 경계로 신뢰할 수 없다는 설계 전제가 있다면 다른 문자열 heuristic을 추가하지 말고 **중단·보고**한다. 인증된 내부 호출자 경계나 주문 전용 endpoint 대안을 먼저 합의한다.

## 8. 이 라운드가 보지 않은 표면

- 공유 DB에 V38을 실제 적용한 뒤의 migration 결과와 운영 제품 분포 — 공유 DB write 금지 때문에 미검증
- 공유 외부 gateway에서 주문 웹을 실제 사용자로 조작한 `drafts → confirm` E2E — 주문 생성 write 금지 때문에 미검증
- 운영 배포에서 order-app과 dc-config/partner-order 버전이 엇갈리는 시간대
- 현재 공유 DB의 비삭제 4주문/8라인 밖 과거·미래 주문 전체 분포
- 변동DC 비대상 품목만으로 구성된 실 주문 — 현재 표본 0건
- 견적 화면 자체의 커스텀 계산 UX — 명시적 범위 밖이며, 이번 검토는 공용 서버가 견적에 주문 규칙을 적용하지 않는 계약만 검사
- 모바일 등 주문 웹 이외 클라이언트가 확정 전 금액을 별도 계산하는지에 대한 전수 UI E2E
