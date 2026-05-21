# MIG-15 POI shared/common → shared/ecount-io module 분리 dev-report

> 작성일: 2026-05-21
> branch: `spec/2026-05-21-mig-15-poi-shared-io-module`
> 기준 문서: `docs/superpowers/specs/2026-05-21-mig-15-poi-shared-io-module-design.md`, `docs/superpowers/plans/2026-05-21-mig-15-poi-shared-io-module.md`

---

## 1. 범위

MIG-15는 MIG-11에서 `shared/common`에 들어온 Apache POI 의존성을 별도 IO module로 분리한다. 목표는 모든 service가 `shared:common`만으로 POI를 전이받는 상태를 끝내고, Excel/XLSX IO가 필요한 service만 명시적으로 `shared:ecount-io` 또는 direct POI dependency를 갖게 하는 것이다.

| 영역 | 처리 |
|---|---|
| Gradle settings | `shared:ecount-io` include + projectDir 추가 |
| 신규 module | `shared/ecount-io/build.gradle` 추가 |
| Ecount XLSX | `EcountXlsxSupport`를 `com.samhanair.logis.common.ecount.io`로 이동 |
| Common Excel export | POI 직접 구현체 `ExcelExporter`와 테스트를 `shared:ecount-io`로 이동 |
| shared/common | `poi-ooxml` main/test dependency 제거, POI 비의존 DTO 유지 |
| accounting-service | direct POI 제거 + `shared:ecount-io` 의존 추가 |
| partner-service | direct POI 제거 + `shared:ecount-io` 의존 추가 |
| arologis/slip/inventory | 자체 POI 사용 확인 후 direct dependency 유지 |

---

## 2. 설계 정정

초기 plan은 `EcountXlsxSupport`만 이동하면 된다고 보았지만, 실제 코드에는 `shared/common`의 `ExcelExporter`가 POI를 직접 import하고 있었다. 따라서 `shared/common`에서 POI를 제거하려면 `ExcelExporter` 구현도 함께 이동해야 한다.

`ExcelColumn`과 `ExcelExportRequest`는 POI 타입을 노출하지 않는 순수 DTO라 `shared:common`에 남겼다. 기존 service import 경로(`com.samhanair.logis.common.excel.*`)는 유지하고, 구현 class는 `shared:ecount-io` 산출물에서 제공한다.

---

## 3. POI 유지/제거 매트릭스

| Module / service | direct POI | 사유 |
|---|---:|---|
| `shared:common` | 제거 | 공통 DTO/exception/base entity module로 복귀 |
| `shared:ecount-io` | 유지 | `EcountXlsxSupport`, `ExcelExporter` 구현 소유 |
| `accounting-service` | 제거 | `shared:ecount-io` 경유로 compile/runtime classpath 확보 |
| `partner-service` | 제거 | POI 직접 import 0건, `ExcelExporter` 경유 |
| `arologis-service` | 유지 | `VendorExcelParser` 자체 POI parse |
| `slip-service` | 유지 | `SlipExcelExportIT` 및 Excel export 검증 |
| `inventory-service` | 유지 | `DpsExcelParser` / `DpsCompareService` 자체 POI parse/export |

---

## 4. 검증 계획

```powershell
./gradlew.bat :shared:common:test :shared:ecount-io:test :services:accounting-service:test :services:arologis-service:test :services:slip-service:test :services:partner-service:test :services:inventory-service:test --no-daemon
```

| 항목 | 상태 |
|---|---|
| `shared:common` POI import scan | PASS — `rg` 결과 0건 |
| `shared:ecount-io:test` | PASS |
| 6 module/service Gradle regression | PASS |
| `partner-service` direct POI 제거 확인 | PASS — build/source/test direct POI 0건 |
| `arologis/slip/inventory` POI 유지 확인 | PASS — build.gradle direct dependency 유지 |

검증 메모:

- `gradlew.bat` 기본 실행은 wrapper distribution 다운로드 단계에서 sandbox 네트워크 차단으로 실패했다.
- 캐시된 Gradle 8.10.2 + `.gradle/codex-plugin-resolution.init.gradle` + `GRADLE_USER_HOME=.gradle/codex-home` 조합으로 로컬 캐시 검증을 수행한다.
- 1차 실행에서 `shared:ecount-io:test`가 `ErrorCode -> HttpStatus` runtime classpath 누락으로 실패했다. 원인은 `shared:common`의 `spring-web`이 `compileOnly`이고, 이동된 테스트가 새 module의 test runtime에서 Spring Web을 받지 못한 것이다. `shared:ecount-io` test dependency에 `org.springframework:spring-web`을 추가해 보정한다.
- 최종 명령:

```powershell
$env:GRADLE_USER_HOME='C:\dev\SamhanLogis\.gradle\codex-home'
& "$env:USERPROFILE\.gradle\wrapper\dists\gradle-8.10.2-bin\a04bxjujx95o3nb99gddekhwo\gradle-8.10.2\bin\gradle.bat" -I .gradle/codex-plugin-resolution.init.gradle :shared:common:test :shared:ecount-io:test :services:accounting-service:test :services:arologis-service:test :services:slip-service:test :services:partner-service:test :services:inventory-service:test --no-daemon --offline
```

결과: `BUILD SUCCESSFUL in 1m 26s` (40 actionable tasks, 11 executed, 29 up-to-date).

---

## 5. 문서 동기화

- `README.md`: 최신 진행 메모에 MIG-15 추가
- `ROADMAP.md`: Phase 10.6 진행 메모에 MIG-15 추가
- `migration/decisions/DECISIONS.md`: D-MIG-15-01~08 추가
- `docs/handoff/CURRENT-WORK.md`: MIG-15 현재 작업 블록 추가
- `docs/samhan-public-overview.html`: nav badge와 Phase 10.6 callout 갱신
