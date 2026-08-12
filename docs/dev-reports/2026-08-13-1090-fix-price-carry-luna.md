# #1090 분류 저장 후 정액 DC 근거 보존 fix — CODEX LUNA

> 작업일: 2026-08-13 KST  
> 브랜치: `feat/1090-1140-discount-axis`  
> 공유 DB write 없음. 테스트 DB/Testcontainers만 사용.

## 결론

분류 L/M/S를 임의로 채우지 않고, 분류 저장 시 기존 모델 표식이 이미 가리키던 정액 DC 옵션만 `discount_option` 정본으로 승격했다. 이후 가격 계산은 저장된 `discountOption`만 사용한다. 미분류 전환 대기 품목은 기존 호환 fallback을 유지하므로 V42 직후 금액도 보존된다.

`classificationAssigned`는 Java record 내부 호환 상태로만 남기고 `@JsonIgnore` 처리해 `/products/lookup`을 포함한 사용자 응답 JSON에서 제거했다. Desktop과 partner-order의 상태 판단도 공개 플래그가 아니라 `discountOption` 존재 여부를 기준으로 맞췄다.

## RED 원문

### 분류 저장 후 AC023BN1DBC1 상승

추가한 테스트: `slipDiscount.classification-canon.test.ts`의 `AC023BN1DBC1 분류 저장 전후 단가가 상승하지 않는다`.

```text
expected { before: 266800, after: 266800 }
received { before: 266800, after: 316800 }
```

재현 조건은 판매가 316,800원, ONE_WAY 정액 DC 50,000원, 저장 전 `classificationAssigned=false`, 저장 후 `true` + 빈 정본 옵션이었다.

### lookup 내부 상태 노출

추가한 `ProductSummaryResponseTest` RED:

```text
Expecting value to be false but was true
```

`ObjectMapper(ProductSummaryResponse.from(product))` JSON에 `classificationAssigned` key가 실제 포함됐다.

### PartnerOrderConfirmServiceIT 회귀

수정 전 `confirm_applies_dc_final_price_from_price_calc`가 실패했다. `ProductSummary` 6-arg fixture는 `modelCode=null`, `modelName=AM360AXVHHR1SY`인데, 브랜치의 공통 레거시 판별에서 `is360=false`가 되어 `sent.is360()` 기대와 불일치했다. `main`은 모델명 `360` 보정 경로가 있어 같은 테스트가 통과했다.

## GREEN 및 구현

- `LegacyModelFlags`에 모델명 내 `360` 표식을 보존했다.
- `Product.carryForwardLegacyDiscountOption()`을 추가했다. 기존 `discountOption`이 없을 때만 모델 표식의 옵션을 `THREE_SIXTY`/`FOUR_WAY`/`ONE_WAY`/`STAND`/`DELUXE`/`FIRST_GRADE` 중 하나로 승격한다.
- `ProductService.updateClassificationAndFixedDiscount()`가 L/M/S 저장 직후 위 승격만 호출한다. L/M/S 값은 변경하지 않는다.
- partner-order는 `discountOption == null`일 때만 전환기 fallback을 사용하고, 값이 있으면 분류 정본 flag만 전송한다.
- `ProductSummaryResponse.classificationAssigned`는 `@JsonIgnore`; Desktop 매핑은 `discountOption != null`로 내부 상태를 파생한다.

따라서 레거시 판별은 미분류 전환기 입력을 정본으로 옮기는 한 번의 경계에서만 사용되고, 분류 저장 이후 runtime 판별은 `discountOption` 한 곳에서 나온다.

## 금액 전수 대조 및 112 vs 113 정정

전수 fixture는 **113행**이며, 누락으로 지적된 `AP290RXPDHH1|5177700|STAND`를 포함한다. 테스트에 행 수와 품목 존재 assertion을 고정했다.

```text
113행 fixture 로드                         113
AP290RXPDHH1 포함                           true
분류 저장 전후 단가 mismatch                 []
0원 예외                                     AC110BN4PBH1PP: 0 -> 0
```

직전 보고서의 “113건 금액표”는 실제 표 출력이 **112행**이었고 `AP290RXPDHH1`이 누락됐다. 정정된 범위는 113행이며, 실제 사용자 경로에서 판매가가 양수인 영향 품목은 이전 격리 DB 전수 집계와 동일하게 **98품목**, 옵션 DC 거래처 조합은 **2,781건**이다. 113행 전수 계산에는 0원 1행이 포함되므로 금액 상승 행은 112행이다.

분류가 이미 있는 218건 이관 정확성, 미분류 113건 임의 채움 0건, 세 집합 교집합 0, V42 번호 충돌 0은 변경하지 않았다. 이번 코드 테스트는 해당 DB 집합을 다시 쓰지 않았으며, 기존 격리 집계 증거와 113행 전수 계산을 함께 사용했다.

## 검증 원문 요약

```text
shared:common:test                                      BUILD SUCCESSFUL
services:product-service:test                           BUILD SUCCESSFUL
services:partner-order-service:test                     BUILD SUCCESSFUL
PartnerOrderConfirmServiceIT focused                    BUILD SUCCESSFUL
CategoryRepositoryIT (fresh PostgreSQL, Flyway V1->V42) BUILD SUCCESSFUL
Desktop slipDiscount 관련                               35/35 PASS
npm run typecheck                                       PASS (real-QA 51/51)
```

## 못 한 것

- 이번 라운드에서 공유 DB를 직접 갱신하거나, 별도 수동 복제 DB에 PATCH를 다시 수행하지 않았다. 따라서 98품목×2,781 거래처 조합을 API 클릭으로 재실행한 것이 아니라, 지정된 격리 실측의 98/2,781 집계와 113행 가격 fixture를 코드 변경 후 재검증했다.
- 실제 저장된 과거 견적·주문 라인의 byte 대조는 수행하지 않았다. 이번 결함은 새 분류 저장 후 재가격 경로이며, 기존 보고서 기준 대상 113행에는 저장 라인 0건이었다.

## 라운드 종료 점검

삭제된 추적 파일 없음(`git ls-files --deleted` 기준). `tools/.s24-build-only/build/deep/tracked-writer.mjs`는 추적·존재 상태다. Testcontainers/fresh PostgreSQL은 테스트 종료 시 정리됐다. 작업 디렉터리 경로를 포함한 Java/Node/npm/npx/Electron 잔류 프로세스 없음.
