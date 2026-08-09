# PR #1147 SOL 적대 검증 — flaky를 고치며 지키던 것을 잃지 않았는가

검증 대상: `chore/flaky-merge-gate` · `0a48c2669f1cc5abfcc0a43b392ad68e12944885`

## 먼저: 입력 요약과 실제 diff의 차이

“테스트 파일만 변경”은 코드 범위로는 맞지만 커밋 파일 목록으로는 다르다. HEAD는 다음 두 파일을 변경했다.

- `clients/desktop/src/renderer/routes/SlipFormPage.test.tsx` (`+44/-10`)
- `docs/dev-reports/2026-08-09-flaky-merge-gate-determinism.md` (신규, 121행)

제품 코드는 변경하지 않았다. 기존 구현 보고서의 마지막 변경 파일 목록은 두 파일을 모두 적고 있으므로, 보고서 자체가 파일을 숨긴 것은 아니다.

## (a) 제품 코드 뮤테이션 — 계약 감시가 살아 있는가

대상 단일 테스트의 정상 기준선:

```text
Test Files  1 passed (1)
Tests  1 passed | 98 skipped (99)
```

### 뮤테이션 1 — IDREF 순서 뒤집기

제품 코드 `SlipFormPage.tsx`의 `priceDescribedBy`를 일시적으로
`[priceChangedStatusId, priceStatusId]` 순서로 뒤집었다.

RED 원문:

```text
Test Files  1 failed (1)
Tests  1 failed | 98 skipped (99)

AssertionError: expected [ …(2) ] to deeply equal [ …(2) ]

- Expected
+ Received

  Array [
-   "slip-mobile-price-status-tmp-1",
    "slip-mobile-price-changed-tmp-1",
+   "slip-mobile-price-status-tmp-1",
  ]

❯ src/renderer/routes/SlipFormPage.test.tsx:2392:17
2392|     expect(ids).toEqual([note.id, changed.id])
```

판정: 순서가 뒤집히면 정확히 순서 단정에서 실패한다.

### 뮤테이션 2 — 최종 단가를 `199999`로 강제

제품 코드의 거래처 재가격 적용 결과 `unitPrice`를 일시적으로 `199999`로 강제했다.

RED 원문:

```text
Test Files  1 failed (1)
Tests  1 failed | 98 skipped (99)

AssertionError: expected '199999' to be '200000' // Object.is equality
Expected: "200000"
Received: "199999"

❯ src/renderer/routes/SlipFormPage.test.tsx:2382:57
2382|     await waitFor(() => expect(mobileUnitPrice().value).toBe('200000'))
```

판정: 최종 단가가 `200000`이 아니면 값 단정에서 실패한다.

### 원복 증명

각 뮤테이션 직후 원복하고 다음을 실행했다.

```text
--- mutation 1 restore diff ---
--- status ---

--- mutation 2 restore diff ---
--- status ---
```

강제 경합 실험까지 모두 원복한 뒤에도 다음과 같이 빈 출력이었다.

```text
--- forced-race restore diff ---
--- status ---
```

즉 보고서 작성 전에 제품·테스트 실험 변경과 다른 작업트리 변경은 0이었다.

## (b) 나머지 98개 테스트가 약해졌는가

커밋의 테스트 diff는 두 테스트에만 걸친다.

1. 선행 테스트 `does not apply a prior partner bulk result while the newly selected partner DC is pending`에는 기존 pending/loading/값 단정 뒤 Promise resolve와 A bulk 호출 완료 대기가 추가됐다. 기존 단정은 삭제·완화되지 않았다.
2. 대상 MED-1 테스트만 순서형 mock을 인자 소유 mock으로 바꿨다. 나머지 97개 테스트 본문은 byte diff가 없다.

파일 공통 `beforeEach`는 여전히 `vi.resetAllMocks()` 후 기본 mock을 매 테스트마다 재설정한다. 따라서 대상 테스트의 `mockImplementation`이 다른 테스트로 지속되지 않는다.

대상 테스트의 B bulk mock 구현은 `partnerB.id`에 귀속되고 응답 hit는 `productA.id`에 귀속된다. 또한 B 호출 인자 자체를 다음 단정이 별도로 감시한다.

```ts
expect(harness.getPriceMemories).toHaveBeenCalledWith(
  harness.partnerB.id,
  [harness.productA.id],
)
```

따라서 잘못된 거래처·품목 호출이 무조건 통과하는 구조로 바뀌지 않았다. 전체 99개 실행과 shuffle에서도 나머지 단정 실패는 없었다.

판정: 도달 가능한 감시 약화는 확인되지 않았다.

## (c) 결정성이 실제로 확보됐는가

### 요청된 원래 명령

```text
명령: npx vitest run src/renderer/routes/SlipFormPage.test.tsx
Test Files  1 passed (1)
Tests  99 passed (99)
Duration  5.02s
```

```text
명령: npx vitest run src/renderer/routes/SlipFormPage.test.tsx --sequence.shuffle
Running tests with seed "1786216006180"
Test Files  1 passed (1)
Tests  99 passed (99)
Duration  4.65s
```

이 두 green만으로 결정성을 주장하지 않는다.

### 강제 경합 — 옛 코드 RED / 새 코드 GREEN

동일 조건을 만들기 위해 제품 timeout을 일시적으로 `5000 → 3200ms`로 줄이고, 대상 테스트의 A 가격 적용 뒤 B bulk 호출 전 `1000ms` 지연을 넣었다. 이 지연은 선행 렌더의 늦은 A bulk 호출이 대상의 once 큐 설치 뒤, 정상 B 호출 전에 들어올 창을 의도적으로 연다.

부모 커밋의 옛 두 테스트 hunk에서 재현된 원문:

```text
❯ src/renderer/routes/SlipFormPage.test.tsx (99 tests | 1 failed) 5428ms
× ... 둘 다: 단가 input IDREF 는 ... 2069ms
  → expected '1000' to be '200000' // Object.is equality

Test Files  1 failed (1)
Tests  1 failed | 98 passed (99)

Expected: "200000"
Received: "1000"
```

PR의 새 두 hunk를 복원하고 같은 `3200ms + 1000ms` 조건으로 실행한 원문:

```text
✓ src/renderer/routes/SlipFormPage.test.tsx (99 tests) 4500ms
✓ ... 둘 다: 단가 input IDREF 는 ... 1088ms

Test Files  1 passed (1)
Tests  99 passed (99)
```

`2500ms`, 그리고 지연 없는 `3200ms`에서는 옛 코드도 99 passed였다. 즉 단순 timeout 축소가 아니라 늦은 A 호출과 대상 once 큐의 시간창이 겹쳐야 재현됐다. 실험 timeout·지연·옛 코드 hunk는 모두 원복했다.

판정: 이 환경에서도 보고된 선소비 경합을 강제로 재현했고, 새 코드가 같은 경합 조건을 차단함을 관측했다.

## (d) 증거 무결성

### Vitest

위 (c)의 동일 명령으로 일반·shuffle 각각 `99 passed`를 재현했다.

### product-service 전체 suite

보고서와 같은 명령을 실행했다.

```text
명령: ./gradlew :services:product-service:test --rerun-tasks

> Task :services:product-service:test
BUILD SUCCESSFUL in 2m 19s
15 actionable tasks: 15 executed
```

실행 직후 XML을 독립 집계했다.

```text
XML files=66 tests=690 failures=0 errors=0 skipped=0
Header file=TEST-com.samhanair.logis.product.config.HeaderAuthenticationFilterTest.xml tests=1 failures=0 errors=0 skipped=0
case=ignoresUserRoleHeaderAndKeepsGroupAuthorities() time=0.169 failure=False error=False
```

따라서 구현 보고서의 `690 tests, 0 failures, 0 errors`는 이번 실행에서 재현됐다. 알려진 `HeaderAuthenticationFilterTest`는 이번 전체 suite에서는 실패하지 않았으며, 전체 결과와 분리해 위와 같이 명시했다.

PR #1147의 GitHub head도 로컬과 같은 `0a48c2669...`이고 현재 checks는 green이다. 이는 로컬 재현을 대체하는 증거로 사용하지 않았다.

## (e) `HeaderAuthenticationFilterTest` 원인

단독 재현:

```text
명령: ./gradlew :services:product-service:test --rerun-tasks --tests '*HeaderAuthenticationFilterTest' --info

HeaderAuthenticationFilterTest > ignoresUserRoleHeaderAndKeepsGroupAuthorities() STANDARD_OUT
BUILD SUCCESSFUL in 21s
15 actionable tasks: 15 executed
```

확인된 사실:

- 구현은 현재 `SecurityContextHolder` authentication이 null일 때만 헤더 인증을 설치한다.
- 테스트는 `@AfterEach`에서만 `SecurityContextHolder.clearContext()`를 호출한다. 시작 시 context를 직접 비우지는 않는다.
- product-service의 직접 `SecurityContextHolder` 참조는 구현과 이 테스트뿐이고, strategy 변경·JUnit 병렬·`maxParallelForks`·`forkEvery` 설정은 확인되지 않았다.
- 다만 조사 범위를 간접 사용까지 넓히면 `@WithMockUser` 또는 Security MockMvc request post-processor를 쓰는 product-service 테스트 파일이 16개다. 따라서 “직접 참조가 없다”만으로 suite 내 context 유입 가능성을 배제할 수는 없다.
- Spring Security Test의 정상 listener 정리는 이 간접 context를 테스트 뒤 제거해야 한다. 이번 전체 suite와 단독 실행에서는 실제 누출을 관측하지 못했다.

셋째 가능성은 **대상 테스트가 `@AfterEach` cleanup만 가져 시작 시 외부 context에 취약하고, 간접 Spring Security 테스트 경로 중 하나가 특정 실패 상황에서 context를 남기는 경우**다. 그러나 누출한 테스트·실패 당시 authentication·재현 순서를 특정하지 못했으므로 원인으로 확정하지 않는다. 추측성 수정도 요구하지 않는다.

판정: 원인 미확정. 기존 보고서의 직접 참조 조사 결과는 사실이지만 간접 context 사용 범위는 빠져 있었다.

## 최종 판정

### 도달 가능한 결함 목록

1. **제품 계약 감시 손실: 0건.** IDREF 순서와 `200000` 값 제품 뮤테이션이 각각 정확히 RED를 냈다.
2. **다른 테스트 감시 약화: 0건.** 변경된 선행 테스트는 강화됐고 대상 외 97개 본문은 그대로다.
3. **결정성 수정 실패: 0건.** 강제 경합에서 옛 코드 RED / 새 코드 GREEN을 재현했다.
4. **증거 무결성 차이: 1건.** 입력 요약의 “테스트 파일만”은 커밋 파일 목록으로는 틀리며 신규 구현 보고서도 포함된다. 다만 기존 구현 보고서 자체의 변경 파일 목록은 정확하다.
5. **별도 알려진 flaky 원인: 미확정.** 이번 PR이 손대지 않았고 이번 전체 suite에서는 통과했다.

결론: PR #1147의 테스트 수정에서 도달 가능한 제품 회귀 또는 감시 상실은 발견하지 못했다.

### 이 라운드가 보지 않은 것

- 실제 CI runner 스케줄러에서 자연 상태로 장시간 반복했을 때의 발생률 변화
- 실제 브라우저·스크린리더별 복수 IDREF 낭독 품질(이번 계약은 DOM IDREF 값·순서·대상 존재성)
- `HeaderAuthenticationFilterTest`의 과거 실패 원문 authentication과 정확한 선행 테스트 순서
- product-service 밖 다른 모듈의 별도 `HeaderAuthenticationFilterTest` flaky 여부

## 신규 파일

- `docs/dev-reports/2026-08-09-flaky-merge-gate-sol-verify.md`

커밋·push·DB write·Docker 재배포는 수행하지 않았다.
