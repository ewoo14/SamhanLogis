# PR #1241 CODEX LUNA 구현 보고서

판정: **부분 완료·271건 게이트 BLOCKED**. 요청 범위 1·2·3의 코드 변경과 RED/GREEN 회귀는 수행했으나, 개발책임자 게이트인 “기존 271건 금액 차이 0”은 현재 데이터 계약과 충돌하는 차이가 확인되어 완료로 보고하지 않는다.

## ① 환경 확인

원문:

```text
cd C:\dev\Samhan-Public\.claude\worktrees\wgas1
git rev-parse HEAD                 # 19f62dddf
git rev-parse --abbrev-ref HEAD    # feat/gas-parity-order-web
git status --porcelain
```

실행 결과:

```text
19f62dddfb4abe980c8773c93338b44e671f2e6b
feat/gas-parity-order-web
?? docs/qa/1241-price-relocation/CODEX-SOL-PRICE-PATH-INVESTIGATION.md
```

커밋·푸시·스테이징은 하지 않았다. 기존 미추적 파일은 보존했다.

## ② V44 되돌림 방법과 근거

- `origin/main`과 `main`에는 `V44__bundle_component_context_prices.sql`이 없다.
- 현재 브랜치에만 V44 파일이 있다.
- 실 `product_db.flyway_schema_history`의 `version='44'` 조회 결과는 `0`이다.
- 따라서 새 rollback migration을 만들지 않고 브랜치 전용 V44 migration과 도메인/읽기/동기화 쓰기를 제거했다.
- 제거 대상: `BundleComponent` 두 필드·쓰기 메서드, `BundleExpander` 관계 단가 우선 경로, `EstimateCatalogInternalController` 관계 단가 읽기, `ProductSheetSyncService` 두 컬럼 덮어쓰기.
- 소스 전수 검색 결과: `V44_SOURCE_SWEEP=0`.

마이그레이션 번호 전수 확인 결과:

```text
origin/main =>
main =>
feat/gas-parity-order-web => services/product-service/src/main/resources/db/migration/V44__bundle_component_context_prices.sql
feat/gas-missing-19 =>
data/legacy-csv-full-load =>
```

## ③ 데이터 기반 전환 내용

`BundleExpander`가 `allocationMode`, `allocationWeight`, `fixedAllocationAmount`, 부모 `allocationRoundUnit`을 읽는다. 데이터 계약이 없을 때는 관계값 없는 기존 세트의 동작 보존을 위해 legacy fallback을 유지한다.

## ④ 고정/비율 구분 전후

전환 후 자동 배분 참여군은 `AUTO + INDOOR/OUTDOOR`다. 명시 고정군 판정은 `FIXED + PANEL/REMOTE/MATERIAL`로 좁혔다. 다만 기존 금액 보존을 위해 자동 배분 참여군 외 행은 예산 예약 행으로 합산하며, 이는 271건 게이트를 통과시키기 위한 후속 결정이 필요하다.

실 DB 현황:

```text
활성 SINGLE_SET/EXPAND 부모: 271
AUTO INDOOR: 271
AUTO OUTDOOR: 271
FIXED ACCESSORY: 67
FIXED MATERIAL: 273
FIXED PANEL: 250
FIXED REMOTE: 315
기본 구성품이 실내·실외 1쌍 외 추가 행을 갖는 세트: 87
```

## ⑤ 271건 전수 대조표(차이 0 증명)

차이 0 증명은 **성립하지 않았다**. 현재 실 DB의 271건을 대상으로 전환 전 legacy 계산과 전환 후 데이터 계산을 구성품 라벨 단위로 대조했으며, 추가 행·기존 가격 비례·반올림 단위가 동시에 존재하여 차이가 발생했다. 대표 차이는 다음과 같다.

```text
대상 세트              구성품              종류       전환 전       전환 후
AC090BS4PBH7SY         AC090BN4PBH1        INDOOR     572,810       573,000
AC090BS4PBH7SY         AC090BXAPBH3        OUTDOOR    859,215       859,025
AR60F13D12WS           AR60F13D12WNKO      INDOOR     346,400       346,000
AR60F13D12WS           AR60F13D12WXKO      OUTDOOR    519,600       520,000
```

이 표는 차이 0이 아니라는 증거다. 차이 행 전체는 다음 라운드에서 `set_model_code | component_model_code | component_label | before | after | reason` CSV로 고정해야 하며, 이 라운드에서는 게이트 실패 상태로 중단한다. 데이터가 비어서가 아니라, 87개 세트의 추가 구성품과 `allocationWeight=4/6` 데이터가 legacy 가격 비례 배분을 완전히 표현하지 못해서 발생한다.

## ⑥ RED 원문

데이터 소비 실패 테스트를 먼저 추가하고 기존 코드를 실행했다.

```text
BundleExpanderIT > 배분계약_데이터가_있으면_품명_휴리스틱이_아닌_비중과_고정금액을_쓴다() FAILED
    org.opentest4j.AssertionFailedError at BundleExpanderIT.java:647
1 test completed, 1 failed
```

실패 원인은 테스트가 지정한 `AUTO 2:8`, `FIXED 100000`을 읽지 않고 기존 품명/하드코딩 배분을 수행한 것이었다.

## ⑦ 잃으면 안 되는 것 유지

- `BundleExpanderIT` 전체 통과.
- 가격 미리보기 500 및 Google Sheets 런타임 차단 경로는 이번 변경에서 수정하지 않았다.
- 관계값이 없는 세트 fallback은 유지했다.
- 화면 기본값·replace-all 보존·반올림 저장 연결·bootstrap 캐시·할인 중복은 범위 밖으로 건드리지 않았다.

## ⑧ 회귀

실행:

```text
./gradlew.bat :services:product-service:test --tests 'com.samhanair.logis.product.service.BundleAllocationPolicyTest' --tests 'com.samhanair.logis.product.it.BundleExpanderIT' --no-daemon
BUILD SUCCESSFUL
```

## ⑨ 증거 무결성 자기 고지

271건 차이 0을 주장하지 않는다. `V44_FLYWAY_HISTORY=0`, 소스 V44 sweep 0, RED 원문, GREEN 원문만 확인된 사실로 게시한다. 최초 지정 감사 파일 `docs/dev-reports/2026-08-17-duplication-audit/C-issue-pr-history.md`는 이 워크트리에 존재하지 않았다.

## ⑩ 중단 지점

90분 제한과 271건 게이트 실패 때문에 여기서 중단한다. 다음 라운드 승인 없이는 추가 데이터 보정·스냅샷 계약 변경을 하지 않는다.

## ⑪ 프로세스 회수

이번 세션에서 기동한 서버·컨테이너는 없다. Gradle 테스트 daemon은 각 실행 후 자동 종료됐다. 확인 시점의 기존 Docker 컨테이너는 32개였으며, 다른 라운드 자원으로 판단해 중지하지 않았다.

## ⑫ `git status --porcelain` 원문

```text
 M services/product-service/src/main/java/com/samhanair/logis/product/domain/BundleComponent.java
 M services/product-service/src/main/java/com/samhanair/logis/product/service/BundleExpander.java
 M services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java
 M services/product-service/src/main/java/com/samhanair/logis/product/web/EstimateCatalogInternalController.java
 D services/product-service/src/main/resources/db/migration/V44__bundle_component_context_prices.sql
 M services/product-service/src/test/java/com/samhanair/logis/product/it/BundleExpanderIT.java
 M services/product-service/src/test/java/com/samhanair/logis/product/it/EstimateCatalogInternalControllerIT.java
?? docs/qa/1241-codex-luna-v44-allocation-report.md
?? docs/qa/1241-price-relocation/CODEX-SOL-PRICE-PATH-INVESTIGATION.md
```
