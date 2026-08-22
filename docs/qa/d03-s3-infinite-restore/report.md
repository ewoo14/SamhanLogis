# D03-S3 인피니트 판넬 옵션 복구 보고서

## ① 도출 규칙과 레거시 근거

- 기존 레거시 규칙 `tools/legacy-gas/거래처 발송 주문서/Code.js:616`의 `/인피니트/i` 품목명 판정을 기준으로 삼았다.
- 현행 `clients/web/estimate-app/views/index.ejs:3230-3240`의 공청·AI 품목명 점수 규칙과 동일하게 품목명을 우선했다.
- `ProductAttributeClassifier.classifyInfinitePanelVariant(name, panelType)`가 PANEL 자식에만 적용된다.
- 결과 값은 기존 `bundle_component.component_variant` 축만 사용한다.
  - 인피니트 기본
  - 인피니트 25년형
  - 인피니트 공청
  - 인피니트 공청+동작감지 AI
- `products.panel_type`은 새 컬럼·새 테이블 없이 기존 값을 읽기만 한다. 360 판넬과 기존 네 옵션은 도출 대상이 아니다.

## ② 기존 250건 판정 불변 검증

공유 PostgreSQL `product_db`를 읽기 전용으로 조회했다. 쓰기·시드·임시 품목 생성은 없었다.

| 대상 | 전체 | 기본 | 공청 | 블랙 | 승강 | 형상 비NULL |
|---|---:|---:|---:|---:|---:|---:|
| 활성 PANEL bundle_component | 250 | 68 | 68 | 57 | 57 | 70 |

검증 결과는 개발책임자 지정 수치와 일치한다. 이번 변경은 시트 동기화 시 인피니트 PANEL 행의 `component_variant`만 도출하므로 현재 250건에는 UPDATE가 발생하지 않는다.

인피니트 8개 products는 모두 존재하며, 현재 활성 bundle_component 연결은 0건이다. 따라서 기존 250건을 바꾸는 백필은 수행하지 않았다.

## ③ RED 원문

JS RED:

```text
✖ 품목명에서 인피니트 판넬 4종을 구분한다
TypeError: deriveInfinitePanelVariant is not a function
✖ 인피니트가 아닌 기존 판넬은 도출 대상이 아니다
TypeError: deriveInfinitePanelVariant is not a function
tests 11, pass 8, fail 3
```

Java RED:

```text
error: cannot find symbol
method classifyInfinitePanelVariant(String,String)
5 errors
BUILD FAILED
```

## ④ 구현

- `ProductAttributeClassifier`에 품목명 기반 4종 도출 메서드를 추가했다.
- `ProductSheetSyncService`의 PANEL 구성품 동기화 직전에만 도출 결과를 `component_variant`로 사용한다.
- 웹 공통 명칭 유틸리티에 동일한 도출 규칙을 추가했다.
- 데스크톱 수량 동기화/구성품 특징 후보에 인피니트 4종을 추가했다.
- 기존 스키마만 사용했으며 migration·새 테이블·새 컬럼은 만들지 않았다.

## ⑤ GREEN

```text
node --test clients/web/estimate-app/test/d03-option-naming-unify.node.cjs
tests 11, pass 11, fail 0

./gradlew :services:product-service:test --tests com.samhanair.logis.product.service.ProductAttributeClassifierTest
BUILD SUCCESSFUL

npx vitest run src/renderer/routes/quantitySyncTargetModal.test.ts
Test Files 1 passed
Tests 5 passed
```

추가로 `npm run build:web`도 exit 0으로 완료했다. 전체 `npm test`는 기존 actor-display mutation RED 및 `out/main/index.js` 신선도 가드에서 작업 전제와 무관하게 중단되어 해당 결과를 GREEN으로 주장하지 않는다.

## ⑥ migration 번호 대조와 fresh 적용 건수

- 현재 브랜치 product-service 최신: V43
- `main` product-service 최신: V43
- 열린 PR #1241 product-service: V44 사용
- 열린 PR #1245 등 이번 대조 대상: V43
- 충돌 회피상 다음 신규 번호는 V45이나, 이번 변경에는 migration을 만들지 않았다.
- 로컬 공유 PostgreSQL Flyway history: 최신 성공 V43
- 이번 변경 fresh PostgreSQL 적용 건수: 0건 (migration 미생성·DB 미변경)

기존 250건 불변을 보장하기 위해 런타임 시트 동기화 경로만 수정했다.

## ⑦ 라이브 캡처와 옵션 개수

데스크톱 mock Vite는 HTTP 200까지 기동했으나 Playwright Chromium에서 mock 인증이 로그인 화면으로 전환되어 `product-form-components-editor`가 열리지 않았다. 공유 인증은 지시대로 사용하지 않았고, 401/로그인 차단을 우회해 허위 캡처를 만들지 않았다.

따라서 유효한 live screenshot과 화면 옵션 개수는 확보하지 못했다. 대신 데스크톱 Vitest에서 PANEL 후보 중 `인피니트` 접두 옵션을 정확히 4개로 검증했다.

## ⑧ 프로세스 회수

- 임시 Playwright/Vite 프로세스와 포트 5173 리스너를 종료했다.
- 최종 확인: 작업 스펙 문자열(`vite src/renderer`, `playwright.d03`, `d03-s3-infinite`) 잔여 프로세스 0개.
- 컨테이너는 기동 전부터 존재한 공유 스택이며, 이번 작업에서 새 컨테이너를 만들거나 변경하지 않았다.
- JAR·바이너리·공유 DB QA 잔재를 남기지 않았다.
