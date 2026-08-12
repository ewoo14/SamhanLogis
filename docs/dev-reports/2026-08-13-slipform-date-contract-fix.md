# SlipFormPage 출고일 계약 테스트 시간 의존성 수정

## 결론

구현 결함이 아니라 테스트의 시간 의존성 결함이다. 테스트가 N을 `2026-08-14`로 하드코딩했지만, M은 구현에서 오늘(KST)로 초기화된다. 따라서 실행일에 따라 하드코딩한 N이 M+1 자동 계산값과 충돌하거나, 테스트가 입력한 M이 `min=today`보다 과거가 되어 브라우저 날짜 입력 동작이 달라졌다.

구현 파일은 변경하지 않았다. 계약인 “M 변경 시 사용자가 직접 고친 N을 보존하고 M/N 오류를 노출”하는 단정도 그대로 유지했다.

## RED 원문

처음 `npm test -- src/renderer/routes/SlipFormPage.test.tsx -t "preserves a user-edited N when M changes and exposes an M/N validation error"`를 실행했을 때는 사전검사에서 먼저 중단됐다. 원문은 다음과 같다.

```text
MUTATION_RED clients\\desktop\\src\\renderer\\.actor-display-mutation\\NewActorExit.tsx: unable to parse source: Cannot find module '...\\clients\\desktop\\node_modules\\@typescript-eslint\\parser\\dist\\index.js'
✖ all actor display reads are resolver-bound
✖ a newly added raw display exit is rejected (mutation RED)
```

의존성 설치 후 날짜 테스트를 직접 실행한 실제 RED 원문은 다음과 같다.

```text
❯ src/renderer/routes/SlipFormPage.test.tsx (103 tests | 1 failed | 102 skipped)
× SlipFormPage outbound date contract > preserves a user-edited N when M changes and exposes an M/N validation error
  → expected '2026-08-10' to be '2026-08-14' // Object.is equality

Test Files 1 failed (1)
Tests 1 failed | 102 skipped (103)

AssertionError: expected '2026-08-10' to be '2026-08-14' // Object.is equality
Expected: "2026-08-14"
Received: "2026-08-10"
src/renderer/routes/SlipFormPage.test.tsx:1680:30
```

## 기대값 출처와 원문 추적

테스트의 문제 줄은 하드코딩이다.

```tsx
fireEvent.change(unloadDate, { target: { value: '2026-08-14' } })

fireEvent.change(outboundDate, { target: { value: '2026-08-09' } })

expect(unloadDate.value).toBe('2026-08-14')
```

`2026-08-14`를 오늘 기준으로 계산하는 코드나 영업일 +N 계산은 테스트에 없다. M 변경 뒤 N을 덮어쓰지 않는지 확인하려고 고정한 사용자 입력값이다.

구현의 오늘 초기화 원문:

```tsx
const [slipDate, setSlipDate] = useState<string>(() => toKstDateISO())
```

구현의 오늘 최소값 원문:

```tsx
const today = useMemo(() => toKstDateISO(), [])
```

```tsx
min={today}
```

구현의 M 변경 계산 원문:

```tsx
onChange={(event) => {
  const nextSlipDate = event.target.value
  setSlipDate(nextSlipDate)
  if (isScheduledTag(tag) && !sameDay && !unloadDateManuallyEdited) {
    setUnloadDate(computeUnloadDate(nextSlipDate, tag) ?? '')
  }
}}
```

구현의 사용자 N 보존과 오류 판정 원문:

```tsx
setUnloadDate(e.target.value)
setUnloadDateManuallyEdited(true)
```

```tsx
const unloadDateConflict = isOutbound && isScheduledTag(tag) && !sameDay
  && unloadDateManuallyEdited
  && unloadDate !== (computeUnloadDate(slipDate, tag) ?? '')
```

```tsx
{unloadDateConflict ? (
  <div role="alert" data-testid="slip-form-unload-date-error">
    출고일(M)과 하차일(N)을 확인하세요. M 변경 후 N은 자동 일정과 맞아야 합니다.
  </div>
) : null}
```

`computeUnloadDate`의 계산 원문도 확인했다.

```ts
// N = M + 1일
// N이 일요일(0)이면 월요일로 +1, 단 (야적 && M=토요일) → 일요일 그대로
```

즉 현재 실행일에는 M이 `2026-08-09`로 초기화되고 REGION 기본 N이 `2026-08-10`이어서, 브라우저 입력 이벤트 후 실제 값 `2026-08-10`이 남았다. 구현은 사용자 편집값 보존과 충돌 오류 표시라는 계약에 맞게 동작한다.

## 수정

테스트의 해당 케이스에만 Vitest fake timer를 적용했다.

```tsx
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
```

```tsx
vi.useFakeTimers()
vi.setSystemTime(new Date('2026-08-08T09:00:00+09:00'))
```

고정 시각에서 M=`2026-08-09`는 오늘 이후이고, 사용자 N=`2026-08-14` 입력이 날짜 입력의 최소값에 걸리지 않는다. 기존의 구체적인 N 보존 assertion과 M/N 오류 assertion은 삭제하거나 느슨하게 하지 않았다.

## GREEN 및 날짜 불변식 검증

수정 후 지정 테스트:

```text
✓ src/renderer/routes/SlipFormPage.test.tsx (103 tests | 102 skipped)
Test Files 1 passed (1)
Tests 1 passed | 102 skipped (103)
```

같은 테스트를 `vi.setSystemTime`만 각각 `2026-08-07`, `2026-08-08`, `2026-08-09` KST로 바꾸어 실행했다. 세 날짜 모두 `Test Files 1 passed (1)`, `Tests 1 passed | 102 skipped (103)`였다. 최종 파일은 기준 시각 `2026-08-08`로 복원했다.

## 요청 검증 결과

- `npm run typecheck`: PASS. real-QA 내부 테스트 `51 passed`, TypeScript 검사 종료 코드 0.
- `npm run lint`: PASS, `0 errors`, 기존 경고 175건.
- `npm test`: PASS.

```text
Test Files 260 passed (260)
Tests 2260 passed | 2 skipped (2262)
```

전량 실행은 `npm run build`로 필요한 `design-system/dist`와 Electron `out/main/index.js`를 만든 뒤 수행했다. 테스트 과정의 기존 React Router 등 경고는 있었지만 실패는 없었다.

## 라운드 종료 점검

```text
git status --short
 M clients/desktop/src/renderer/routes/SlipFormPage.test.tsx
 D tools/.s24-build-only/build/deep/tracked-writer.mjs
```

요청된 `tools/.s24-build-only/build/deep/tracked-writer.mjs`는 Git 추적 파일이며 현재 삭제 상태다. 이번 수정에서 삭제하지 않았고, 사용자 변경 보존 원칙에 따라 복원하지 않았다.

임시 프로세스는 테스트 종료를 확인했다. 별도 작업 프로세스를 추가로 남기지 않았다.
