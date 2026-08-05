# PR #984 HIGH-2 — ECOUNT·시트 순서 수렴 fix

## 범위

PR #984 R3 SOL 리뷰의 `[HIGH-2]`만 처리했다. `[HIGH-1]` 후보 결정 실패 12그룹(24행),
Issue #1000 순번코드 전환, gateway route는 건드리지 않았다.

R3 진단의 핵심은 다음과 같다.

> `import → sync → import`는 ECOUNT 계보·이름과 `usageScope=NONE`에 고정된다.
> `ProductSheetSyncService`의 기존 ECOUNT 행은 신규 `seedFromSheet` 분기에 들어가지 않고,
> category 불일치로 분류·usage 갱신을 건너뛴다. 이후 importer의 SHEET 전용 병합 경로에도
> 들어가지 못한다.

원인은 시트 sync의 기존 분류 가드가 `productCategory` 일치만 허용한 데 있다. ECOUNT-first
행은 생성 시 `productCategory=NULL`, `usageScope=NONE`, `lineage=ECOUNT`이므로 같은
시트 행을 보고도 가격만 갱신되고 시트 정본 상태로 채택되지 않았다.

## 수정

- `Product.promoteEcountToSheet()`를 추가했다. ECOUNT 계보만 SHEET로 승격하고 SHEET/MANUAL
  계보는 변경하지 않는다.
- `ProductSheetSyncService`의 기존 행 갱신 경로에서 ECOUNT 계보를 먼저 승격한다.
  승격한 행만 현재 시트 탭의 `productCategory`, `usageScope`, 분류 갱신 경로에 태운다.
- 품목명은 sync에서 변경하지 않는다. 승격 후 재임포트는 기존
  `UPDATE_ACTIVE_MODEL_NAME_SQL`의 `lineage='SHEET'` 조건을 만족하므로 시트 정본명을
  보존한다.
- 스키마·migration은 추가하지 않았다. V28의 `lineage` 컬럼과 기존 CHECK로 충분하다.

## RED-first 기록

### 행동 RED 시나리오

신규 `EcountSheetOrderConvergenceIT`에 다음 실제 경로 fixture를 먼저 추가했다.

1. 실제 `EcountProductImporter.importCsv()`로 ECOUNT-first 품목 생성
2. 실제 `ProductSheetSyncService.syncAll()`로 홈멀티 시트 행 반영
3. 실제 importer 재호출

fixture는 raw SQL로 products 상태를 만들지 않고 importer와 Google Sheets client mock을 통해
실제 service 진입점으로만 상태를 만든다.

R3에서 기록된 수정 전 관측 RED 원문은 다음과 같다.

```text
실험군: import → sync → 재import
최종 name=이카운트 재임포트명
lineage=ECOUNT
productCategory=NULL
usageScope=NONE
```

개발책임자가 금지한 Testcontainers 실행을 하지 않았으므로, 이 세션에서 위 IT를 수정 전
실행한 새 Gradle RED 로그는 생성하지 않았다. 대신 수정 전 테스트 fixture를 먼저 추가한
뒤 테스트 소스 컴파일로 fixture를 검증했다.

수정 전 fixture 컴파일 중 최초 harness 오류 원문은 다음과 같다. 제품 동작 RED가 아니라
mock의 checked exception 선언 누락이므로 fixture를 보정했다.

```text
EcountSheetOrderConvergenceIT.java:108: error: unreported exception IOException; must be caught or declared to be thrown
when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z"))
```

## GREEN 기록

수정 후 실행한 product-service 범위 컴파일 명령과 원문이다.

```text
$env:GRADLE_USER_HOME='D:\\dev\\Samhan-Public\\.gradle-t21'; .\\gradlew.bat :services:product-service:compileTestJava --rerun-tasks --no-build-cache
```

```text
> Task :services:product-service:processResources
> Task :shared:security:compileJava
> Task :shared:common:compileJava
> Task :shared:realtime-abstraction:compileJava
> Task :services:product-service:compileJava
> Task :services:product-service:classes
> Task :services:product-service:compileTestJava

BUILD SUCCESSFUL in 11s
6 actionable tasks: 6 executed
```

행동 GREEN IT 명령은 Testcontainers를 기동하므로 실행하지 않았다. 따라서 세 순서의
실제 Postgres 최종 상태는 이 세션에서 새로 관측하지 못했으며, 아래 표의 `GREEN 확인`
열은 테스트 코드가 고정한 assertion과 코드 경로 정적 확인을 구분해 적었다.

## 세 실행 순서 최종 상태 표

세 테스트는 서로 다른 modelCode를 사용하지만 같은 시트 정본 fixture와 최종 assertion을
사용한다.

| 순서 | 테스트 | 최종 name | lineage | productCategory | usageScope | exposure |
|---|---|---|---|---|---|---|
| sync → import | `sync_then_import_converges_to_sheet_canonical_state` | 시트 정본명 | SHEET | HOME_MULTI | BOTH | HOME_MULTI present |
| import → sync | `import_then_sync_converges_to_sheet_canonical_state` | 시트 정본명 | SHEET | HOME_MULTI | BOTH | HOME_MULTI present |
| import → sync → import | `import_then_sync_then_reimport_converges_to_sheet_canonical_state` | 시트 정본명 | SHEET | HOME_MULTI | BOTH | HOME_MULTI present |

각 테스트는 `ProductRepository`로 최종 품목을 읽고 `ProductEstimateExposureRepository`로
HOME_MULTI exposure 존재를 확인한다. 현재 실행 제약 때문에 이 표의 runtime 관측은 CI 또는
개발책임자가 허용한 격리 Postgres 실행에서 마저 확인해야 한다.

## 불변식 6개 확인 방법

| 불변식 | 확인 방법 | 이번 세션 결과 |
|---|---|---|
| 1. 실행 순서 불변 | 신규 IT가 세 순서를 각각 실제 importer/sync 진입점으로 고정하고 동일한 SHEET canonical assertion 수행 | 소스 컴파일 GREEN, runtime 미실행 |
| 2. 임포트 품목 노출 | 세 테스트가 `usageScope=BOTH`와 HOME_MULTI exposure를 assertion | 소스 컴파일 GREEN, runtime 미실행 |
| 3. 기존 SHEET 이름·노출 보존 | importer의 기존 `lineage='SHEET'` 병합 SQL은 변경하지 않았고 sync 승격은 ECOUNT에만 제한. sync→import 테스트가 시트 정본명/BOTH를 assertion | 정적 확인 및 소스 컴파일 GREEN, runtime 미실행 |
| 4. 반복 멱등 | import→sync→import 테스트가 재임포트 후 동일 canonical assertion. `promoteEcountToSheet()`는 두 번째 호출부터 false | 소스 컴파일 GREEN, runtime 미실행 |
| 5. 실패 원자성 | importer transaction, staging, alias 충돌 경로를 변경하지 않음. R3에서 확인한 alias 충돌 409 rollback 증거와 diff 범위 대조 | 기존 확인 보존, 이번 fix runtime 미실행 |
| 6. 정상 726건 다운스트림 | importer SQL·lookup·inventory/slip 코드를 변경하지 않음. R3의 726/726 lookup 200, 전표 200, AVAILABLE→RESERVED 증거와 diff 대조 | 정적 범위 확인, live 재실행 안 함 |

## migration 번호 전수 대조

이번 fix는 V28의 기존 `lineage` 컬럼을 사용하므로 migration을 추가하지 않았다. 따라서 새
번호를 고르는 단계가 없었고, 사용자 지시의 “migration 추가 시 열린 원격 브랜치 전부의
`git ls-tree` 대조” 조건은 발동하지 않았다. 기존 V27/V28 파일은 수정하지 않았다.

## 실행·안전 경계

- Docker stack은 재배포하지 않았다.
- Testcontainers IT는 사용자의 명시 지시에 따라 실행하지 않았다.
- 공유 `product_db`에는 write하지 않았다.
- git add/commit/push/checkout은 수행하지 않았다.
- `git diff --check`는 통과했다.

