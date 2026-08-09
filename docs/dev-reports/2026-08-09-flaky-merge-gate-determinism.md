# 2026-08-09 flaky 머지 게이트 결정성 조치

## 범위와 불변식

제품 코드는 수정하지 않았다. 대상 테스트가 지키는 동작을 먼저 확인하고, 테스트의 비동기 수명과 mock 응답 소유권만 고정했다.

## 대상 1 — `SlipFormPage` 모바일 라인 카드 MED-1

### 지키는 계약

거래처 변경으로 단가가 `REMEMBERED` 200000으로 갱신되고 변경 표지가 생긴 모바일 라인에서, 단가 input의 `aria-describedby`는 가격출처 note ID와 변경 indicator ID를 그 순서로 가리키며 두 대상이 실제 DOM에 존재해야 한다.

최종 단가 `200000`, `거래처 최근단가`, `단가 변경`, IDREF 2개와 순서는 그대로 보존했다.

### 원인

선행 테스트 `does not apply a prior partner bulk result while the newly selected partner DC is pending`가 현재 A 거래처 DC Promise를 resolve하지 않은 채 끝났다. 테스트 cleanup은 DOM unmount만 하므로, 제품의 5초 timeout 뒤 이전 렌더의 async closure가 공유 module-level `getPriceMemories` mock을 호출할 수 있었다.

대상 MED-1 테스트는 `mockResolvedValueOnce(200000)`를 전역 호출 순서에 넣고 있었으므로, 늦은 A 호출이 그 응답을 먼저 소비하면 정상 B 호출은 기본 `hits: []`를 받아 productA 카탈로그 fallback `1000`으로 수렴했다. 이것이 CI에서만 관측된 `expected '1000' to be '200000'`의 원인이다.

### 고친 내용

`SlipFormPage.test.tsx`만 수정했다.

1. 선행 테스트가 의도한 `DC pending` 상태와 `loading=true`를 먼저 단언한 뒤, `pendingCurrentPartnerDc`를 같은 테스트 안에서 resolve했다. resolve 후 A bulk 호출도 `waitFor`로 확인해 미해결 Promise와 후속 비동기 작업을 테스트 범위 안에서 종료한다.
2. MED-1 테스트의 가격 mock을 `mockResolvedValueOnce`에서 인자별 구현으로 바꿨다.
   - A + productA 단건 가격 조회는 항상 `100000`을 반환한다.
   - B bulk 조회만 별도 deferred Promise를 소유하고, 이를 `act` 안에서 resolve한다.
   - 그 밖의 bulk 인자는 빈 결과를 반환한다.
3. B 응답을 resolve하고 Promise 완료를 await한 뒤에도 기존 `200000`과 IDREF 순서 단언을 그대로 실행한다.

### 결정성 증명

선행 테스트에는 Promise가 닫혔음을 확인하는 `currentPartnerDcSettled === true` 단언과 A bulk 호출 완료 대기가 있다. 따라서 현재 Promise를 종료하지 않으면 해당 단언/후속 호출 대기를 만족할 수 없다.

MED-1의 B 응답은 호출 순서가 아니라 `(partnerB.id, productA.id)` 인자에 귀속된다. 선행 A 호출이 늦게 실행되더라도 B의 `200000` deferred를 소비할 수 없다. B deferred를 명시적으로 resolve한 뒤 DOM commit을 기다리며 최종 단가와 `[note.id, changed.id]` 순서를 검증한다.

### 실행 원문

```text
명령: npx vitest run src/renderer/routes/SlipFormPage.test.tsx --reporter=basic --no-color

RUN  v2.1.9 C:/dev/Samhan-Public/.claude/worktrees/tflaky/clients/desktop

✓ src/renderer/routes/SlipFormPage.test.tsx (99 tests) 3591ms

Test Files  1 passed (1)
Tests  99 passed (99)
Duration  5.63s
```

```text
명령: npx vitest run src/renderer/routes/SlipFormPage.test.tsx --sequence.shuffle --reporter=basic --no-color
seed: 1786214489120

RUN  v2.1.9 C:/dev/Samhan-Public/.claude/worktrees/tflaky/clients/desktop

✓ src/renderer/routes/SlipFormPage.test.tsx (99 tests) 3582ms

Test Files  1 passed (1)
Tests  99 passed (99)
Duration  5.63s
```

두 실행 모두 기존 MED-1 계약의 `200000` 및 IDREF 순서 단언을 실행했다. Vitest가 출력한 React Router future flag warning은 기존 테스트 환경 경고이며 실패가 아니다.

## 대상 2 — `HeaderAuthenticationFilterTest`

### 지키는 계약

`X-User-Id`와 두 그룹 UUID가 있으면 인증 principal을 만들고 `GROUP_<uuid>` authority를 입력 순서대로 유지하며, `X-User-Role`은 authority로 승격하지 않아야 한다.

### 원인 조사 결과

원인을 확정하지 못했다. 추측성 대기·순서 변경·상태 초기화 추가는 하지 않았다.

코드로 조사한 범위:

- `services/product-service/src/main/.../HeaderAuthenticationFilter.java`: 공유 가능한 상태는 `SecurityContextHolder`뿐이다. filter는 현재 context의 authentication이 `null`일 때만 설정한다.
- `services/product-service/src/test/.../HeaderAuthenticationFilterTest.java`: `@AfterEach`에서 `SecurityContextHolder.clearContext()`를 수행하며, `MockMvc`·시스템 프로퍼티·static fixture를 사용하지 않는다.
- product-service 전체 테스트에서 `SecurityContextHolder`, `TestSecurityContextHolder`, strategy 변경, 시스템 프로퍼티 변경을 검색했다. 이 테스트 외에 `SecurityContextHolder`를 직접 만지는 테스트는 확인되지 않았다.
- product-service 테스트 설정에서 `maxParallelForks`, JUnit 병렬 실행 설정, `forkEvery` 설정은 확인되지 않았다. 따라서 현재 코드만으로 suite order/shared-state의 재현 원인을 특정할 증거가 부족하다.

### 조치

테스트와 제품 코드를 수정하지 않았다. 원인을 찾지 못한 상태에서 `sleep`, 추가 대기, 무조건적인 context clear를 넣으면 실제 결함을 가릴 수 있으므로 보류했다.

### 실행 원문

단독 실행:

```text
명령: ./gradlew :services:product-service:test --rerun-tasks --tests '*HeaderAuthenticationFilterTest' --info

HeaderAuthenticationFilterTest > ignoresUserRoleHeaderAndKeepsGroupAuthorities() STANDARD_OUT
BUILD SUCCESSFUL in 18s
15 actionable tasks: 15 executed
```

전체 실행:

```text
명령: ./gradlew :services:product-service:test --rerun-tasks

Exit code: 0
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended
```

Gradle 결과 XML 집계:

```text
XML files=66 tests=690 failures=0 errors=0
HeaderAuthenticationFilterTest: tests=1 failures=0 errors=0
```

## 변경 파일 목록

- `clients/desktop/src/renderer/routes/SlipFormPage.test.tsx`
- `docs/dev-reports/2026-08-09-flaky-merge-gate-determinism.md`

`HeaderAuthenticationFilterTest`와 제품 소스는 변경하지 않았다. 커밋·푸시도 하지 않았다.
