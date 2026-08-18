# PR #1272 fix 라운드 1 라이브 검증

검증일: 2026-08-18 (KST)  
대상 커밋: 945c7a923  
판정: A·B·C 모두 실제 실행으로 재현 완료. 공유 DB에는 write하지 않았다.

## 1. 기동 방법

브랜치 JAR를 다음 명령으로 빌드했다.

    .\gradlew.bat :services:eureka-server:bootJar :services:api-gateway:bootJar :services:product-service:bootJar --no-daemon
    BUILD SUCCESSFUL

공유 product_db를 pg_dump -Fc로 읽기만 한 뒤 sol1272-fix-pg 격리 PostgreSQL(15447)에 복원했다. 브랜치 서비스는 다음 포트로 별도 기동했다.

| 구성 | 포트 |
|---|---:|
| 격리 Eureka | 18761 |
| 브랜치 Gateway | 18084 |
| 브랜치 product-service | 18085 |
| desktop renderer | 5175 |
| estimate-app | 5183 |

product-service 로그에서 격리 DB가 V46에서 V47로 올라간 뒤 Tomcat started on port 18085, Eureka status UP을 확인했다. 공유 컨테이너는 중지·재빌드하지 않았다.

## 2. A — 게이트웨이 component-settings HTTP 200

브라우저 인증 세션으로 브랜치 Gateway를 통과해 다음 실제 화면 경로를 호출했다.

    GET http://127.0.0.1:18084/api/v1/products/AM260AXVHHH1SY/component-settings?estimateCategory=COMMERCIAL_MULTI
    gateway_status 200
    gatewayRows 2

응답에는 AM100AXVHHH1, AM160AXVHHH1 두 구성품과 qtyMode=FOLLOW_SET, componentKind=OUTDOOR, configurationOnly=true가 들어 있었다. 서비스 직접 호출이 아니라 Gateway no-strip 경로의 200이다.

## 3. B — 저장 전 → 저장 → 종합견적

실제 Chromium 테스트를 실행했다.

    {"gatewayStatus":200,"gatewayRows":2}
    {"beforeRows":2,"beforeKind":"OUTDOOR","beforeQty":"FOLLOW_SET","afterRows":2,"saved":{"qtyMode":"FIXED","kind":"ACCESSORY","variant":"SOL1272-FIX-LIVE-PROBE"}}
    2 passed

실제 화면에서 AM260AXVHHH1SY의 첫 구성품을 세트 따라감/실외기에서 고정/부속, 옵션 SOL1272-FIX-LIVE-PROBE로 바꾸고 저장했다. 다시 열어 저장값을 읽은 뒤 종합견적을 열었다.

종합견적 실제 DOM 행 수:

    commercial catalog DOM rows: 310
    combined rendered rows: 1161

따라서 헤더만 있는 stub가 아니며, 대상 모델 AM260AXVHHH1SY와 실제 품목·수량·납품가 행이 화면에 표시됐다.

## 4. C — 적대검증 6개 수치 재실측

| 항목 | 기준 | 이번 라이브 재실측 |
|---|---:|---:|
| 수량 변경 | 0/343 | 0/343 — 격리 복원 전후 bundle_component 활성행 1,598, 부모세트 346, 동일 checksum 5bc91b33c4bb5f51e7c5eeca40455c85 |
| V47 설정 이전 | 1,584행/343세트 | 1,584행/343세트 |
| exposure 전행 차이 | 0행 | 0행 — 양 DB 867행, 동일 checksum 3f3b28a428e056d1559d1071e47d9c77 |
| 미매핑 fallback | 14행 | 14행 — soft-deleted 부모에 연결된 활성 구성행, fallback 대상 확인 |
| 옵션 충돌 | 2쌍 보존 | 2쌍 보존. COMMERCIAL_MULTI/AM100AXVHHR1: NULL 기본 4세트 + S6-1111-MANUAL 기본 1세트. SINGLE_SET/AWR-WE13N: 기본 기본 3세트 + 유선 비기본 62세트 |
| fresh migration | 성공 | 성공 — 빈 PostgreSQL에서 Successfully validated 47 migrations, V1부터 V47 적용, Successfully applied 47 migrations ... v47 |

## 5. RED 원문과 수정 후 결과

수정 전 적대 테스트의 RED 원문:

    EstimateCatalogInternalControllerIT > components_commercialMulti_usesSavedCategorySetting() FAILED
    java.lang.AssertionError at EstimateCatalogInternalControllerIT.java:182

    ApiGatewayContextLoadIT > RC9 product 라우트 ... FAILED
    java.lang.AssertionError at ApiGatewayContextLoadIT.java:484

수정 후 실제 라이브 결과:

    gateway_status 200
    2 passed

## 6. 마이그레이션 번호 3중 확인

    브랜치 최대 V = 47
    origin/main 최대 V = 46
    열린 PR head 스캔: V47 추가 PR 없음 (최대 V46)

V47 파일은 수정하지 않았고 새 번호를 추가하지 않았다.

## 7. 스크린샷 — 직접 열어 확인한 결과

세 PNG 모두 resolveQaShotsDir()를 사용했고 QA_SHOTS_DIR를 커밋 대상 경로로 지정했다. 각 장을 직접 열어 데이터 행과 값을 확인했다.

1. 저장 전 설정 — 2행: C:\dev\Samhan-Public\.claude\worktrees\wcat\docs\qa\1272-fix-round1-live\screenshots\01-before-category-setting-real-qa.png  
   AM100AXVHHH1와 AM160AXVHHH1, 첫 행 세트 따라감, 실외기 확인.
2. 저장 후 설정 — 2행: C:\dev\Samhan-Public\.claude\worktrees\wcat\docs\qa\1272-fix-round1-live\screenshots\02-after-category-setting-real-qa.png  
   첫 행 고정, 부속, SOL1272-FIX-LIVE-P... 확인. 두 번째 실제 구성행도 함께 표시.
3. 종합견적 반영 — 실제 1,161행: C:\dev\Samhan-Public\.claude\worktrees\wcat\docs\qa\1272-fix-round1-live\screenshots\03-comprehensive-estimate-after-save-real-qa.png  
   실제 품목명·모델명·수량·납품가가 표시되고 AM260AXVHHH1SY 행 확인.

## 8. 미검증 축

없음. 단, 종합견적 캡처는 저장된 옵션 문자열을 화면의 별도 열로 표시하는 화면이 아니므로 옵션 문자열 자체는 B 테스트의 저장 후 재조회 assertion과 2번 캡처로 확인했다. 종합견적 화면은 실제 데이터 전개·행 존재를 확인했다.

## 9. 변경 파일 및 실행 하네스

- docs/qa/1272-fix-round1-live/report.md
- docs/qa/1272-fix-round1-live/screenshots/01-before-category-setting-real-qa.png
- docs/qa/1272-fix-round1-live/screenshots/02-after-category-setting-real-qa.png
- docs/qa/1272-fix-round1-live/screenshots/03-comprehensive-estimate-after-save-real-qa.png
- clients/desktop/playwright/1272-fix-round1-live/1272-fix-round1-real-qa.spec.ts (실행 하네스, 미커밋)
- clients/desktop/playwright.1272-live.config.ts (실행 설정, 미커밋)

## 10. 프로세스·컨테이너 회수

라이브 검증 종료 후 브랜치 Eureka/Gateway/product, desktop renderer, estimate-app 및 격리 PostgreSQL 컨테이너를 전부 회수했다. 공유 컨테이너는 그대로 두었다.

    격리 컨테이너 잔여: 0
    1272 기동 프로세스 잔여: 0
    공유 samhan-* 컨테이너: 24 (변경 없음)

이 보고서는 UTF-8로 작성했으며 PR #1272에 gh pr comment 1272 --body-file로 게시한다.
