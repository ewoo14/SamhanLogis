# PR #1272 fix 라운드 2 — CODEX LUNA 결과

검증일: 2026-08-18 KST  
대상 브랜치: `feat/category-settings-migration`  
기준 SHA: `f11e8c86e`

## ① 권한 전건 실패의 공통 원인

실제 권한 AOP 또는 Gateway 라우트 순서의 보안 우회가 아니었다. 신규 `ProductCatalogController` 생성자에 `BundleComponentEstimateSettingService`가 추가됐지만 `ProductPermissionControllerIT`의 `@WebMvcTest` 격리 컨텍스트에 해당 mock이 누락됐다.

수정 전 실행 결과는 `104 tests completed, 104 failed`, 최초 원인은 `NoSuchBeanDefinitionException`이었다. MockMvc 요청이 컨트롤러/AOP에 도달하기 전 Spring 컨텍스트 생성이 실패했으므로 응답 코드 자체를 관찰하지 못한 테스트 구성 회귀였다.

수정은 테스트에 `@MockBean BundleComponentEstimateSettingService`를 추가한 한 가지 공통 지점만 반영했다. 권한 단정과 카운터 단정은 변경하지 않았다.

## ② 실제 HTTP 403 재현 원문

브랜치 Gateway 포트 `18084` 및 product-service 포트 `18085`는 이번 세션 시작 시점에 기동되어 있지 않았다. 따라서 무권한 계정의 브랜치 실제 HTTP 호출은 수행하지 못했다. 공유 포트 `8080/8081`은 다른 스택이므로 브랜치 검증으로 오인해 호출하지 않았다.

대신 수정 후 권한 계약 테스트를 실제 실행했다.

```text
.\gradlew.bat :services:product-service:test --tests com.samhanair.logis.product.it.ProductPermissionControllerIT
BUILD SUCCESSFUL in 16s
```

이 테스트의 `migratedEndpoint_withoutGrant_returns403AndIncrementsCounter(EndpointCase)` 전건이 실제 MockMvc 응답 `403 Forbidden` 단정과 deny counter 증가 단정을 통과했다. 라이브 브랜치 HTTP 403은 미검증으로 남긴다.

## ③ ProductFormPage 판정

사라진 `블랙` 특징 선택, `형상` 선택, 종류/수량동기화 편집은 PR의 의도된 이전 대상이다. 기초품목 화면에는 구성품 관계·기본수량·납품가 정본과 구성품 코드가 남아야 한다.

기존 테스트는 제거된 `블랙`·`형상` UI를 계속 요구하고 있어 현실 기준으로 갱신했다. 구성품 코드 `PANEL-360` 보존 및 저장 요청의 `componentProductCode` 단정은 유지했다.

```text
npx vitest run src/renderer/routes/ProductFormPage.test.tsx
1 test file passed · 18 tests passed

npm run build
BUILD SUCCESSFUL (electron-vite main/preload/renderer)

npx vitest run --reporter=dot
Exit code 0 · 전체 Desktop 테스트 통과
```

## ④ 미검증 2축

- 주문서웹 실제 UI 품목 수: 미검증. 재판정 2차 보고서의 `/api/v1/partner-orders/bootstrap` HTTP 503 상태가 이번 세션에도 남아 있었고, 브랜치 주문서웹 서버를 기동하지 않았다. exposure 원본 행 수 무변화만 기존 실측으로 보존한다.
- 동일 부모가 둘 이상의 카테고리에 노출된 실제 데이터의 화면 격리: 미검증. 기존 복원 데이터의 `multi_category_parents=0`이며 합성 fixture는 최종 판정 근거로 사용하지 않았다.

위 두 축은 결함 0으로 환산하지 않는다.

## ⑤ 잃으면 안 되는 것 재현

이번 라운드에서 코드 변경 후 재실행한 관련 회귀 테스트:

```text
$env:SAMHAN_GATEWAY_ATTESTATION='codex-test-attestation'
.\gradlew.bat :services:product-service:test --tests com.samhanair.logis.product.it.EstimateCatalogInternalControllerIT --tests com.samhanair.logis.product.web.ProductCatalogControllerComponentCountTest
BUILD SUCCESSFUL in 25s
```

이 실행에서 카테고리 설정 저장값을 사용하는 `components_commercialMulti_usesSavedCategorySetting`을 포함한 대상 테스트가 통과했다. 기존 라이브 재판정에서 확인한 보존 수치는 다음과 같다. 이번 세션에는 공유 DB write 및 브랜치 라이브 서버 재기동을 하지 않았으므로 아래 수치는 기존 실측 보존 기록이며 신규 라이브 재실측으로 과장하지 않는다.

```text
수량 변경 0/343
V47 설정 이전 1,584행 / 343세트
exposure 전행 차이 0행
미매핑 fallback 14행
옵션 충돌 2쌍 보존
fresh V1→V47 성공
Playwright 2/2
```

## ⑥ 스크린샷 — 행 수·경로

아래 5개 PNG를 원본 해상도로 직접 열어 확인했다. 모두 `docs/qa/1272-sol-reverdict-2/screenshots/` 경로이며 기존 Playwright가 `resolveQaShotsDir()`를 경유해 생성한 산출물이다.

| 파일 | 직접 확인한 행 수 |
|---|---:|
| `01-commercial-fixed-saved-real-qa.png` | 설정 2행 |
| `02-single-unchanged-real-qa.png` | 설정 7행 |
| `03-commercial-set-qty-two-real-qa.png` | viewport 15행, 전체 상업멀티 310행(기존 DOM 계측) |
| `04-single-follow-set-remains-two-real-qa.png` | viewport 15행, 전체 싱글 기본 133행 + 구성 718행(기존 DOM 계측) |
| `05-basic-product-boundary-real-qa.png` | 구성품 2행 |

직접 확인 내용은 상업멀티 저장 후 `고정/부속/SOL1272-R2-COMM`, 싱글 sentinel의 기존 값 유지, 세트 수량 2, 기초품목 구성품 코드와 배송가 필드 유지다.

## ⑦ 남은 미검증

1. 브랜치 Gateway를 통한 무권한 계정의 실제 product 엔드포인트 HTTP 403.
2. 주문서웹 실제 UI bootstrap 및 품목 수.
3. 동일 부모 다중 카테고리 실데이터 화면 격리.
4. 브랜치 라이브 재기동 후 결함1·2와 6개 보존 수치의 신규 전수 재측정.

## ⑧ 변경 파일 및 `git status --porcelain`

제품 코드 변경은 없다. PM 커밋 대상 변경 파일은 다음과 같다.

```text
clients/desktop/src/renderer/routes/ProductFormPage.test.tsx
services/product-service/src/test/java/com/samhanair/logis/product/it/ProductPermissionControllerIT.java
docs/qa/1272-sol-reverdict-2/report.md
```

실행 하네스/기존 산출물 디렉터리는 현재 워크트리의 미추적 상태로 함께 보인다.

```text
 M clients/desktop/src/renderer/routes/ProductFormPage.test.tsx
 M services/product-service/src/test/java/com/samhanair/logis/product/it/ProductPermissionControllerIT.java
?? clients/desktop/playwright/1272-sol-reverdict-2/
?? docs/qa/1272-sol-reverdict-2/
```

## ⑨ 프로세스 회수

이번 세션에서 장기 서버·격리 컨테이너는 기동하지 않았다. Gradle/Vitest 테스트 프로세스는 종료됐고, 공유 포트 `8080/8081` 및 공유 컨테이너는 건드리지 않았다. 공유 컨테이너 24개는 그대로 유지된다.

커밋·푸시·git add는 수행하지 않았다.
