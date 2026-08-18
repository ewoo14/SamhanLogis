# PR #1241 저장·전달 경로 — CODEX LUNA 보고서

## ① 결함별 RED 원문

### ① 신규 구성품 고정금액

`npm test -- --run src/renderer/routes/ProductFormPage.test.tsx` 최초 실행에서 신규 행 입력 테스트가 실패했다.

```text
신규 구성품의 입력한 고정금액을 구성품 저장 요청에 포함한다
→ expected payload.fixedAllocationAmount to be '123456', received null
```

### ② replace-all 기존 계약 보존

재현 테스트는 RED가 아니라 GREEN이었다. 현재 프런트의 replace-all 매핑이 로드된
`allocationMode`, `allocationWeight`, `fixedAllocationAmount`를 이미 payload에 보존하고 있었다.
따라서 없는 결함을 수정하지 않았다.

### ③ 반올림 단위

```text
반올림 단위 입력을 allocationRoundUnit으로 저장 요청에 포함하고 기본값도 유지한다
→ expected allocationRoundUnit: 500, received payload has no allocationRoundUnit
```

빈 고정금액 양방향 테스트도 추가했으며, 빈 값은 `null`로 유지된다.

## ② 고친 내용

- 신규 구성품 draft에 `allocationRoundUnit: 1000`을 명시하고, 고정금액 입력값을 그대로 저장 payload에 전달.
- 반올림 단위를 controlled input으로 전환하고, 빈 입력은 기존 기본 동작인 `1000`으로 유지.
- 구성품 API 타입/응답/요청에 `allocationRoundUnit`을 연결.
- product-service가 구성품 replace-all 요청의 반올림 단위를 부모 Product에 저장하고, GET 응답에 다시 반환.
- 기존 `BundleAllocationPolicy` 및 `BundleExpander` 계산식은 변경하지 않음.

## ③ GREEN

- `npm test -- --run src/renderer/routes/ProductFormPage.test.tsx`: **18 passed / 0 failed**
- `npm run typecheck`: **exit 0**
- `npm run lint`: **exit 0** (기존 warning 196개, error 0)
- `npm run build`: **exit 0**
- `./gradlew :services:product-service:compileJava`: **BUILD SUCCESSFUL**
- `./gradlew :services:product-service:test --tests '*BundleComponentServiceTest'`: **BUILD SUCCESSFUL**

전체 product-service 테스트는 코드 실패가 아니라 실행 환경에 `SAMHAN_GATEWAY_ATTESTATION`이 없어
`GatewayAttestationMockMvcConfig.java:24`에서 컨텍스트 초기화가 실패했다.

```text
805 tests completed, 379 failed
Caused by: java.lang.IllegalStateException at GatewayAttestationMockMvcConfig.java:24
```

## ④ 라이브 캡처 목록

캡처 0장. Playwright Chromium 자체는 기동했으나, renderer 실서버 화면이 로그인 화면에 머물렀다.
실패 원문:

```text
TimeoutError: locator.waitFor: Timeout 30000ms exceeded
waiting for getByTestId('product-form-components-editor') to be visible
Page snapshot: Samhan Public 로그인 / 로그인 button disabled
```

따라서 공유 DB에 값을 쓰지 않았고 원복할 QA 변경도 없었다. 캡처 스펙은
`clients/desktop/playwright/1241-save-path-real-qa/1241-save-path-real-qa.spec.ts`에 작성했으며
캡처 경로는 `resolveQaShotsDir()`를 경유한다.

## ⑤ 주문서웹·견적서웹 캐시 선택지 — 이번 슬라이스에서는 선택/구현하지 않음

확인 결과 주문서웹의 `partner-order-service BootstrapService`는
`app.bootstrap.cache-refresh-minutes` 기본값 10분 스케줄러로 캐시를 갱신한다.
견적서웹도 `clients/web/estimate-app/lib/code.js`의 catalog bootstrap cache에 TTL 600초가 있다.
즉 두 웹 모두 변경 직후 지연 가능성이 있다.

가능한 선택지는 다음과 같다.

1. TTL 단축: 설정값만 줄여 단순하게 반영 지연을 줄인다. DB/API 부하와 외부 catalog 조회 비용이 증가한다.
2. 저장 후 무효화 신호: product-service 저장 성공 이벤트를 order/estimate bootstrap cache eviction으로 전달한다. 즉시성은 좋지만 이벤트 계약, 재시도, 서비스 간 장애처리가 필요하다.
3. 요청 시 재검증: bootstrap 요청마다 버전/updatedAt을 확인해 변경 시에만 재구성한다. 평상시 부하는 낮출 수 있으나 버전 저장소와 조건부 요청 설계가 필요하다.
4. 수동 강제 새로고침: 운영자가 캐시 무효화 endpoint/작업을 호출한다. 구현 비용은 낮지만 사용자 요구인 자동 즉시 반영을 충족하지 못한다.

## ⑥ 재현 실패한 것

- ② 기존 금액·비중·배분모드 유실: 현재 프런트 payload에서 재현되지 않아 수정하지 않음.
- Playwright 실 저장·재조회: Chromium은 실행됐으나 라이브 인증/renderer가 로그인 화면에 남아 캡처 단계에 도달하지 못함.

## ⑦ 프로세스 회수

이번 검증에서 기동한 renderer Vite 프로세스는 회수 대상이다. 공유 DB 변경은 없었다.
기존에 실행 중이던 Java/Node 프로세스는 이 세션에서 기동하지 않았으므로 건드리지 않았다.
