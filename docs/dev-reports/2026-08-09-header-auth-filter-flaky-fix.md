# HeaderAuthenticationFilterTest flaky 수정

## 수정 내용

다음 두 standalone `MockMvc` 오염원 테스트에 `@AfterEach`와
`SecurityContextHolder.clearContext()`를 추가했다.

- `services/product-service/src/test/java/com/samhanair/logis/product/web/ProductInternalControllerTest.java`
- `services/product-service/src/test/java/com/samhanair/logis/product/web/ProductInternalLookupByModelTest.java`

두 테스트는 유효한 `X-Internal-Token` 요청으로 실제 `InternalTokenFilter`를 통과시키며,
그 필터가 현재 테스트 스레드에 `ROLE_INTERNAL`을 기록한다. standalone `MockMvc`에는
요청 종료 시 이를 정리하는 전체 Spring Security filter chain이 없으므로, 정리는 피해자
`HeaderAuthenticationFilterTest`가 아니라 상태를 만든 각 테스트의 lifecycle에 두었다.
sleep/wait/retry는 추가하지 않았다. 제품 코드는 변경하지 않았다.

## 강제 재현 전/후 대조 원문

보고서의 절차와 같은 단일 JShell JVM/스레드에서 `SecurityContextHolder.clearContext()`로
시작하고, 실제 `InternalTokenFilter.doFilter(...)` 뒤 실제
`HeaderAuthenticationFilterTest.ignoresUserRoleHeaderAndKeepsGroupAuthorities()`를
reflection으로 호출했다.

### 수정 전

```text
AFTER_INTERNAL_FILTER=[ROLE_INTERNAL]
TARGET_CAUSE=java.lang.AssertionError
```

### 수정 후

오염원 필터가 만든 값을 확인한 직후 cleanup을 실행하고 동일한 피해자 메서드를 호출했다.

```text
AFTER_INTERNAL_FILTER=[ROLE_INTERNAL]
TARGET_RESULT=PASS
```

전에는 `ROLE_INTERNAL`이 남아 피해자 필터가 그룹 인증을 설치하지 못했고, 후에는 같은
인증 단정을 세운 뒤 context를 비워 피해자 테스트가 요청의 두 `GROUP_*` 권한을 읽었다.
이 대조가 자연 실행 green과 별개로 결정성을 입증한다.

## 각 테스트가 지키던 단정

- `ProductInternalControllerTest`: 유효 내부 토큰의 200 응답, 서비스 위임, expand 옵션,
  누락/오류 토큰의 401 및 서비스 미호출 단정을 모두 유지했다.
- `ProductInternalLookupByModelTest`: 유효 토큰의 200 응답과 모델 조회 위임, 미존재
  404/500 범위, 누락/오류 토큰 401 및 서비스 미호출 단정을 모두 유지했다.
- `HeaderAuthenticationFilterTest`: `X-User-Groups`가 순서대로
  `GROUP_111...`, `GROUP_222...`가 되고 `ROLE_MASTER`가 없다는 단정을 유지했다.

수정 후 targeted 결과는 `19 tests completed, 0 failures, 0 errors`였으며, 대상 테스트
XML은 `tests=1, failures=0, errors=0`이다.

## 같은 계열 전수 목록

축을 `SecurityContextHolder`에 인증을 세우고 정리하지 않는 product-service 테스트로
두고 전수 검색했다.

| 테스트 | 상태 | 근거 |
|---|---|---|
| `ProductInternalControllerTest` | 수정 완료 | `new InternalTokenFilter(props)` + 유효 토큰 요청 |
| `ProductInternalLookupByModelTest` | 수정 완료 | `new InternalTokenFilter(props)` + 유효 토큰 요청 |
| `HeaderAuthenticationFilterTest` | 기존 cleanup 유지 | 직접 context를 읽고 `@AfterEach`에서 clear |

`rg -l "new InternalTokenFilter" services/product-service/src/test` 결과는 위 두
오염원 파일뿐이었다. 추가적인 직접 오염원은 확인되지 않았다.

## 전체 스위트 결과

실행 명령:

```powershell
./gradlew :services:product-service:test --rerun-tasks
```

Gradle 프로세스는 종료코드 0으로 끝났고, 생성된 `build/test-results/test/*.xml` 전체를
합산한 원문은 다음과 같다.

```text
694 tests completed, 0 failed (errors=0)
```

직전 기준 `694 tests, 0 failures`를 유지했다. `UP-TO-DATE`가 아닌 `--rerun-tasks`
실행이었다.

## 신규 파일

- `docs/dev-reports/2026-08-09-header-auth-filter-flaky-fix.md`
