# 이슈 #1073 S1 — 시간 의존 테스트 CI flake 안정화

## 결론

결함 원인은 제품 동작이나 mock 네트워크 지연이 아니라 테스트가 러너 속도에 직접 노출된 구조였다.

- `PartnerAutocomplete.cost.test.tsx`: 5,587건을 실제 jsdom DOM에 모두 렌더하면서 `performance.now()`로 wall-clock 렌더 시간을 측정했다. CI 실측 5,649ms가 Vitest 기본 5,000ms를 넘은 것은 대형 DOM 렌더 비용이 러너 부하에 따라 흔들린 결과다.
- `CodefImportScopeForm.test.tsx`: React Query의 네 개 mock Promise와 후속 effect/React scheduler 경계를 `waitFor(..., { timeout: 5000 })`로 관측했다. 실제 네트워크·타이머 지연은 없고, 호출은 예약된 비동기 큐가 배출된 뒤 확정된다.

skip/todo는 사용하지 않았고 제품 코드는 변경하지 않았다.

## 검증 의도와 원인

### PartnerAutocomplete 비용 테스트

검증하려던 계약은 (1) 5,587건 응답의 JSON 크기를 기록하고, (2) 공용 검색 결과 모달이 렌더되며, (3) 각 결과가 radio option으로 표시되는지 확인하는 것이다. `searchPartners` mock은 즉시 resolve하므로 네트워크나 debounce 대기는 원인이 아니다. 병목은 `PartnerAutocomplete` → `AsyncAutocomplete` → 공용 선택 모달이 5,587개 radio 및 하위 DOM을 한 번에 만드는 렌더 비용이다.

수정 후 5,587건 payload 직렬화/바이트 계측은 유지하고, UI 계약은 대표 32건 fixture로 검증한다. 시간 자체를 pass/fail 조건으로 사용하지 않으며, response bytes 하한(`> 700,000`)과 모달/radio 계약을 단정한다.

### CodefImportScopeForm

이 테스트 모음은 Codef 범위 저장·복원, optimistic-lock version 전달, 충돌 시 사용자 선택 보존, 재조회 실패 잠금, ALL/SELECTED/type 범위 잠금, 가져오기 요청 payload 등 기능 계약을 검증한다. 외부 네트워크는 전부 mock이다.

느림의 원인은 `listCodef*` 3개와 `loadCodefImportScope` mock의 Promise 완료 후 React Query observer, 복원 effect, React `MessageChannel` scheduler 커밋이 이어지는 비동기 경계다. 임의 sleep이나 실제 네트워크 지연은 없었다.

저장 2건과 가져오기 1건의 호출 관측을 5초 polling에서 `flushZeroDelayTasks()` 후 즉시 단정으로 바꿨다. 이 helper는 예약된 0ms timer, MessageChannel scheduler, microtask를 순서대로 배출하므로 시간 한도 대신 상태 경계를 검증한다.

## 동일 계열 전수 조사

축: “이 단정이 느린 러너에서도 참인가”

| 위치 | 관측 | 판정 |
|---|---|---|
| `clients/web/design-system/src/components/PartnerAutocomplete/PartnerAutocomplete.cost.test.tsx` | 5,587 DOM 렌더 + `performance.now()` 기록 | **수정** — 대형 DOM과 wall-clock 의존 제거 |
| `clients/desktop/src/renderer/routes/components/CodefImportScopeForm.test.tsx:183,191,893` | mock mutation 호출을 5,000ms `waitFor`로 관측 | **수정** — 결정적 queue flush 후 단정 |
| `clients/desktop/src/renderer/routes/SalesPartnerOrderListPage.test.tsx:215-224` | production `retry: 1`의 약 1초 backoff 후 error banner를 5,000ms `findBy`로 관측, test timeout 10,000ms | 후보 확인. 실제 retry/backoff 계약을 검증하는 별도 테스트이며 이번 S1의 지목 파일은 아니므로 변경하지 않음 |
| `clients/web/design-system/src/components/AsyncAutocomplete/AsyncAutocomplete.test.tsx` | 140ms 실제 timer mock 응답 6건 | 고정 mock 지연을 검증하는 테스트. 기본 5초 근접 단정·wall-clock 측정 없음 |
| `clients/web/design-system/src/components/MultiSelectAutocomplete/MultiSelectAutocomplete.test.tsx` | `setTimeout(0)` 1건 | 다음 상태 tick 양보용이며 비용/경과시간 단정 없음 |
| `clients/desktop/src/renderer/realtime/createCoeditProvider.test.ts:38` | 200ms 실제 timer | stale/remote edit 경계 계약을 위한 고정 지연. 5초 근접 단정 아님 |
| `clients/desktop/src/renderer/routes/MessengerPage.test.tsx:250,343,418` | 20/50ms 실제 timer | UI 비동기 tick 관측용. 기본 timeout 근접 단정 아님 |
| `Date.now()` 사용 테스트들 | 식별자 생성 또는 고정 시각과의 비교 | 경과시간을 테스트 timeout으로 사용하지 않음 |

## 검증 원문

### 지정 명령

실행 명령:

```powershell
cd clients/web/design-system ; npm test -- --run
```

수정 후 3회 원문 요약:

```text
Test Files  26 passed (26)
Tests       189 passed (189)
[MEASURE] run=1 elapsedMs=8378 elapsed=00:00:08.3788670

Test Files  26 passed (26)
Tests       189 passed (189)
[MEASURE] run=2 elapsedMs=7978 elapsed=00:00:07.9787361

Test Files  26 passed (26)
Tests       189 passed (189)
[MEASURE] run=3 elapsedMs=8203 elapsed=00:00:08.2039481
```

Partner 비용 테스트 로그:

```text
[R6 COST] partner response bytes=786730 rows=5587
```

수정 전에는 해당 테스트 본체가 2,780~3,012ms, `renderMs=2409.95~2626.56`이었고 CI에서는 5,649ms로 기본 5,000ms를 초과했다. 수정 후 본체는 137ms, 129ms, 120ms였다.

### Codef 단독 검증

```powershell
npx vitest run src/renderer/routes/components/CodefImportScopeForm.test.tsx
```

```text
Test Files  1 passed (1)
Tests       42 passed (42)
[MEASURE] run=1 elapsedMs=6931 elapsed=00:00:06.9314576

Test Files  1 passed (1)
Tests       42 passed (42)
[MEASURE] run=2 elapsedMs=7050 elapsed=00:00:07.0501831
```

## 변경 파일

- `clients/web/design-system/src/components/PartnerAutocomplete/PartnerAutocomplete.cost.test.tsx`
- `clients/desktop/src/renderer/routes/components/CodefImportScopeForm.test.tsx`
- `docs/dev-reports/2026-08-05-1073-s1-flaky-time-tests.md` (신규 보고서)

검증을 위해 두 패키지에 `npm ci`를 실행해 로컬 `node_modules`를 준비했으며, 소스 lockfile·제품 동작·DB·Docker에는 변경이 없다.
