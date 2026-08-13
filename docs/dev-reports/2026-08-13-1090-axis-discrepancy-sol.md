# 2026-08-13 #1090 화면/API 축 불일치 규명 — CODEX SOL

## 0. 결론

**두 축은 같은 값을 재지 않았다.**

- 라이브QA의 견적 작성 화면은 product-service 검색 응답의 `sellingPrice=316800`을 받아 `resolveEstimateCatalogPrice(sellingPrice, fixedDiscountRate)`만 실행한다. 이 경로는 거래처 정액 DC 설정을 조회하지 않고 `discountOption`도 계산 입력으로 넘기지 않는다. 따라서 사용자가 이 화면에서 실제로 보는 값은 **316,800원**이다.
- 재수렴2의 **266,800원**은 API 응답 본문에 들어 있던 금액이 아니다. 격리 DB/API로 `discountOption=ONE_WAY` 상태를 확인·전이한 뒤 Desktop의 별도 계산기 `calculateSlipDiscount()`에 판매가 316,800원과 거래처 `oneWay=50000`을 넣어 산출한 값이다.
- 따라서 ① **경로가 다르다**와 ② **견적 화면이 정액 DC를 싣지 않는다**가 함께 참이다. ③ 낡은 배포본과 ④ 조건 불일치는 이번 50,000원 대표 조합의 원인이 아니다.
- `main`도 같은 견적 가격 함수 blob을 쓰고 거래처 DC 계산 호출이 없다. 브라우저를 제공받지 못해 `main` 실화면 자체는 다시 열지 못했지만, `main` 원문과 동일 함수 실행 결과는 **316,800원**이다. 즉 #1090 신규 회귀가 아니라 기존 견적 작성 경로 결함이다.
- 주문 화면에서 품목이 없던 이유는 결함성 유실이 아니라 **검증 데이터가 견적 전용(`usageScope=ESTIMATE`)으로 저장됐기 때문**이다. 주문 bootstrap은 `scope=PARTNER_ORDER`만 요청한다. 격리본에서 `ESTIMATE`일 때 4개 카탈로그 모두 미포함, `BOTH`로 바꾸면 `HOME_MULTI`에 즉시 포함됨을 실행 확인했다.

## 1. 검증 환경과 제한

- 공유 PostgreSQL은 `product_db` custom-format dump와 SELECT에만 사용했다. 공유 DB 쓰기 0건.
- 격리 컨테이너 `axis1090-pg` 한 개에 `product_db`를 복제했다.
- 현재 브랜치 `product-service.jar`만 로컬 55184 포트로 기동했다. 공유 Docker 스택은 중지·재기동하지 않았다.
- 격리 복제본에서만 usage/classification PATCH를 실행했다.
- Browser 런타임 조회 결과 사용 가능한 브라우저가 0개였다. 따라서 이번 라운드에 새 GUI 네트워크 캡처를 만들 수 없었다. 아래 표는 기존 라이브QA 화면 증거, 호출 코드 전수 추적, 격리 HTTP 재실행을 결합한 것이다. 실제 브라우저 HAR라고 주장하지 않는다.

## 2. 견적 단가 관련 요청 전수표

대상 범위는 `/sales/estimates/new`에서 거래처 검색·품목 검색·품목 선택·거래처 변경으로 단가가 결정되는 요청이다. 알림·권한 등 페이지 공통 boot 요청은 금액 결정과 무관해 제외했다.

| 순서/조건 | 요청 | 응답의 금액·DC | 화면 소비 결과 | 실행/근거 |
|---|---|---|---|---|
| 거래처 입력 시 | `GET /admin/partners/search?q={검색어}&size=8` | 거래처 식별·명칭. 정액 DC 금액 없음 | 거래처 snapshot만 저장 | `EstimateFormPage.tsx`의 `searchEstimatePartners`; 라이브QA 거래처 선택 화면 |
| 품목 입력 시 주 경로 | `GET /api/products?q=AC023BN1DBC1&size=50&usageScope=ESTIMATE` | 격리 HTTP 200: `sellingPrice=316800.00`, 분류 저장 후 `discountOption=ONE_WAY`, `fixedDiscountRate=null`; `classificationAssigned` key 없음 | `sellingPrice`와 `fixedDiscountRate`만 `resolveEstimateCatalogPrice`에 전달 → **316800** | 현재 branch jar + V42 격리 HTTP 재실행 |
| 검색 결과가 1건 이상 | 아래 legacy fallback 요청 **없음** | 해당 없음 | 주 경로 후보 사용 | `searchEstimateProducts`: candidates가 있으면 즉시 return |
| 검색 결과가 0건인 경우에만 | `GET /slips/lookup-product?modelName={모델명}` | `sellingPrice` 등. 이번 대상에서는 미호출 | legacy fallback | 호출 조건 원문 확인; 대상 검색 응답 1건 |
| 거래처를 먼저 고른 뒤 품목 선택 | `GET /slips/price-memory?partnerId={내부값}&productId={내부값}` | 라이브QA는 화면 마커가 `판매가`, 값 316800이므로 memory miss 경로. 정액 DC 설정은 응답 대상이 아님 | miss면 catalog 316800 유지 | 화면 `판매가` 마커, `getPriceMemory` 소비 코드 |
| 품목을 먼저 고른 뒤 거래처 선택 | `POST /slips/price-memory/bulk` body `{partnerId, productIds}` | 라이브QA 배너 `판매가 1건 · 변경 0행`; 정액 DC 설정 없음 | hit가 없으면 catalog 316800 유지 | 스크린샷 02/12/24의 배너와 `usePartnerPriceRefresh` |
| 편집 hydrate에서 catalog 가격이 비었을 때만 | `POST /api/products/lookup` | `sellingPrice` 등 | 신규 작성 대상은 이미 `catalogUnitPrice`가 있어 미호출 | `refreshAutoPricesForPartner` 조건 추적 |
| 거래처 정액 DC | **요청 없음** (`getPartnerDcConfig` 호출 0) | `oneWay=50000/60000`을 견적 폼이 받지 않음 | 정액 DC 적용 불가 | `EstimateFormPage.tsx` import·호출 전수 검색 0건 |

핵심 HTTP 응답 원문 요약:

```json
{
  "http": 200,
  "modelName": "AC023BN1DBC1",
  "sellingPrice": 316800.00,
  "usageScope": "ESTIMATE",
  "estimateCategories": ["HOME_MULTI"],
  "fixedDiscountRate": null,
  "discountOption": "ONE_WAY",
  "classificationAssignedKey": false,
  "hasVariableDiscount": false,
  "status": "ACTIVE"
}
```

화면 계산 원문:

```text
resolveEstimateCatalogPrice(316800, null)
=> { unitPrice: 316800, appliedRate: 0 }
```

`EstimateFormPage`는 ProductOption에 있던 `discountOption`을 내부 `result`로 정규화할 때도 승계하지 않으며, 최종 가격 함수 자체도 인자가 `sellingPrice`, `fixedDiscountRate` 두 개뿐이다.

## 3. 재수렴2 경로와 대조

재수렴2 보고서의 경로:

1. 격리 DB에 V42 적용.
2. usage/classification API 상태 전이를 실행하고 `discountOption=ONE_WAY` 승격을 확인.
3. 실제 Desktop 계산 함수 `calculateSlipDiscount()`를 판매가·모델·분류 옵션·거래처 DC 설정과 함께 실행.
4. 결과를 `266800 → 266800`으로 기록.

동일 조건의 이번 직접 실행:

```json
{
  "estimateScreen": {"unitPrice":316800,"appliedRate":0},
  "discountCalculatorBefore": {
    "unitPrice":266800,"source":"OPTION",
    "info":"거래처 싱글세트 정액DC 50000원 적용"
  },
  "discountCalculatorAfter": {
    "unitPrice":266800,"source":"OPTION",
    "info":"거래처 싱글세트 정액DC 50000원 적용"
  }
}
```

즉 “API·DB 축 266,800원”이라는 축 이름이 오해를 만든다. API는 원가격 316,800원과 할인 메타데이터를 주며, **266,800원은 별도 클라이언트 계산기의 산출값**이다. 견적 화면은 그 계산기를 호출하지 않는다.

## 4. 후보 ①~④ 판정

### ① 경로가 다르다 — 참, 직접 원인

근거 원문:

```text
EstimateFormPage:
  GET /api/products ...
  resolveEstimateCatalogPrice(Number(result.sellingPrice), result.fixedDiscountRate)

재수렴2:
  calculateSlipDiscount({
    listPrice: 316800,
    modelCode: AC023BN1DBC1,
    classificationOptions: [ONE_WAY],
    category: OTHER
  }, { oneWay: 50000 })
```

같은 product 검색/상태 데이터를 출발점으로 삼더라도 최종 계산 함수와 입력이 다르다.

### ② 화면이 DC를 안 싣는다 — 참, 기존 결함

- 견적 폼에는 `getPartnerDcConfig` 호출이 0개다.
- `calculateSlipDiscount` 호출도 0개다.
- 거래처 선택 시 조회하는 것은 DC 설정이 아니라 최근 수동단가 memory다.
- 옵션 DC 50,000원·60,000원 거래처 모두 316,800원인 관측과 정확히 일치한다.
- `main`의 `resolveEstimateCatalogPrice.ts` blob은 branch와 동일하다(`7e8b23e...`). `main`의 `EstimateFormPage`도 `resolveEstimateCatalogPrice`만 호출하며 위 두 호출은 없다.

따라서 `main`도 동일 데이터·memory miss 조건이면 316,800원이다. 다만 이번 라운드에는 브라우저가 없어 `main` 실화면 캡처를 새로 만들지 못했다.

### ③ 낡은 배포본 — 이번 불일치의 원인 아님

남아 있는 산출물 시각:

```text
product-service.jar      2026-08-13 03:45:53 KST
Desktop dist/web         2026-08-13 03:53:08 KST
첫 금액 스크린샷          2026-08-13 04:12:29 KST
```

빌드된 Desktop bundle에는 `classificationAssigned`, `discountOption`, `거래처 싱글세트 정액DC` 문자열이 모두 있다. 라이브QA 보고서에는 post clone의 Flyway V42 성공과 분류 저장 후 DB `ONE_WAY`가 기록돼 있다. 이번 격리 재실행에서도 같은 jar가 V37→V42를 적용했고 최신 검색 응답에 `discountOption=ONE_WAY`가 들어왔다. 그런데 견적 가격 경로 실행 결과는 여전히 316,800원이다.

주의: 현재 공유 `samhan-product-service` 자체는 이미지 생성 2026-08-11 12:51 KST, DB Flyway V37까지만 있어 낡았다. 그러나 기존 라이브QA는 공유 product-service가 아니라 별도 pre/post 격리 서비스를 사용했다고 기록되어 있으며, 현재 공유 스택의 낡음은 이번 스크린샷 원인과 분리된다.

과거 라이브QA 컨테이너는 종료·삭제돼 정확한 컨테이너 ID/Created 시각은 재조회하지 못했다.

### ④ 거래처·조건이 다르다 — 대표 50,000원 조합에는 거짓

- 품목: 양쪽 `AC023BN1DBC1`.
- 판매가: 양쪽 316,800원.
- 수량: 화면 1, 계산 대표도 단가 기준 1.
- 거래처 옵션: 라이브QA `환경시스템공조-김진혁대표님` 50,000원; 재수렴 대표 `oneWay=50000`.
- 분류 옵션: 분류 저장 후 API/DB `ONE_WAY`.
- 가격기억: 화면 마커는 `판매가`여서 remembered price가 우선한 상황이 아니다.

50,000원 조건이 맞는데도 견적 폼이 DC 설정을 요청하지 않아 차이가 난다. 60,000원 조합은 같은 원인의 추가 증거다.

## 5. 사용자가 실제로 보는 값

질문한 **견적 작성 화면**에서 사용자가 실제로 보는 값은 **316,800원**이다.

- 기존 24장 중 대상 견적 캡처 전·후·분류 저장 후가 모두 `단가(VAT포함) 316800`, `공급가액 288,000`, `부가세 28,800`, `총합 316,800`이다.
- 최신 branch API도 `sellingPrice=316800`을 응답한다.
- 화면이 실제 호출하는 가격 함수 결과도 316800이다.

266,800원은 같은 데이터에 정액 DC 계산기를 적용했을 때의 기대/계산값이다. 따라서 애플리케이션 전체에 단일한 “실제 값”이 있는 것이 아니라, 현재는 **경로별 값이 갈라져 있다**. 견적 작성 GUI는 316,800원이고, `calculateSlipDiscount`를 쓰는 전표/주문 가격 계산 경계는 266,800원이다.

## 6. 주문 화면에서 품목이 없는 이유

주문 bootstrap의 product-service 호출 원문:

```text
HOME_MULTI      + scope=PARTNER_ORDER
COMMERCIAL_MULTI+ scope=PARTNER_ORDER
SINGLE_SET      + scope=PARTNER_ORDER
LEGACY          + scope=PARTNER_ORDER
```

라이브QA 분류 저장 후 화면 `22-V42-after-classification-AC023BN1DBC1-saved.png`에는 `견적 노출`만 체크되고 `주문 노출`은 체크되지 않았다. 격리 DB/API도 대상 품목을 `usageScope=ESTIMATE`로 저장했다.

격리 실행 결과:

| 저장 scope | 주문 카탈로그 | 행 수 | 대상 포함 |
|---|---|---:|---|
| ESTIMATE | HOME_MULTI | 107 | false |
| ESTIMATE | SINGLE_SET | 224 | false |
| ESTIMATE | COMMERCIAL_MULTI | 382 | false |
| ESTIMATE | LEGACY | 39 | false |
| BOTH로 한 변수만 변경 | HOME_MULTI | 108 | **true** |

따라서 bootstrap에서 빠진 이유는 `usageScope` 필터가 정상 작동했기 때문이다. 라이브QA가 주문 금액을 대조하려면 대상 품목을 `PARTNER_ORDER` 또는 `BOTH`로 노출한 별도 격리 fixture를 준비했어야 한다. 현재 증거로는 주문 bootstrap 결함이 아니다.

## 7. 무엇을 고쳐야 하는가 — 구현하지 않음

이번 라운드에서는 고치지 않았다. 필요한 수정 방향은 다음 한 가지다.

- 견적 작성/편집의 신규 품목 선택 및 거래처 변경 재가격 경로가 `SlipFormPage`와 같은 정액 DC 계약을 사용하도록 통합해야 한다. 구체적으로 거래처 DC 설정과 product의 `discountOption`/분류 메타데이터를 `calculateSlipDiscount`에 전달하고, 최근 수동단가가 있으면 기존 우선순위를 보존해야 한다.
- main에도 같은 결함이 있으므로 #1090의 V42만 되돌리거나 product-service 응답 숫자를 바꾸는 수정은 원인을 고치지 못한다.
- 주문 QA fixture는 주문 노출 scope를 명시해 만든 뒤 별도로 금액을 대조해야 한다.

## 8. 못 한 것

- 사용 가능한 Browser가 0개여서 이번 라운드의 새 DevTools/HAR 전수 캡처는 못 했다.
- 같은 이유로 `main` 실화면을 새로 열어 316,800원을 캡처하지 못했다. 대신 동일 blob 확인과 동일 함수 실행으로 대조했다.
- 과거 라이브QA 격리 컨테이너가 이미 삭제돼 그 컨테이너의 image ID/Created를 직접 조회하지 못했다.
- 주문 화면에 품목을 실제 올려 266,800원을 보지는 않았다. `BOTH` 전환 후 product-service 주문 카탈로그 포함까지만 실행 확인했다.

## 9. 실행 원문 요약

```text
branch                         feat/1090-1140-discount-axis
branch HEAD                    2192668edcb9fa3ce912eeaffd53e43e74b284b5
origin/main                    668e4d0f5ee0f55c179dc982b35e7b8979346bb3

격리 Flyway:
Current version: 37
Migrating 38
Migrating 42 - classification discount option canon
Successfully applied 2 migrations, now v42

격리 DB 분류 저장 후:
AC023BN1DBC1|316800.00|ESTIMATE|ONE_WAY|catL=true|catM=true
```

## 10. 라운드 종료 점검

삭제된 추적 파일 0개. `tools/.s24-build-only/build/deep/tracked-writer.mjs`는 추적 상태이고 실제 파일도 존재한다. 이번 라운드가 만든 `axis1090-pg`, 55184 product-service, `axis1090-product.*` 임시 파일은 모두 정리했으며 공유 Docker 스택은 중지·재기동하지 않았다. 기존에 떠 있던 `_probe-order.cjs` 프로세스는 이번 라운드가 만든 것이 아니므로 건드리지 않았다.
