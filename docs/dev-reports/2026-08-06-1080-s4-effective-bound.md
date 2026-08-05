# #1080 S4 유효 상한 검증 — PR #1081

## 결론

S4에서 S3의 BLOCK 사유를 테스트 경계에서 제품 경계로 옮겼다. 제품 런타임 코드는 변경하지 않았고, `PartnerAutocomplete.cost.test.tsx`의 `SearchResultSelectionModal` mock을 제거했다.

- 제품 모달은 가상화하지 않는다. `SearchResultSelectionModal.tsx`가 list/table 양쪽 모두 `options.map(...)`으로 모든 옵션을 렌더한다.
- 따라서 5,587건 전체가 실제 제품 모달의 radio로 생성되는지 검증한다.
- 5,587개 radio의 `aria-label` 배열을 fixture의 이름 배열과 통째로 비교해 개수·식별자·순서·중간 누락·중복·치환을 함께 검출한다.
- 각 radio에 대응하는 실제 제품 label에도 해당 순번의 `partnerCode`가 포함되는지 전수 확인한다.
- 실제 제품 dialog의 `querySelectorAll('*')` 비용을 측정한다. 정상 실측은 89,979개이며 상한은 100,000개다.

## S3 BLOCK 해소 근거

S3의 테스트는 제품 모달을 mock하고 양 끝 32건만 DOM으로 만들었다. S4는 해당 module mock을 제거해 `AsyncAutocomplete → SearchResultSelectionModal → Modal` 제품 경로를 실행한다.

제품 코드 근거:

```tsx
{options.map((option) => {
  const key = getKey(option)
  return (
    <label key={key}>
      <input ... aria-label={getLabel(option)} />
      <span>{renderOption(option)}</span>
    </label>
  )
})}
```

가상화 여부: **비가상화**. `SearchResultSelectionModal.tsx`에 `slice`, windowing, virtualizer, viewport 계산이 없고 `options.map`이 전체 배열을 순회한다. 그러므로 이 라운드의 기대값은 5,587개 DOM radio이며, 실행 결과도 `modal radios=5587`이다.

## 비용 상한과 mutation RED 증명

정상 제품 dialog 실측:

```text
modal radios=5587 domElements=89979
상한=100000
여유=100000-89979=10021개(약 11.14%)
```

상한은 mock DOM 516개가 아니라 제품 모달이 실제로 만든 89,979개 DOM에 적용된다. 비용 회귀가 10,022개 이상의 추가 DOM을 만들면 상한을 넘는다.

검증을 위해 제품 dialog에 임시로 `span` 10,022개를 추가하는 mutation을 만들고 실행했다. mutation은 확인 후 원복했다. RED 원문:

```text
[R6 COST] partner response bytes=786730 rows=5587
[R6 COST] modal radios=5587 domElements=100001

FAIL  ... PartnerAutocomplete.cost.test.tsx
AssertionError: expected 100001 to be less than or equal to 100000
```

즉, 상한을 넘기는 실제 제품 dialog DOM 변경이 테스트를 실패시킨다. 상한이 존재하기만 하는 단정이 아니라, 현재 정상값과 분리 가능한 회귀 감지 경계다.

## S4 추가 보강 — 3배 느린 CI 러너 가정

S1/S2 계열의 5,000ms 경계 재발을 막기 위해 전수 검증 테스트에만 개별 timeout `30_000ms`를 부여했다. 전수 검증, 실제 DOM 비용 측정, 상한 100,000, mutation RED 증명은 변경하지 않았다.

최종 3회 실행의 단일 테스트 시간과 3배 느린 러너 가정:

| 회차 | 전체 Vitest Duration | 단일 S4 테스트 | 3배 시간 | 30,000ms 대비 여유 |
|---|---:|---:|---:|---:|
| 1 | 8.59s | 2,966ms | 8,898ms | 21,102ms |
| 2 | 7.47s | 2,364ms | 7,092ms | 22,908ms |
| 3 | 8.20s | 2,917ms | 8,751ms | 21,249ms |

최악 회차도 `2,966ms × 3 = 8,898ms < 30,000ms`이다. 즉 CI 러너가 이 PC보다 3배 느려져도 timeout까지 21,102ms가 남는다.

## 벽시계 의존성

단일 S4 테스트의 Vitest 측정 시간과 5,000ms 여유:

| 회차 | 전체 Vitest Duration | 단일 S4 테스트 | 5,000ms 대비 여유 |
|---|---:|---:|---:|
| 1 | 8.59s | 2,966ms | 2,034ms |
| 2 | 7.47s | 2,364ms | 2,636ms |
| 3 | 8.20s | 2,917ms | 2,083ms |

전체 명령의 PowerShell 벽시계는 각각 9.9s, 8.8s, 9.5s였고, 단일 테스트는 모두 5,000ms보다 2,034ms 이상 짧았다. 테스트에 `performance.now()`, `Date.now()`, 경과시간 비교는 없다. 개별 timeout은 CI 러너 변동을 흡수하기 위한 30초 고정 상한이며, 시간값을 합격 조건으로 비교하지 않는다.

## 지정 전체 검증

명령:

```powershell
cd clients/web/design-system
npm test -- --run
```

3회 모두 동일하게 통과했다.

```text
Test Files 26 passed (26)
Tests      189 passed (189)
```

각 회차 제품 경로 관찰값:

```text
[R6 COST] partner response bytes=786730 rows=5587
[R6 COST] modal radios=5587 domElements=89979
```

## 변경 파일 및 가드레일

- 변경: `clients/web/design-system/src/components/PartnerAutocomplete/PartnerAutocomplete.cost.test.tsx`
- 신규: `docs/dev-reports/2026-08-06-1080-s4-effective-bound.md`
- 제품 런타임 코드 변경 없음
- `skip`·`todo` 없음
- git 명령, Docker, DB 조작 없음
- 타 트랙(`#1057`, `#1066`, `#1069`, `#1075`) 파일 접근·변경 없음
