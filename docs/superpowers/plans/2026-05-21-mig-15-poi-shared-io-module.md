# MIG-15 POI shared/common → shared/ecount-io module 분리 — Plan

> Codex `mcp__codex__codex sandbox=workspace-write`. 옵션 C 21단계.

## 작업 그룹 20 (Codex 일괄)

### Task 1: settings.gradle 갱신
- `include 'shared:ecount-io'`
- `project(':shared:ecount-io').projectDir = file('shared/ecount-io')`

### Task 2: shared/ecount-io 신규 module
- `shared/ecount-io/build.gradle` 신규:
  ```gradle
  apply plugin: 'java-library'
  
  dependencies {
      api project(':shared:common')
      implementation 'org.apache.poi:poi-ooxml:5.4.0'
      testImplementation 'org.springframework.boot:spring-boot-starter-test'
      testImplementation 'org.assertj:assertj-core'
  }
  ```

### Task 3: EcountXlsxSupport 이동
- `shared/common/src/main/java/com/samhanair/logis/common/ecount/EcountXlsxSupport.java` 
  → `shared/ecount-io/src/main/java/com/samhanair/logis/common/ecount/io/EcountXlsxSupport.java`
- `shared/common/src/test/.../EcountXlsxSupportTest.java` 동일 이동

(또는 package 유지 — `com.samhanair.logis.common.ecount.EcountXlsxSupport` → `com.samhanair.logis.ecount.io.EcountXlsxSupport`. 패키지 변경 시 accounting import 경로 갱신 필요).

권장: **package `com.samhanair.logis.common.ecount.io`** — `common.ecount` 와 같은 hierarchy 유지.

### Task 4: shared/common/build.gradle POI 제거
- `implementation 'org.apache.poi:poi-ooxml:5.4.0'` 제거
- `testImplementation 'org.apache.poi:poi-ooxml:5.4.0'` 도 제거 (테스트도 이동됨)

### Task 5: accounting-service/build.gradle 갱신
- `implementation 'org.apache.poi:poi-ooxml:5.4.0'` 제거
- `implementation project(':shared:ecount-io')` 추가

### Task 6: AbstractEcountMig11LedgerImporter import 경로 갱신
- `import com.samhanair.logis.common.ecount.EcountXlsxSupport;` 
  → `import com.samhanair.logis.common.ecount.io.EcountXlsxSupport;`

### Task 7: partner-service + inventory-service POI 제거
- `implementation 'org.apache.poi:poi-ooxml:5.4.0'` 제거 (미사용 확인 후)

### Task 8: arologis-service + slip-service POI 유지 확인
- VendorExcelParser / SlipExcelExportIT 이 자체 POI 직접 사용 — 변경 없음

### Task 9: dev-report + 문서 동기화
- `docs/dev-reports/mig-15-poi-shared-io-module.md` 신규 (POI 의존성 분리 결과)
- ROADMAP / DECISIONS (D-MIG-15-01~06) / handoff / overview HTML (nav-badge `Phase 10.6 · MIG-15 POI 분리`)

## 검증

```
cd C:/dev/SamhanLogis
./gradlew.bat :shared:common:test :shared:ecount-io:test :services:accounting-service:test :services:arologis-service:test :services:slip-service:test :services:partner-service:test :services:inventory-service:test --no-daemon
```

BUILD SUCCESSFUL 후 commit:

```
chore(mig-15): POI shared/common → shared/ecount-io module 분리 (D-MIG-11 이연)

- shared:ecount-io 신규 module — 이카운트 xlsx 전용 (POI 5.4.0 의존)
- EcountXlsxSupport + Test shared:ecount-io 로 이동 (package com.samhanair.logis.common.ecount.io)
- shared/common POI 의존성 제거
- accounting-service: POI 제거 + shared:ecount-io 의존성 추가
- partner-service + inventory-service POI 의존성 제거 (미사용)
- arologis-service + slip-service POI 유지 (자체 사용, 이카운트 무관)
- POI transitive 14 service → 4 service (accounting/arologis/slip + shared:ecount-io)

옵션 C 21단계 첫 적용.
```
