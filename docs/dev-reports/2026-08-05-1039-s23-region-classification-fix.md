# S23 권역 분류 시·도 선두 판정 수정

## 작업 범위

- PR: #1045 · 이슈: #1039 가배차
- 라운드: S23
- 작업 디렉토리: `C:\dev\Samhan-Public\.claude\worktrees\t1039`
- 대상: `services/slip-service`의 `PreClassifyService`
- 제한 준수: git 명령, Docker, 재배포, DB 쓰기, 마이그레이션 적용을 수행하지 않음

## 원인

`classifyRegion`이 시·도 접두사(`대구`)를 주소 전체에 `contains`로 검색했다. 그래서
`부산 해운대구 해운대해변로 300`의 하위 행정구역 `해운대구` 안의 `대구`가 대구광역시
접두사로 오인되었고, 첫 번째로 순회한 규칙이 결과를 결정했다.

## RED-first

### RED-A / RED-B 실행 원문

테스트에 부산 해운대구, 규칙 목록 순서 반전, 경기 광주시 키워드 fallback 회귀를 먼저
추가한 뒤 실행했다.

```text
> Task :services:slip-service:test

PreClassifyServiceTest > classify_isIndependentOfRegionRuleListOrder() FAILED
    org.opentest4j.AssertionFailedError at PreClassifyServiceTest.java:134
PreClassifyServiceTest > classify_preservesKeywordFallbackWhenSidoPrefixIsUnavailable() FAILED
    java.lang.AssertionError at PreClassifyServiceTest.java:149
PreClassifyServiceTest > classify_usesLeadingSidoInsteadOfSubstringInsideLowerAddress() FAILED
    java.lang.AssertionError at PreClassifyServiceTest.java:114

9 tests completed, 3 failed
BUILD FAILED
```

첫 실행은 테스트 코드의 Java 버전 호환 문제(`List.reversed()` 미지원)로 컴파일 단계에서
중단되었고, 테스트 의미를 바꾸지 않고 명시적 역순 목록으로 고친 뒤 위의 실제 RED를
확보했다.

## 수정

`PreClassifyService.classifyRegion`에 다음을 적용했다.

1. 규칙을 `sortOrder`, `groupName`으로 정렬해 입력 목록 순서에 의존하지 않도록 했다.
2. 시·도 접두사 판정을 `normalized.contains(prefix)`에서 `normalized.startsWith(prefix)`로
   바꿨다. 시·도 이름이 주소의 선두가 아닐 때는 시·도 판정에 사용하지 않는다.
3. 접두사 매칭 뒤의 `keywords` 전체 검색은 유지했다. 따라서 `수원시`, `광주` 같은
   도로명·시군구 키워드 fallback을 제거하지 않았다.
4. null/blank 주소의 `null` 반환은 유지했다.

## 계열 sweep

### 조사한 규칙 원천

slip-service의 규칙은 `ArologisPreClassifySupportClient`가 아로로지스의
`region_dispatch_classifications`에서 읽는다. 저장소 migration에는 테이블 정의만 있고 실제
19+ 규칙 seed 행은 없다. 따라서 아래는 저장소에 커밋된 `RegionClassifierTest`의 9개 fixture,
desktop `MOCK_REGIONS`의 6개 규칙, 그리고 `RegionalService`의 17개 시·도 문자열을 대조한
정적 sweep이다. 런타임 DB 전체 행의 수치 판정은 이번 제한 범위에서 수행하지 않았다.

| 축 | 충돌 주소/규칙 | 기존 위험 | S23 판정 |
|---|---|---|---|
| 대구 | `부산 해운대구 ...` ↔ `대구광역시` prefix `대구` | `해운대구` 내부 부분문자열로 대구 오분류 | 해소. 부산 선두가 부산으로 우선 판정 |
| 대구 | `서울 성북구 안암동 ...` | 주소에 `대구` 부분문자열 없음 | 해당 충돌 없음. 서울 키워드 규칙이 있으면 기존 keyword 방식 유지 |
| 광주 | `경기도 광주시 ...` ↔ `광주광역시`, `경기동부`의 `광주` keyword | 광주가 선두 시·도가 아닌데 광주 prefix/keyword 후보가 될 수 있음 | `경기` 선두가 있는 경우 광주광역시 prefix는 배제되고 `경기동부` keyword fallback 유지 |
| 광주 | `광주광역시 북구 ...` ↔ `광주광역시` | 정상적인 선두 시·도 | 광주광역시로 판정 |
| 고성 | `강원 고성군 ...` ↔ `경남 고성군 ...` | `고성군`을 양쪽 keyword에 등록하면 keyword 순서만으로 선택될 수 있음 | 선두 `강원`/`경남` 규칙이 있는 경우 선두 시·도 우선. 두 규칙이 모두 권역 keyword만 가진 경우 runtime rule data 확인 필요 |
| 중구 | 서울·인천·대구·부산의 `중구` keyword | keyword만 보면 sort/list 순서 의존 | 선두 `서울`/`인천`/`대구`/`부산`이 있으면 해당 광역 규칙으로 한정 |
| 동구·서구·남구·북구 | 서울·인천·대구·부산 fixture의 공통 구 이름 | keyword만 보면 동일한 순서 의존 | 선두 시·도 판정으로 분리 |
| 경기 | `경기 광주시 ...` ↔ `경기동부`·`경기남부` 등 | `경기`는 여러 권역 그룹명이므로 그룹명 prefix로 직접 판정할 수 없음 | 경기 분할 그룹은 기존 keyword 규칙과 `sortOrder + groupName` 결정성 유지 |

정적 원천에서 대구 prefix가 하위 주소에 실제로 들어가는 직접 충돌은
`해운대구`의 `대구`였다. `성북구 안암동`에는 `대구`가 없어 해당 조합은 비충돌로
확인했다. `고성군`은 시·도 prefix 부분문자열이 아니라 동일 keyword의 양립 충돌이므로
별도 행으로 분리했다.

## GREEN 검증

```powershell
.\gradlew.bat :services:slip-service:test --tests '*PreClassify*' --console=plain
```

```text
> Task :services:slip-service:test
BUILD SUCCESSFUL in 10s
18 actionable tasks: 2 executed, 16 up-to-date
```

최종 대상 테스트는 10개이며 모두 통과했다. 통과한 회귀 범위:

- 부산 해운대구 → 부산광역시
- 규칙 목록 순서 반전에도 동일 결과
- 경기 광주시 → keywords 기반 경기동부 fallback
- 강원도 고성군 / 경상남도 고성군 → 선두 도명으로 각각 분리
- 기존 서울/8모드/미분류(null)/빈 주소 계약

## 변경 파일

### 신규

- `docs/dev-reports/2026-08-05-1039-s23-region-classification-fix.md`

### 수정

- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/preclassify/PreClassifyService.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/service/preclassify/PreClassifyServiceTest.java`

커밋은 수행하지 않았다. (PM 대행 범위)
