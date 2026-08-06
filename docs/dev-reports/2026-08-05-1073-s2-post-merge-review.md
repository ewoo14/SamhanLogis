# #1073 S2 사후 적대검증 — 시간 의존 테스트 변경

## 결론

**보완 필요.** `CodefImportScopeForm`의 세 기능 단정은 보존됐지만, `PartnerAutocomplete`가 지키던 **5,587건 검색 결과의 UI 경로 전수 전달·렌더 계약**과 그 경로에 걸려 있던 **암묵적 실행 비용 상한**은 32건 fixture로 축소되면서 사라졌다.

제품 런타임 코드는 바뀌지 않았다. 다만 커밋의 변경 파일은 제시된 두 테스트만이 아니라 기존 S1 보고서까지 합쳐 **3개**다.

## 검증 기준과 증거

- 검증 대상: `3c4012db1350cb7669797e7fba4b1dc990949c2c`
- 로컬 `main`은 검증 시점에 `e71a891b6`이어서 대상 객체에 대한 `git show 3c4012db1 --stat`은 `unknown revision`으로 실패했다.
- 쓰기 동기화 명령은 사용하지 않았다. GitHub의 읽기 전용 commit API로 대상 커밋의 부모·stat·patch·blob SHA를 조회했다.
- 대상 커밋의 세 blob SHA는 로컬 원 PR 커밋 `dd363bb90`의 blob SHA와 모두 일치했다.
  - Partner 테스트: `045ee1001f5f5a244fd00c8b934e8709aad6a7e6`
  - Codef 테스트: `a59d04e91d0775833f12cf2e4f8e7debf8bcdcb4`
  - S1 보고서: `a39f7c6b38b3c7419dd010ab99e2dfd2b21ddf41`
- 대상 commit stat: 3 files changed, 114 insertions, 12 deletions.
  - `clients/web/design-system/src/components/PartnerAutocomplete/PartnerAutocomplete.cost.test.tsx`
  - `clients/desktop/src/renderer/routes/components/CodefImportScopeForm.test.tsx`
  - `docs/dev-reports/2026-08-05-1073-s1-flaky-time-tests.md`
- 앞의 두 파일은 테스트이고 마지막 파일은 문서다. 제품 런타임 파일 변경은 **0개**다.

## 변경 전·후 단정 전수 대조

### 1. `PartnerAutocomplete.cost.test.tsx`

| 축 | 변경 전 | 변경 후 | 판정 |
|---|---|---|---|
| 5,587건 fixture 생성 | `items.length === 5,587`인 fixture 생성 | 동일 | 유지 |
| JSON 바이트 | `responseBytes`를 계산하고 로그로만 기록 | 같은 계산 후 `responseBytes > 700,000` 단정 추가 | 형식상 강화. 단, 컴포넌트나 실제 응답에서 얻은 값이 아니라 테스트 내부의 고정 fixture 직렬화 결과라 제품 회귀에는 사실상 무력하다. fixture가 그대로면 항상 참이다. |
| 컴포넌트 입력 | `searchPartners`가 5,587건 전부 반환 | 앞의 32건만 반환 | **손실.** 대규모 결과가 `PartnerAutocomplete → AsyncAutocomplete → SearchResultSelectionModal`을 전부 통과하는지 더 이상 검사하지 않는다. |
| 모달 도달 | 5,587건 반환 뒤 `findByRole('dialog')` 성공 | 32건 반환 뒤 동일 | 기능 종류는 유지됐으나 대규모 입력 조건은 소실됐다. |
| 모달 truthy | `findByRole` 결과에 `toBeTruthy()` | 동일 | 원래부터 중복 단정이다. `findByRole`이 실패하면 앞에서 이미 테스트가 실패하므로 독립 검출력은 없다. |
| 결과 개수 | radio 수가 `items.length`, 즉 5,587인지 단정 | radio 수가 `renderedItems.length`, 즉 32인지 단정 | **조건 완화.** 32건 안의 1:1 렌더는 계속 지키지만 33번째 이후의 누락·절단·중복을 못 잡는다. |
| 렌더 시간 계측 | `performance.now()` 전후 차이를 `renderMs`로 로그 | 계측·로그 제거 | 명시적 성능 임계값 단정은 원래도 없었다. 다만 5,587건 실제 렌더가 Vitest 기본 5초 안에 끝나야 한다는 암묵적 상한은 존재했고 실제 CI red를 냈다. 변경 후에는 그 대규모 경로 자체가 실행되지 않아 상한도 사라졌다. |
| 로그의 행 수 | `rows=5587`, 실제 UI 입력도 5,587건 | `rows=5587`, 실제 UI 입력은 32건 | 증거 의미가 느슨해졌다. 현 로그만 보면 5,587행 UI 경로를 검증한 것처럼 읽히지만 실제로는 직렬화 fixture 수만 뜻한다. |

#### 32건 축소로 못 잡는 구체적 회귀

- 33번째 이후 결과를 잘라내거나 버리는 회귀. 예를 들어 결과 표면이 최대 32개만 유지해도 변경 후 테스트는 통과하고 변경 전 테스트는 radio 수 불일치로 실패한다.
- 33번째 이후에서만 발생하는 key 충돌, 순서 손실, 특정 인덱스 누락 또는 중복 렌더.
- 결과 수가 커질 때만 나타나는 비선형 처리 비용, 과도한 DOM 생성, 메모리 급증, 장시간 UI 정지 또는 테스트 timeout.
- 5,587건/786,730바이트 fixture는 계속 만들어지지만 UI에는 전달되지 않는다. 따라서 바이트 하한 단정은 “큰 응답을 UI가 처리한다”는 계약을 증명하지 않는다.

#### `performance.now()` 제거 판정

`renderElapsedMs`에 임계값을 비교하는 단정은 변경 전에도 없었으므로 **명시적 성능 회귀 단정이 삭제된 것은 아니다.** 그러나 변경 전에는 5,587건을 실제로 렌더했고 테스트 전체가 기본 5초를 넘으면 실패했다. 이 암묵적·러너 의존적 상한이 CI flake의 원인이었던 동시에 대규모 경로의 심각한 성능 회귀를 잡는 유일한 장치였다. 변경 후 32건만 렌더하므로 5,587건 성능이 크게 악화돼도 이 테스트는 잡지 못한다.

### 2. `CodefImportScopeForm.test.tsx`

| 위치·계약 | 변경 전 | 변경 후 | 판정 |
|---|---|---|---|
| 첫 저장 호출 | `waitFor` 안에서 `saveCodefImportScopeMock` 정확히 1회 | `flushZeroDelayTasks()` 뒤 정확히 1회 | 단정 동일. 손실 없음. |
| 첫 저장 version | 첫 호출 payload가 `{ version: 0 }` | 동일 | 유지 |
| 두 번째 저장 호출 | `waitFor` 안에서 정확히 2회 | queue flush 뒤 정확히 2회 | 단정 동일. 손실 없음. |
| 두 번째 저장 version | 두 번째 호출 payload가 `{ version: 1 }` | 동일 | 유지 |
| branch B 가져오기 호출 | `waitFor` 안에서 `importScopedCodefMock` 정확히 1회 | queue flush 뒤 정확히 1회 | 단정 동일. 손실 없음. |
| branch B payload | `CARD`, `SELECTED`, 계좌 빈 배열, 카드 1건, 대출 빈 배열 | 동일 | 유지. 이 payload 단정으로 의도한 branch가 실제 도달했음도 확인된다. |

`waitFor`의 5초는 “5초가 지나야 성공”하는 조건이 아니라 동일한 정확한 호출 횟수가 성립할 때까지의 최대 polling 한도였다. 변경 후 helper는 호출 시점에 예약돼 있던 0ms timer, MessageChannel 작업, 파생 microtask를 통과한 뒤 같은 exact-count 단정을 수행한다. 즉 세 기능 계약은 느슨해지지 않았다. 오히려 해당 결정적 경계 뒤에도 호출이 없으면 즉시 실패한다.

새로 도달하지 않게 된 분기는 발견하지 못했다. 기존과 변경 후 모두 “정확히 1/2회”가 잠시 성립한 뒤 더 늦게 중복 호출되는 경우까지 끝까지 감시하지는 않지만, 이는 이번 변경으로 새로 생긴 손실은 아니다.

## 사실상 무력화되거나 느슨해진 단정

1. `responseBytes > 700,000`은 고정 fixture의 자체 직렬화 값만 검사한다. 같은 테스트 코드 아래에서는 제품 동작과 무관하게 참이며, 대형 응답의 UI 처리 보증으로 사용할 수 없다.
2. `expect(dialog).toBeTruthy()`는 성공한 `findByRole` 직후라 독립 검출력이 없다. 이번 변경 전부터 그랬다.
3. radio 수 단정은 전수 5,587건에서 앞 32건으로 범위가 줄었다. 32건 내부에서는 유효하지만 대규모 완전성 계약으로는 느슨해졌다.
4. `rows=5587` 로그는 UI가 받은 행 수가 아니라 UI에 전달되지 않은 원 fixture 수를 출력한다. 통과 증거로 읽으면 오해를 만든다.
5. Codef의 변경된 세 exact-count 및 payload 단정에는 항상 참인 조건, 완화된 조건, 미도달 분기가 없다.

## 이 변경 뒤 CI가 못 잡는 회귀

CI는 이제 Partner 검색 결과가 33~5,587번째 구간에서 무음 누락·절단·중복되는 회귀를 이 테스트로 잡지 못한다. 또한 5,587건 결과를 여는 경로가 비선형적으로 느려지거나 과도한 DOM·메모리를 소비해도, 32건 경로가 정상인 한 이 테스트는 통과할 수 있다. 반면 Codef의 낙관적 잠금 version 연쇄와 현재 화면 범위만 가져오는 branch B 계약은 계속 잡는다.

## 후속 보완 불변식

구현 수단이 아니라 되찾아야 할 계약만 적는다.

- **I-1 대규모 결과 완전성:** 서로 다른 5,587개 거래처 검색 결과가 반환되면 1번부터 5,587번까지 어느 항목도 무음 절단·누락·중복되지 않고 사용자가 선택 가능한 결과 집합에 보존돼야 한다.
- **I-2 동일 표본의 종단 일치:** 크기·행 수를 검증하는 대규모 응답 표본과 UI 검색 경로가 소비하는 표본은 동일해야 하며, 보고된 행 수는 실제 UI 경로에 전달된 행 수와 일치해야 한다.
- **I-3 대규모 비용 경계:** 5,587건 결과를 여는 사용자 경로는 합의된 성능·자원 경계를 안정적으로 만족해야 하며, 그 경계를 넘는 회귀는 CI 러너의 순간 부하와 구별돼 검출돼야 한다.

## 좁은 실행 검증

대상 blob을 원 PR 커밋에서 OS 임시 디렉터리에 archive하고 기존 설치 의존성을 연결해, 전체 게이트 없이 지정된 두 스위트만 실행했다. 실행 후 임시 파일은 제거했다.

```text
PartnerAutocomplete.cost.test.tsx
  Test Files  1 passed (1)
  Tests       1 passed (1)
  test body   76ms
  Duration    3.01s
  log         partner response bytes=786730 rows=5587

CodefImportScopeForm.test.tsx
  Test Files  1 passed (1)
  Tests       42 passed (42)
  test body   1.64s
  Duration    5.23s
```

skip·todo 추가는 없고 Docker·DB·제품 코드는 건드리지 않았다.
