# PR #1267 fix 라운드 1 보고서

실행일: 2026-08-18 KST  
브랜치: `fix/partner-master-and-importer`  
작업 원칙: `git add/commit/push` 미실행, 공유 DB write 0건, 다른 워크트리 미접근

## ① `EcountProductImporterIT` 실패 원문과 판정

시작 시 요청대로 `git merge origin/main --no-edit`를 실행했고 충돌은 없었다.

첫 실행 명령:

```text
.\gradlew.bat :services:product-service:test --tests com.samhanair.logis.product.it.EcountProductImporterIT --no-daemon --stacktrace
```

첫 실행 원문:

```text
EcountProductImporterIT > importCsv_시트_병합은_기존_category_id를_보존한다() FAILED
Caused by: java.lang.IllegalStateException at GatewayAttestationMockMvcConfig.java:24
SAMHAN_GATEWAY_ATTESTATION is required for MockMvc integration tests
6 tests completed, 6 failed
__EXIT_CODE__=1
```

테스트 전용 attestation을 주입해 실제 테스트를 재실행한 원문:

```text
EcountProductImporterIT > sameNameSequenceCodes_are_all_aliases_and_lookupable() FAILED
    BusinessException at EcountProductImporterIT.java:192
EcountProductImporterIT > sameNameMerge_행순서가_달라도_정본코드_규격_입고단가가_같고_raw는_보존된다() FAILED
    BusinessException at EcountProductImporterIT.java:236
<failure message="... 이미 사용 중인 품목명입니다: AR-EH03 (이카운트 import 품목코드: SAR-00006)">
<failure message="... 이미 사용 중인 품목명입니다: DET984MERGE 동명 품목 (이카운트 import 품목코드: DET984MERGEA)">
6 tests completed, 2 failed
__EXIT_CODE__=1
```

판정은 `(b) importer 구현이 깨뜨림`이다. `git diff origin/main...HEAD`에서 이번 변경이 `upsertProduct()`에 수동 등록용 `assertImportNameAvailable()`을 추가한 것을 확인했다. 그러나 기존 IT와 동명 처리 계약은 서로 다른 `product_code`를 서로 다른 품목으로 보존한다. 따라서 importer의 이름 중복 차단 호출·메서드를 제거했고, 수동 품목 등록 API의 이름 중복 차단은 건드리지 않았다.

기존 단위 테스트에도 같은 낡은 기대가 1건 있어 `importCsv_활성_동명_기초품목은_CONFLICT로_차단한다`를 품목코드별 정상 등록 기대(등록 1, alias 1)로 갱신했다. 삭제·skip·CI 필터는 사용하지 않았다.

## ② 동명 품목 화면 구분 — 스크린샷·행 수

브랜치 JAR를 `18184` 포트로 기동하고, Chromium headless Playwright가 공유 gateway 인증 후 품목 GET만 브랜치 JAR로 전달하도록 실행했다. 화면과 응답은 기존 DB 행을 사용했다.

실측:

```text
기초품목 관리에서 "Y형 분기관" 검색: 5행
  AXJ-YA2812M · AXJ-YA2815M · AXJ-YA3419M · AXJ-YA4119M · AXJ-YA4422M
견적품목 검색 모달에서 "Y형 분기관" 검색: 5행
  위 5개 코드 모두 표시
UUID 정규식 DOM 검사: 0건
Playwright: 1 passed, __EXIT_CODE__=0
```

캐논을 충족한다. 같은 이름의 기초품목 표에서는 코드가 `모델명` 열에 병기되고, 검색 결과 2건 이상 모달에서는 5개 결과 모두 코드가 항상 표시됐다.

확정 증거 PNG(Playwright 하위 스펙 + `resolveQaShotsDir()` + `QA_SHOTS_DIR` 경유):

- `C:\dev\Samhan-Public\.claude\worktrees\wp2\docs\qa\1267-fix-round1\playwright\screenshots\01-existing-duplicate-catalog-5-rows.png`
- `C:\dev\Samhan-Public\.claude\worktrees\wp2\docs\qa\1267-fix-round1\playwright\screenshots\02-existing-duplicate-search-modal-5-rows-with-codes.png`

두 PNG를 직접 열어 확인했다. 로그인 화면이나 0행 debug 캡처가 아니다.

## ③ 유니크 제약 여부와 276행 처리

읽기 전용 PostgreSQL 확인 결과:

```text
활성 전체 품목                         2,982행
서로 다른 product_code인 활성 동명     98그룹 · 374행 · 초과 276행
name 기준 UNIQUE 제약/인덱스           0개
```

`products`에 존재하는 것은 `model_name` 활성 unique 및 `product_code` 활성 unique 인덱스이며, 사용자 품목명 `name` unique 제약은 없다. 따라서 기존 동명 276 초과행은 삭제·병합·저장불가 상태로 바뀌지 않고 계속 조회된다. 이번 수정도 DB 제약을 추가하지 않았고, importer는 서로 다른 코드의 동명을 품목별로 보존한다.

## ④ 404 경로 성격

`GET /api/v1/partners/{partnerCode}`는 브랜치 검증 원문에서 404로 유지됐다. `clients/web/order-app/src/samhanApi.ts`에 legacy RPC 정의의 주석·등록 1건은 있으나, 실제 `getCustomerData(` 호출자는 0곳이다. 현행 화면은 로그인 응답의 거래처명을 사용하며, 단건 legacy RPC를 호출하지 않는다.

따라서 현재는 죽은 legacy 호환 경로다. 살아날 예정인 호출자·일정·담당 구현은 저장소와 정찰 자료에서 확인되지 않았다. 현행 화면 도달 결함으로 세지 않되, 외부/미래 호출자가 이 계약을 다시 사용하면 404가 된다.

## ⑤ 잃으면 안 되는 것 재현

```text
dc-config 활성 partners                     211행
partner-service 활성 partners              7,310행
partner_code 업무키 일치                    211/211
biz_no 정규화 일치                          211/211
기존 동명 Y형 분기관 화면 기초표             5행
기존 동명 Y형 분기관 검색 모달               5행
화면 표시 UUID                               0건
```

거래처 코드는 `dc_config_db`와 `partner_db`에서 각각 읽어 PowerShell 집합 비교했고 211/211을 재현했다. 기존 거래처·품목을 새로 생성하지 않았다. Playwright는 기존 `Y형 분기관` 행만 조회했다.

## ⑥ 테스트 결과(종료코드)

```text
EcountProductImporterIT                                      6 tests, 0 failed, 0 skipped, EXIT_CODE=0
EcountProductImporterTest + SameNameMergeTest + IT           BUILD SUCCESSFUL, EXIT_CODE=0
  (단위 테스트 34건 포함 + IT 6건)
Playwright 1267-fix-round1 live spec                          1 passed, EXIT_CODE=0
product-service bootJar                                      BUILD SUCCESSFUL, EXIT_CODE=0
```

## ⑦ 스크린샷 확인 결과와 전체 경로

Playwright 스펙은 다음 하위 경로에 두었다.

```text
clients/desktop/playwright/1267-fix-round1/1267-fix-round1-live.spec.ts
```

PNG 전체 경로:

```text
C:\dev\Samhan-Public\.claude\worktrees\wp2\docs\qa\1267-fix-round1\playwright\screenshots\01-existing-duplicate-catalog-5-rows.png
C:\dev\Samhan-Public\.claude\worktrees\wp2\docs\qa\1267-fix-round1\playwright\screenshots\02-existing-duplicate-search-modal-5-rows-with-codes.png
```

직접 열어 확인한 내용은 각각 `5행 표`, `5행 검색 모달 + 5개 코드`이며, UUID·로그인 화면·0행은 없었다.

## ⑧ `git status --porcelain` 원문

프로세스 회수 후 실행한 원문이다.

```text
 M services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java
 M services/product-service/src/test/java/com/samhanair/logis/product/service/EcountProductImporterTest.java
?? clients/desktop/playwright/1267-fix-round1/
?? docs/qa/1267-fix-round1/
?? docs/qa/1267-sol-merge-verdict/
```

마지막 `docs/qa/1267-sol-merge-verdict/`는 작업 시작 전부터 존재한 미추적 적대검증 산출물이며 이번 라운드에서 수정하지 않았다.

## ⑨ 프로세스 회수

```text
브랜치 product-service JAR 18184       회수 완료 · LISTEN 0
Playwright 대상 Vite 5233              회수 완료 · LISTEN 0
격리 컨테이너                          이번 라운드 신규 기동 0개
공유 samhan-* 컨테이너                 24개 유지
공유 컨테이너 중지/재시작              0건
공유 DB write                          0건
다른 워크트리 접근/변경                0건
git add/commit/push                    0건
```

판정: importer CI 결함 2건은 수정됐고, 동명 품목 화면 구분은 기존 행 기준으로 5/5 표·5/5 모달 행을 Playwright에서 확인했다. 404는 현행 화면 호출자 0인 죽은 legacy 경로이며, 이름 유니크 제약은 추가하지 않아 기존 276 초과행을 보존한다.
