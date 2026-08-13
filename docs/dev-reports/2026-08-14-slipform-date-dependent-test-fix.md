# SlipForm 날짜 의존 테스트 수정

## RED 원문

수정 전 대상 테스트 실행:

```text
FAIL src/renderer/routes/SlipFormPage.test.tsx > SlipFormPage outbound date contract > allows next-day outbound creation and recalculates REGION unload date from M
AssertionError: expected '2026-08-17' to be '2026-08-16' // Object.is equality
❯ src/renderer/routes/SlipFormPage.test.tsx:1660:8
Test Files  1 failed (1)
Tests       1 failed | 102 skipped (103)
```

## 원인

테스트가 `nextDayValue` 뒤의 하차일을 단순히 `+1일`로 계산했습니다. 2026-08-14 금요일 실행에서는 익일 출고일이 2026-08-15 토요일이고, 단순 계산값은 2026-08-16 일요일입니다. 제품의 REGION 규칙은 익일이 일요일이면 월요일로 넘기므로 실제 값은 2026-08-17입니다.

## 고른 수단과 이유

테스트의 중복 달력 계산을 제거하고 제품이 사용하는 `computeUnloadDate(nextDayISO, 'REGION')`를 기대값 계산에 사용했습니다. 이 방식은 날짜를 고정하지 않으면서 주말·월말·연도 경계를 포함한 제품 규칙과 테스트의 기대값을 일치시킵니다.

제품 코드는 변경하지 않았습니다. 익일 출고 허용, REGION 선택에 따른 하차일 재계산, 저장 payload의 `slipDate`·`unloadDate` 단정은 그대로 보존했습니다.

## GREEN 원문

수정 후 대상 테스트:

```text
✓ src/renderer/routes/SlipFormPage.test.tsx > SlipFormPage outbound date contract > allows next-day outbound creation and recalculates REGION unload date from M
Test Files  1 passed (1)
Tests       1 passed | 102 skipped (103)
```

날짜를 바꿔도 통과함을 보인 방법:

- 대상 테스트는 렌더링된 출고일 `today`에서 익일을 UTC 달력 산술로 만들고, 그 값을 `computeUnloadDate`에 전달하므로 실행일의 날짜를 기대값에 하드코딩하지 않습니다.
- 제품 규칙 자체를 평일(2026-06-24→25), 금요일(06-26→27), 지방 토요일(06-27→29), 월말(06-30→07-01), 연도 경계(12-31→다음 해 01-01) 테스트로 함께 실행했습니다.
- 결과: `deliverySchedule.test.ts`의 37개 테스트가 모두 통과했습니다.

## 같은 형태의 추가 검색

대상 파일에서는 수정 대상 외에 `new Date()`와 `toISOString().slice(0, 10)` 조합으로 익일/하차일을 계산하는 테스트는 없었습니다. 첫 번째 최소 출고일 테스트의 `today`는 화면의 실제 `min`/value를 비교하는 용도이고, 별도 테스트의 `vi.setSystemTime`은 고정된 M/N 검증 시나리오이므로 이번 결함과 같은 형태는 아닙니다.

동일 패턴의 후보는 다른 데스크톱 테스트에서 확인했으나 이번 라운드에서는 수정하지 않았습니다.

- `CashReceiptFormPage.test.tsx:151-152` — `new Date()`로 오늘 문자열 생성
- `api/mock.test.ts:639` — `new Date()` 사용
- `api/mock.test.ts:3455,3514,3565,3577` — `new Date().toISOString().slice(0, 10)` 사용

## 전량 테스트 결과

최종 명령과 결과는 아래와 같습니다.

```text
npm run typecheck
PASS

npm run test
Test Files  272 passed (272)
Tests       전체 통과
```
