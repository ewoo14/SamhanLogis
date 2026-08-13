# PR #1126 R3 — bootstrap URL 및 카테고리별 fallback fix

일시: 2026-08-09 KST  
브랜치: `feat/896-qty-sync-chip-track`  
HEAD: `430b8a671e2d41d3fe3034002e46617662e497ce`  
커밋/푸시: 없음

## RED 원문 — fix 전

실행 중이던 product-service `8084`에 `X-Internal-Token: <redacted>`로 호출했다.

```text
GET /products/internal/estimate-catalog/quantity-sync-rules?estimateCategory=HOME_MULTI
HTTP/1.1 500
{"success":false,"code":"INTERNAL_ERROR","message":"서버 내부 오류가 발생했습니다.","data":null,"timestamp":"2026-08-09T12:39:56.584103684Z"}
```

추가한 RED 테스트도 fix 전 실패했다.

```text
BootstrapServiceTest.fetch_한카테고리_실패시_정상카테고리는_보존하고_실패카테고리를_로그에_남긴다
AssertionError — 정상 COMMERCIAL_MULTI payload 보존 단언 실패
```

## 소비자 전수 확인

| 소비자 | 경로 | 판정 |
|---|---|---|
| estimate-app `db-catalog.js` `quantitySyncRules()` | `/products/internal/estimate-catalog/quantity-sync-rules` | 이번 endpoint 이동의 의도된 호출자 |
| estimate-app 나머지 getter | 동일 `BASE=/products/internal/estimate-catalog` | BASE 변경 없이 유지 |
| order-app `samhanApi.ts` | gateway `/api/v1/quantity-sync-rules` | 별도 `QuantitySyncRuleController`, 영향 없음 |
| desktop `quantitySyncApi.ts` | gateway `/api/v1/quantity-sync-rules` | react-query 관리 화면, 영향 없음 |

## 변경 내용

1. `quantity-sync-rules` 매핑을 `EstimateCatalogInternalController`의
   `/products/internal/estimate-catalog` 아래로 이동하고 `ProductInternalController`의 죽은 매핑과
   전용 의존성을 제거했다. 두 경로 모두 동일한 `InternalTokenFilter` 대상 prefix를 사용한다.
2. partner-order bootstrap의 product catalog 조회를 축별로 격리했다. 실패한 축의 key는 product
   payload에 넣지 않아 기존 sheet/seed fallback으로 내려가며, 성공한 축은 보존한다.
3. 실패 로그에 `category=HOME_MULTI` 같은 축 이름을 남긴다. 모든 축이 비거나 실패하면 기존
   `Map.of()` 반환으로 전체 fallback 동작을 유지한다.

## 라이브 fix 전/후

### fix 전

위 RED 원문처럼 `HTTP 500 / INTERNAL_ERROR / data:null`이었다.

### fix 후

동일 `8084`, 동일 내부 토큰으로 실제 호출했다.

```text
GET /products/internal/estimate-catalog/quantity-sync-rules?estimateCategory=HOME_MULTI
HTTP/1.1 200
{"success":true,"code":"OK","message":"성공","data":[{"ruleKey":"UI_HOME_MULTI_AM052BN6PBH1","estimateCategory":"HOME_MULTI","enabled":true,"sources":[{"productCode":"AM052BN6PBH1"}],"targets":[{"productCode":"PC6NUDK1NW"},{"productCode":"AWR-WE13N"},{"productCode":"FH-LFHLN"}]}]}
```

실측: 규칙 1건, target 3건. `products?category=HOME_MULTI`는 121건으로 다른 getter도 유지됐다.

### 종합견적서 실제 화면

수량 2 입력 후 실제 대상값:

```text
PC6NUDK1NW: qty=2, unitPrice=104060, subtotal=208120
AWR-WE13N:  qty=2, unitPrice=45375,  subtotal=90750
FH-LFHLN:   qty=2, unitPrice=10000,  subtotal=20000
```

따라서 R3 후 기본 옵션은 legacy 무선 리모컨 fallback이 아니라 서버 규칙 target인 `AWR-WE13N`을
소비했다. 캡처: [docs/qa/2026-08-09-896-r3](../qa/2026-08-09-896-r3/)

## fix가 만든 표면 점검

- endpoint 이동 후 인증 조합: 정상 경로에 토큰을 주면 200, 내부 토큰 필터가 적용되는 prefix가
  두 controller에서 동일하다. 새 route 통합 테스트가 200과 배열 응답을 확인했다.
- 제거 식별자 grep: `ProductInternalController.quantitySyncRules`, `quantitySyncRuleService`
  및 `QuantitySyncEstimateCategory`/`QuantitySyncRuleResponse` 전용 import는 해당 controller에서
  제거됐고, 새 식별자는 `EstimateCatalogInternalController`에만 존재한다.
- 참조 테스트: product-service `EstimateCatalogInternalControllerIT` 및
  `ProductInternalControllerTest`, partner-order `BootstrapServiceTest`, estimate-app 수량
  동기화 Jest 테스트를 실행했다.

## 하드게이트 원문

```text
[guard] expected=1 unexpected=0 skipped=0 flaky=0
```

fresh Playwright 실 QA는 1건 실행·통과했다. 브라우저 플러그인은 이 환경에서 연결되지 않아 headless
Playwright 실행으로 대체했다.

## 검증 결과

```text
BUILD SUCCESSFUL — :services:product-service:test --tests "*EstimateCatalogInternalControllerIT"
BUILD SUCCESSFUL — :services:product-service:test --tests "*ProductInternalControllerTest"
BUILD SUCCESSFUL — :services:partner-order-service:test --tests "*BootstrapServiceTest"
PASS — estimate-app quantity-sync-bootstrap.test.js + quantity-sync.test.js (4/4)
[guard] expected=1 unexpected=0 skipped=0 flaky=0
```

## 이번 라운드에서 하지 않은 것

- `OUT_OF_STOCK` enum 불일치로 `SINGLE_SET`·`COMMERCIAL_MULTI` 일부 API가 500이 되는 표면은
  지시대로 수정하지 않았다. `#1133` 트랙 대상이다. 라이브 `price-baseline`에서도 같은 계열의
  500이 관찰됐다.
- 하드코딩 규칙 migration, `recomputeHomeDerived` 제거, 리모컨 특수 분기는 수정하지 않았다.
- 공유 DB write는 하지 않았다. 실 화면의 규칙 표본은 기존 관리자 API/기존 표본을 소비했다.

## 신규 파일

- `docs/dev-reports/2026-08-09-896-r3-bootstrap-url-fix.md`
- `docs/qa/2026-08-09-896-r3/*.png` — 기존 실 QA 캡처를 R3 증거 디렉터리로 복사

