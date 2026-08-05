# #1080 S1 — `#1073` 잃은 단정 복원

## 결론

`PartnerAutocomplete.cost.test.tsx`가 5,587건 전체 배열을 실제 `searchPartners` 반환값으로 전달하고, 공용 검색 결과 모달의 5,587개 radio까지 도달하는지 다시 검증하도록 복원했다. 비용 상한은 벽시계 시간이 아니라 모달 subtree의 DOM element 수로 결정한다.

- 전수 전달·렌더: `5587` radio
- 경계 항목: 첫 항목 `거래처 1`, 마지막 항목 `거래처 5587`
- 결정적 비용 상한: `dialog.querySelectorAll('*').length <= 100_000`
- 실측 DOM element 수: `89,979`
- `performance.now()` 및 시간 기반 단정: 없음
- 제품 런타임 변경: 없음

## RED-first 증거

부분 전달을 먼저 남겨 전수 단정의 검출력을 확인했다. `searchPartners`가 `items.slice(0, 32)`를 반환하는 상태에서 전체 5,587건을 기대했다.

```text
stdout: [R6 COST] partner response bytes=786730 rows=5587
FAIL: expected 32 to be 5587 // Object.is equality
Test Files  1 failed (1)
Tests       1 failed (1)
```

실패 위치는 `radios.length` 대 `items.length` 단정이었다. 따라서 5,587건 중 일부만 UI 경로를 통과시키는 회귀는 GREEN이 될 수 없다.

## 변경 내용

대상 파일은 [`PartnerAutocomplete.cost.test.tsx`](../../clients/web/design-system/src/components/PartnerAutocomplete/PartnerAutocomplete.cost.test.tsx) 하나다.

1. 고정 32건 반환을 제거하고, 응답 fixture와 동일한 `items` 전체를 `searchPartners`에서 반환한다.
2. 모달 radio 수를 `items.length`와 비교한다.
3. 첫 radio와 마지막 radio의 `aria-label`을 각각 첫·마지막 fixture와 비교해 경계 행까지 실제 소비됐음을 확인한다.
4. 모달 전체 DOM element 수에 `100,000` 상한을 둔다. 이는 러너 시각과 무관하게 셀 수 있는 비용 경계다.
5. `rows=5587`, `modal radios=5587`, `domElements=89979`를 출력한다.

Codef 테스트와 제품 런타임 코드는 변경하지 않았다. `skip`·`todo`도 추가하지 않았다.

## 3회 반복 검증 원문

명령:

```powershell
cd clients/web/design-system
npm test -- --run
```

### 1회차

```text
[R6 COST] partner response bytes=786730 rows=5587
[R6 COST] modal radios=5587 domElements=89979
Test Files  26 passed (26)
Tests       189 passed (189)
Duration    8.30s (transform 3.95s, setup 25.21s, collect 10.30s, tests 7.30s, environment 83.50s, prepare 9.24s)
```

### 2회차

```text
[R6 COST] partner response bytes=786730 rows=5587
[R6 COST] modal radios=5587 domElements=89979
Test Files  26 passed (26)
Tests       189 passed (189)
Duration    7.48s (transform 3.92s, setup 22.07s, collect 8.85s, tests 6.40s, environment 76.25s, prepare 9.29s)
```

### 3회차

```text
[R6 COST] partner response bytes=786730 rows=5587
[R6 COST] modal radios=5587 domElements=89979
Test Files  26 passed (26)
Tests       189 passed (189)
Duration    7.28s (transform 4.04s, setup 21.57s, collect 9.07s, tests 6.02s, environment 74.44s, prepare 9.90s)
```

3회 모두 동일한 전수 행 수·DOM 비용·통과 건수를 냈다. 전체 Vitest duration은 기존 보고 기준 `8.053s` 부근으로, 이번 실측도 `7.28~8.30s` 범위다.

## 환경 및 가드레일

- 최초 실행 환경에 `node_modules`가 없어 `npm ci --ignore-scripts`로 로컬 의존성만 복구했다. lockfile은 수정하지 않았다.
- Docker 재빌드·재배포·중지, DB 쓰기, git 명령은 수행하지 않았다.
- 새 보고서 파일: `docs/dev-reports/2026-08-05-1080-s1-restore-cost-assertions.md`
