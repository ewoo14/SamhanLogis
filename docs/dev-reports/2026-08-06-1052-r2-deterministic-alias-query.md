# R2 — eCount alias 조회 결정성 보완

- 작업일: 2026-08-06
- 브랜치: `fix/1052-warehouse-uuid-existence`
- HEAD 기준: `f835fb26c`
- 상태: DONE
- 범위: S1 eCount alias 조회 요청과 관련 회귀 테스트

## 1. 원인 확인

PM 진단이 맞다. `WarehouseInternalClient.findEcountWarehouseAliases(Collection<String>)`가 입력 컬렉션을 그대로 순회해 `codes` query parameter를 만들고 있었다.

```java
ecountCodes.stream()
        .map(String::trim)
        .filter(code -> !code.isBlank())
        .distinct()
        .reduce((left, right) -> left + "," + right)
```

실제 호출자인 `WarehouseMappingValidationService`는 `WarehouseCodeMapper`의 `HashMap.keySet()` 기반 `Set`을 전달한다. 따라서 같은 코드 집합이어도 JVM의 컬렉션 순회 순서에 따라 HTTP 요청 문자열이 달라질 수 있었다. CI 원문의 고정 query expectation 실패와 코드가 정확히 일치한다.

셋째 원인은 확인되지 않았다. 테스트의 고정 expectation은 증상을 드러낸 지점이고, 제품 결함은 호출자 컬렉션 순서에 의존해 요청을 만드는 제품 코드에 있다.

## 2. 수정 방법과 선택 이유

`WarehouseInternalClient.java:137-145`에서 기존 정규화 순서를 유지한 뒤 canonical 정렬을 추가했다.

```java
String codes = ecountCodes.stream()
        .map(String::trim)
        .filter(code -> !code.isBlank())
        .distinct()
        .sorted()
        .collect(Collectors.joining(","));
```

- `trim` → blank 제거 → 중복 제거 동작은 유지했다.
- `sorted()`가 호출자의 `Set`/`Map` 순회 순서를 차단하고 같은 코드 집합을 같은 문자열로 만든다.
- 숫자로 변환하지 않고 문자열을 정렬하므로 `00003` 같은 eCount 코드의 leading zero를 보존한다.
- `Collectors.joining(",")`는 기존 reduce와 같은 comma-separated 계약을 유지하면서 문자열 생성 의도를 명확히 한다.
- 빈 컬렉션은 기존처럼 `Map.of()`를 반환한다.
- 전부 공백인 컬렉션은 기존처럼 `WarehouseAliasUnavailableException("eCount alias 조회 코드가 없습니다")`를 던진다. `joining` 결과가 blank인지 확인하는 조건으로 이 동작을 유지했다.

조회 결과는 `ecountCode`를 key로 하는 map이다. 테스트에서 두 호출의 입력 순서를 바꾸고 서버 응답 배열 순서도 반대로 반환했으며, 두 결과 map이 같고 각 코드의 UUID가 유지되는 것을 확인했다. 따라서 query 정렬이 응답 해석 정확성을 바꾸지 않는다.

## 3. 같은 취약성 grep 전수 결과

대상은 `WarehouseInternalClient`, `WarehouseCodeMapper`, `WarehouseMappingValidationService`, `InternalWarehouseController`, `EcountWarehouseAliasRepository` 및 관련 테스트다.

| 표면 | 확인 결과 | 조치 |
|---|---|---|
| `WarehouseInternalClient` | `Collection.stream()`으로 query 문자열을 만들던 유일한 순서 의존 지점 | `.sorted().collect(joining(","))`로 닫음 |
| `WarehouseInternalClient.parseEcountAliases` | `LinkedHashMap`은 서버 배열을 보존하지만 결과가 code-keyed map이며 문자열 생성/순서 단정 없음 | 변경하지 않음. 응답 배열 역순 테스트로 확인 |
| `WarehouseCodeMapper` | `HashMap`의 `keySet()`과 `forEach`가 상태 갱신/로그 순서에 쓰임. 문자열 조합이나 순서 기반 판정은 없음 | 변경하지 않음. client가 전달받은 집합을 canonicalize함 |
| `WarehouseMappingValidationService` | `Set` 순회는 코드별 상태 갱신이며 `allMatch`는 순서 비의존. alias 조회 호출은 수정된 client를 통과함 | 추가 수정 없음 |
| `InternalWarehouseController` | 요청 파싱은 `LinkedHashSet`으로 중복 제거한다. 순서를 문자열로 재조합하지 않음 | 변경하지 않음 |
| `EcountWarehouseAliasRepository` | SQL 결과에 `ORDER BY m.ecount_code`가 있음. `IN (:codes)` 입력 컬렉션 순서에 의존하지 않음 | 변경하지 않음 |
| 관련 테스트 | 기존 bulk 테스트의 `queryParam("codes", "00003,2")` 고정 단정을 제거. 새 테스트는 두 실제 요청 query를 서로 비교하고 응답 map을 비교함 | 구현 세부 결합 제거 |

`WarehouseMappingEndpoint`의 `LinkedHashMap`은 고정된 응답 envelope(`mode`, `statuses`)를 만드는 용도이고, status 내부 map의 JSON object 순서는 의미 계약으로 단정하지 않는다. 이번 취약성 범위에 해당하는 문자열 생성/순서 단정은 추가로 발견되지 않았다.

## 4. RED → GREEN

### RED-A — CI 원문

```text
CI 원문 (slip-units)
  WarehouseInternalClientTest > eCount_alias_bulk_응답은_staging_계약으로_파싱한다() FAILED
    java.lang.AssertionError at WarehouseInternalClientTest.java:106
  841 tests completed, 1 failed
```

수정 전 새 회귀 테스트도 제품 결함을 재현했다.

```text
WarehouseInternalClientTest > eCount_alias_bulk_응답은_staging_계약으로_파싱하고_조회순서를_안정화한다() FAILED
expected: "00003,2"
 but was: "2,00003"
BUILD FAILED
7 tests completed, 1 failed
```

로컬의 기존 테스트만 실행했을 때는 현재 JVM이 우연히 `00003,2`를 만들어 `BUILD SUCCESSFUL`이었다. 이것은 CI 실패를 반박하지 않으며, 새 회귀 테스트가 호출자 순서 두 가지를 직접 비교해 문제를 안정적으로 드러낸다.

수정 후:

```text
BUILD SUCCESSFUL in 33s
18 actionable tasks: 18 executed
```

slip 지정 테스트 4개 클래스의 최종 결과:

```text
WarehouseInternalClientTest: 7 tests, failures=0, errors=0, skipped=0
WarehouseBootPathConfigurationTest: 4 tests, failures=0, errors=0, skipped=0
WarehouseCodeMapperStartupValidationTest: 8 tests, failures=0, errors=0, skipped=0
WarehouseMappingValidationServiceTest: 7 tests, failures=0, errors=0, skipped=0
합계: 26 tests, failures=0, errors=0, skipped=0
```

### RED-B — 반대급부

중복/공백/빈 입력 동작은 수정 전에도 기존 동작이어서 별도 RED는 발생하지 않았다. 새 테스트가 다음을 계속 단정한다.

- `" 00003 "`, `"2"`, 중복 `"00003"`, blank를 넣으면 실제 query에는 두 코드만 포함된다.
- 빈 컬렉션은 빈 map이고 외부 호출이 없다.
- 전부 blank인 컬렉션은 기존 `WarehouseAliasUnavailableException`이다.
- 요청 입력 순서와 서버 응답 배열 순서를 바꿔도 결과 map과 UUID가 같다.

최종 GREEN은 RED-A와 RED-B를 함께 포함한 `WarehouseInternalClientTest` 7/7 통과와 위 slip 26/26 통과로 확인했다.

## 5. 반복 실행 횟수와 결과

- 수정 전 새 결정성 회귀 테스트: 1회 실행, `exit code 1`, `expected "00003,2" / actual "2,00003"`.
- 수정 후 `WarehouseInternalClientTest` 단독: 1회 실행, `exit code 0`.
- 수정 후 지정 slip 명령: 3회 실행, 모두 `exit code 0`, 매회 `BUILD SUCCESSFUL`.
- 수정 후 지정 inventory 명령: 1회 실행, `exit code 0`, `BUILD SUCCESSFUL`.
- inventory 결과: 19개 테스트 결과 파일, 60 tests, failures/errors/skipped 모두 0.

총 결정성 표면 반복은 slip 지정 명령 3회이며, 매회 bulk 테스트가 두 입력 순서와 두 응답 배열 순서를 실행했다.

## 6. 실행 명령과 종료 코드

### 수정 전 기준 확인

```powershell
./gradlew :services:slip-service:test --tests "*WarehouseInternalClientTest" --tests "*WarehouseCodeMapper*" --tests "*WarehouseMappingValidation*" --tests "*WarehouseBootPath*" --rerun-tasks --console=plain
# exit code: 0
# BUILD SUCCESSFUL in 43s (기존 테스트의 우연한 로컬 순회 순서)
```

### 수정 전 회귀 테스트 RED

```powershell
./gradlew :services:slip-service:test --tests "*WarehouseInternalClientTest" --rerun-tasks --console=plain
# exit code: 1
# BUILD FAILED, WarehouseInternalClientTest 7 tests completed, 1 failed
```

### 수정 후 단독 client GREEN

```powershell
./gradlew :services:slip-service:test --tests "*WarehouseInternalClientTest" --rerun-tasks --console=plain
# exit code: 0
# BUILD SUCCESSFUL in 32s
```

### 수정 후 지정 slip 표면, 3회 모두 동일 명령

```powershell
./gradlew :services:slip-service:test --tests "*WarehouseInternalClientTest" --tests "*WarehouseCodeMapper*" --tests "*WarehouseMappingValidation*" --tests "*WarehouseBootPath*" --rerun-tasks --console=plain
# run 1 exit code: 0, BUILD SUCCESSFUL in 33s
# run 2 exit code: 0, BUILD SUCCESSFUL in 33s
# run 3 exit code: 0, BUILD SUCCESSFUL in 32s
```

### 수정 후 지정 inventory 표면

```powershell
./gradlew :services:inventory-service:test --tests "*Warehouse*" --rerun-tasks --console=plain
# exit code: 0
# BUILD SUCCESSFUL in 1m 3s
```

전체 테스트 스위트, Docker 재빌드/재배포, AWS/Terraform, commit, push는 실행하지 않았다.

## 7. 변경 및 신규 파일

변경 파일:

- `services/slip-service/src/main/java/com/samhanair/logis/slip/client/WarehouseInternalClient.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/client/WarehouseInternalClientTest.java`

신규 파일:

- `docs/dev-reports/2026-08-06-1052-r2-deterministic-alias-query.md`

커밋과 push는 요청 범위 밖이므로 하지 않았다.
