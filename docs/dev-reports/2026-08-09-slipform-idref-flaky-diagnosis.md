# 2026-08-09 SlipFormPage 단가 IDREF flaky 재발 진단

## 결론

`origin/main`의 실패 사실은 맞다. 같은 SHA `d09d5db15d837f34754373670a0b973c9c5594c9`의 GitHub Actions CI run `31267367575`에서 attempt 1은 아래 한 건으로 실패했고, attempt 2는 성공했다.

```text
SlipFormPage.test.tsx (99 tests | 1 failed) 6780ms
둘 다: 단가 input IDREF 는 "priceStatusId priceChangedStatusId" 복수를 순서대로 가리킨다 1075ms
expected '1000' to be '200000'
SlipFormPage.test.tsx:2348:57
```

근본 원인은 제품의 bulk 가격 계산 자체가 무작위인 것이 아니라 **같은 테스트 파일의 선행 테스트가 끝나지 않은 비동기 작업을 남기고, 5초 뒤 대상 테스트가 설치한 module-level `mockResolvedValueOnce(200000)`을 선소비하는 교차 테스트 경합**이다.

구체적으로 `does not apply a prior partner bulk result while the newly selected partner DC is pending` 테스트는 `pendingCurrentPartnerDc`를 만들고 끝까지 resolve/reject하지 않는다(`SlipFormPage.test.tsx:462-466, 490-501`). 이 Promise를 기다리던 이전 렌더의 `withPriceLookupTimeout`이 5초 뒤 만료하면, 이미 cleanup된 렌더의 `refreshAutoPricesForPartner`가 계속 진행하여 `getPriceMemories(A, [productA])`를 호출한다. 호출 시점이 대상 테스트의 `beforeEach`와 `mockResolvedValueOnce(200000)` 설치 뒤라면 그 늦은 A 호출이 once 응답을 가져간다. 대상 테스트의 정상 B 호출은 `beforeEach` 기본 응답 `hits: []`를 받아 카탈로그 fallback `1000`을 적용한다.

로컬에서는 파일의 실제 test 구간이 약 3.4~4.1초라 선행 작업의 5초 timeout이 대체로 파일 종료 뒤 발화했다. CI attempt 1에서는 파일 test 구간이 6.780초라 timeout이 파일 실행 중 발화할 시간창이 열렸다. 이것이 동일 SHA 재실행 성공과 로컬 비재현을 함께 설명한다.

## 이 테스트가 지키는 계약

**거래처 변경으로 단가가 `REMEMBERED` 200000으로 실제 갱신되고 변경 표지가 생긴 모바일 라인에서, 단가 input의 `aria-describedby`는 `[가격출처 note id, 단가변경 indicator id]` 두 IDREF를 그 순서로 가리키며 두 대상은 실제 DOM에 존재해야 한다.**

따라서 최종 단가 200000, `거래처 최근단가`, `단가 변경`, 두 IDREF의 순서와 실존성 단언은 모두 보존해야 한다. 단가 단언을 1000에 맞추거나 IDREF 단언을 완화하면 실제 회귀를 묻는다.

## (1) #1103이 정확히 한 일

커밋 `a26f27784daf3645ca7a0d81cd91ec71cbb62d43`의 대상 테스트 변경은 다음 대기 하나다.

- `clients/desktop/src/renderer/routes/SlipFormPage.test.tsx:2344-2347` (`origin/main` 현재 줄): `selectPartnerB()` 뒤 `getPriceMemories(partnerB.id, [productA.id])`가 호출됐는지를 `waitFor`로 기다린다.
- 커밋 당시 diff 위치는 같은 파일의 종전 `2242` 부근이었다. 현재는 후속 테스트 추가로 2344행으로 이동했다.

이 대기가 보장하는 것:

- 현재 mock의 call history 안에 `(partnerB.id, [productA.id])` 인 호출이 제한 시간 안에 하나 이상 기록됐다는 것.
- B 거래처 bulk 조회가 적어도 호출 경계에는 도달했다는 것.

이 대기가 보장하지 않는 것:

- `mockResolvedValueOnce({ unitPrice: 200000 ... })` 응답을 **그 B 호출이 받았는지**.
- B 호출이 반환한 Promise가 완료됐는지.
- hook이 hit를 `REMEMBERED` outcome으로 해석했는지.
- stale/session guard를 통과해 `setLines`가 실행됐는지.
- React가 200000 및 접근성 DOM을 commit했는지.
- 이전 테스트에서 5초 뒤 들어온 늦은 호출이 once 큐를 먼저 소비하지 않았는지.

이미 다음 줄 `2348`에는 최종 DOM 값 200000을 기다리는 `waitFor`가 있었다. #1103은 호출 시작 전 대기 구간을 분리했을 뿐, once 응답의 호출 귀속을 고정하지 못했다.

## (2) 실패값 `1000`의 출처

`1000`은 초기 빈 행 값도, 다른 라인의 값도, 이전 테스트가 DOM에 남긴 값도 아니다. **현재 대상 라인 productA의 카탈로그 판매가이며 bulk miss/실패 fallback으로 정상 계산된 값**이다.

데이터 흐름:

1. module-level fixture `harness.productA.sellingPrice = '1000'` (`SlipFormPage.test.tsx:33-42`), 매 테스트 `beforeEach`에서도 다시 `'1000'`으로 설정한다(`:312-327`, 직접 설정은 `:316`).
2. 품목 선택 시 제품 코드는 카탈로그 판매가를 fallback으로 잡고 라인의 `catalogUnitPrice`에 보존한다(`SlipFormPage.tsx:1345-1387`). A 거래처 단건 mock hit 100000이 정상 적용되어도 catalog fallback 자체는 1000으로 남는다.
3. 거래처 B 변경 시 후보의 `catalogFallback`은 `line.catalogUnitPrice`다(`SlipFormPage.tsx:1570-1591`, 핵심 `:1579`).
4. `usePartnerPriceRefresh`는 bulk hit가 없으면 `candidate.catalogFallback`을 결과 단가로 쓴다(`usePartnerPriceRefresh.ts:146-175`, 핵심 `:156-166`).
5. 그 outcome이 라인에 적용된다(`SlipFormPage.tsx:1645-1675`, 핵심 `:1664-1668`).

왜 hit가 miss가 되는가:

- 대상 테스트는 `getPriceMemories.mockResolvedValueOnce(...)`로 B의 200000을 큐에 한 번만 넣는다(`SlipFormPage.test.tsx:2332-2337`).
- 선행 테스트의 늦은 A bulk 호출이 이를 먼저 소비하면, B 호출은 `beforeEach`의 기본 `mockResolvedValue({ hits: [], failedProductIds: [] })`를 받는다(`:327`).
- 그러므로 최종 DOM은 1000으로 수렴하고 200000 대기가 1초 후 실패한다. CI의 대상 테스트 실행시간 1075ms도 Testing Library 기본 `waitFor` timeout과 일치한다.

즉 세 선택지 판정은 다음과 같다.

| 가능성 | 판정 | 근거 |
|---|---|---|
| 초기값 | 아님 | 빈 행 초기 단가는 `0`이고, 대상 흐름은 먼저 100000까지 확인한다. |
| 다른 라인의 값 | 아님 | productA인 같은 라인의 `catalogUnitPrice` fallback이다. |
| 이전 테스트의 잔재 | DOM/state 잔재는 아니지만 **이전 테스트의 미종료 비동기 작업이 mock 응답을 선소비한 영향은 맞음** | cleanup은 DOM을 제거하지만 Promise·timeout을 취소하지 않는다. |

## (3) 경합 지점과 공유 상태

### 정상 대상 테스트의 시간축

1. A 선택 및 productA 선택.
2. 단건 `getPriceMemory(A, productA)` hit 100000 완료를 DOM 값으로 기다린다(`SlipFormPage.test.tsx:2327-2341`).
3. B 선택 핸들러는 `getPartnerDcConfig(B)` Promise를 만들고 `void refreshAutoPricesForPartner(...)`를 시작한다(`SlipFormPage.tsx:1728-1774`). `selectPartnerB()` helper 자체는 `lookupPartnerForAutoFill('P-B')` 호출만 기다린다(`SlipFormPage.test.tsx:299-302`).
4. refresh는 후보를 만들고 DC Promise 완료를 기다린 뒤(`SlipFormPage.tsx:1546-1611`) 공용 hook의 `partnerReprice.run`을 호출한다(`:1645`).
5. hook은 `getPriceMemories(B, [productA])`를 시작하고, 성공/실패/5초 timeout 뒤 outcome을 반환한다(`usePartnerPriceRefresh.ts:134-190`, API 호출 `:178-181`).
6. session guard 뒤 outcome을 `setLines`에 적용한다(`SlipFormPage.tsx:1645-1675`).

### 대상 테스트가 기다리는 것과 기다리지 않는 것

- 기다림: A의 DOM 값 100000, B bulk의 **호출 기록**, DOM 값 200000, `단가 변경` 텍스트.
- 기다리지 않음/고정하지 않음: B 전용 Promise의 소유권, resolve 시점, response와 call의 대응, 이전 렌더의 timeout 종료, 모든 선행 비동기 작업의 정리.
- `mockResolvedValueOnce`는 어느 호출이 값을 가져갈지 인자 기준으로 묶지 않는다. “다음 호출”이라는 전역 순서만 고정한다.

### 실제 오염을 만드는 선행 테스트

`SlipFormPage.test.tsx:461-502` 테스트는 A→B→A 전환에서 세 번째 A DC 요청에 `pendingCurrentPartnerDc.promise`를 반환한다(`:468-480`). 마지막에는 이전 B bulk만 resolve하고(`:493-496`) 현재 A DC는 미해결로 남긴 채 끝난다.

제품의 timeout은 5000ms다(`usePartnerPriceRefresh.ts:21-32`). 5초 후 old render의 `discountConfigPromise`는 catch되어 null로 끝나고(`SlipFormPage.tsx:1765-1772`), old `refreshAutoPricesForPartner`는 `partnerReprice.run(A, candidates)`까지 계속 간다(`:1608-1645`). React Testing Library `cleanup()`(`SlipFormPage.test.tsx:308-310`)은 DOM unmount만 하며 이 Promise 체인과 timer를 취소하지 않는다.

### 같은 파일의 99개 테스트와 무엇을 공유하는가

- 공유함: `vi.hoisted` module-level `harness` 객체와 그 안의 `getPriceMemory`, `getPriceMemories`, `getPartnerDcConfig` 등 `vi.fn` 객체(`SlipFormPage.test.tsx:8-79`). API module mock도 그 동일 함수 객체를 export한다(`:236-249`).
- `vi.resetAllMocks()`(`:312-313`)은 call history와 mock 구현/once 큐를 초기화하지만, 과거 렌더가 이미 보유한 Promise·timeout·async closure를 취소하지 않는다. 과거 closure가 나중에 동일 `vi.fn` 객체를 호출하면 **그 시점의 새 테스트 mock 구현/once 큐**를 사용한다.
- 부분 공유: `productA`, `bundle`, `isMobile` 같은 module-level mutable fixture. `beforeEach`가 주요 필드를 되돌리지만 객체 자체는 공유된다.
- 공유하지 않음: 각 `renderPage()`는 새 `QueryClient`를 만든다(`:283-291`). React component state와 DOM은 render별이고 afterEach cleanup된다.
- MSW: 이 파일은 MSW handler를 쓰지 않는다. slip/inventory/sales/product/partner API module을 직접 `vi.mock`한다.
- 전역 store: 이 실패 경로에서 가격 결과를 보관하는 전역 store는 없다. 라인 가격은 component local state다.

### “같은 라벨 input 두 개” 함정 판정

동시에 존재하는 두 input을 원인으로 삼지 않았다. CI 실패의 Testing Library dump는 한 `<body><div>` 렌더 루트에서 시작하며, dump 길이 제한 때문에 단가 input 구간까지 나오지 않는다. 따라서 DOM 개수로 중복 마운트를 추정할 증거가 없다. 저장소에서 이미 실측된 것처럼 catch/retry 과정의 출력에 같은 라벨이 두 번 보이더라도 시간순 재마운트 기록일 수 있다. 이번 원인은 DOM 중복이 아니라 **unmount 후에도 살아 있는 비동기 closure가 module-level mock을 다시 호출하는 것**이다.

## (4) 재현률 실측

진단 대상 두 파일의 blob hash는 `origin/main`과 현재 HEAD가 각각 동일했다.

```text
SlipFormPage.test.tsx  ef30fa1aefc25dded118ba9b808eced95185e2d0
SlipFormPage.tsx       8ec07152a71dc9fb2b798f4cefd6dcba65a39bef
```

작업 시작 직후 fetch한 `origin/main`은 실패 SHA `d09d5db15`였다. 최종 검증 시 공유 Git ref가 외부에서 `f4548c8b6`로 갱신되어 있었지만, 사이 커밋은 handoff/memory/docs 변경뿐이며 위 두 파일과 `usePartnerPriceRefresh.ts`에는 diff가 없었다. 현재 `origin/main`에서도 위 두 blob hash가 그대로다.

따라서 브랜치를 전환하지 않고 현재 워크트리의 동일 파일을 실행했다.

### 기본 격리 반복: 0/20 실패

실행 명령 원문:

```powershell
$target='src/renderer/routes/SlipFormPage.test.tsx'
1..20 | ForEach-Object {
  $out = & npx vitest run $target --no-file-parallelism --reporter=basic 2>&1
  $code=$LASTEXITCODE
  # 각 회차 로그의 `Tests 99 passed (99)` 또는 원문 assertion을 분류
}
```

결과: **20회 중 0회 실패, 20회 모두 로그에 `Tests 99 passed (99)`**. 최초 자동 분류 요약은 ANSI escape 때문에 PASS를 `OTHER(code=0)`로 표시했지만 각 20개 원본 요약행은 모두 `Test Files 1 passed`, `Tests 99 passed (99)`였다. 종료코드는 파이프 뒤에서 읽지 않았다.

### 순서 섞기: 0/10 실패

```powershell
1..10 | ForEach-Object {
  $seed=$_
  $out = & npx vitest run src/renderer/routes/SlipFormPage.test.tsx `
    --no-file-parallelism --sequence.shuffle --sequence.seed=$seed `
    --reporter=basic --no-color 2>&1
  $code=$LASTEXITCODE
}
```

결과: seed 1~10 전부 `Tests 99 passed (99)`.

### 부하 실행: 관측 실패 0회

- 4개 동시 Vitest 프로세스: 4/4 pass, 파일 test 구간 3.41~3.67초.
- CPU burner 48개와 동시 실행: 1/1 pass, 파일 test 구간 6.182초.
- 추가 강부하 1회: 1/1 pass, 파일 test 구간 3.644초.

부하 실행에서도 이 로컬 환경에서는 원문 실패를 관측하지 못했다. 이는 “재현 안 됨”이 아니라 **이 환경에서 관측 불가**다. timeout이 시작된 선행 테스트와 대상 테스트 사이의 실제 간격이 5초를 넘는 좁은 시간창이어야 하며, 전체 파일 시간만 5초를 넘는다고 반드시 성립하지 않는다.

### CI 실측: 같은 SHA attempt 기준 1/2 실패

```powershell
gh run view 31267367575 --attempt 1 --log-failed
```

- attempt 1: 99개 중 1개 실패, 파일 6780ms, 대상 테스트 1075ms, 원문 `expected '1000' to be '200000'`.
- attempt 2: 같은 SHA에서 성공.

## (5) 근본 원인과 고치는 방향 — 구현하지 않음

### 근본 원인

1. 테스트가 resolve하지 않은 DC Promise를 남긴다.
2. 제품의 정상 5초 timeout 뒤 old/unmounted 렌더가 bulk API mock을 호출한다.
3. API mock은 파일 전체가 공유하는 동일 `vi.fn`이다.
4. 대상 테스트는 응답을 인자에 묶지 않은 `mockResolvedValueOnce` 큐에 넣는다.
5. 늦은 A 호출과 현재 B 호출의 순서가 CI 부하에 따라 뒤집혀, 200000 hit가 A에 소비되고 B는 기본 empty hit → 1000 fallback을 받는다.
6. #1103의 “B 호출됨” 대기는 response 소유권과 완료를 보장하지 않아 이 경합을 제거하지 못한다.

### 결정적으로 만드는 권장 방향

대기를 하나 더 추가하지 말고 다음 두 층을 함께 고정한다.

1. **선행 테스트의 비동기 수명을 테스트 안에서 종료한다.** `pendingCurrentPartnerDc`를 명시적으로 resolve/reject하고, 그 뒤 발생하는 bulk run까지 `act`/Promise로 끝낸 후 테스트를 종료한다. 또는 fake timer로 정확히 5000ms timeout을 진행시키고 최종 호출·정리를 await한다. cleanup에 timeout 취소를 기대하지 않는다.
2. **대상 테스트의 가격 mock을 once 순서가 아니라 인자에 묶는다.**
   - `getPriceMemory(A, productA)`에는 항상 100000을 반환하는 argument-aware `mockImplementation`을 둔다.
   - `getPriceMemories(B, [productA])`에만 B 전용 deferred Promise를 반환한다.
   - 다른 인자(A 등)는 독립된 명시 응답을 반환한다. 따라서 늦은 A 호출이 B 응답을 소비할 수 없다.
   - B 호출을 확인한 뒤 B deferred를 `act` 안에서 resolve하고 그 Promise 및 React commit을 await한 다음, 기존의 200000·note·indicator·IDREF 단언을 그대로 실행한다.

가장 강한 형태는 component/hook 인스턴스에 `fetchMemories`를 dependency injection하여 렌더별 mock을 소유하게 하는 것이지만, 이 테스트 한 건의 결정성에는 argument-aware module mock과 선행 Promise 정리만으로도 경합 자체를 제거할 수 있다.

### 계약 보존 판정

권장 방향은 기존 계약을 보존한다. 가격을 1000으로 완화하지 않고, `REMEMBERED 200000`이 실제 적용된 뒤 `거래처 최근단가`, `단가 변경`, `[priceStatusId, priceChangedStatusId]` 순서와 DOM 실존성을 계속 검증한다. 바꾸는 것은 제품 기대값이 아니라 **비동기 응답의 소유권과 완료 시점**뿐이다.

### 실제 사용자 결함 가능성 판정

이번 CI의 1000은 test-only once 큐 선소비로 bulk hit가 miss처럼 바뀐 결과다. 실제 API에는 `mockResolvedValueOnce` 큐가 없으므로 이 경로 그대로 사용자의 B 응답이 A 요청에 넘어가지는 않는다. 따라서 현재 증거로는 “제품이 간헐적으로 실제 B 단가 200000 대신 1000을 적용한다”는 결함이 아니다.

다만 실제 bulk 요청이 miss/실패하면 제품이 카탈로그 fallback 1000을 적용하는 것은 코드상 실제 동작이다. 이것은 `usePartnerPriceRefresh`에 명시된 기존 계약이며, 이번 CI만으로 그 계약이 잘못됐다고 판정할 근거는 없다. 별도 제품 이슈로 판단하려면 실제 B API hit 응답이 있었는데도 1000이 적용된 네트워크/상태 증거가 필요하다.

## 같은 계열의 다른 flaky 후보

1. `SlipFormPage.test.tsx:1185-1195` — `new Promise<null>(() => undefined)`인 DC Promise를 영구 미해결로 남긴다. 5초 뒤 old product-selection closure가 `getPriceMemory`를 호출하므로, 후속 테스트의 `getPriceMemory.mockResolvedValueOnce`를 선소비할 수 있다.
2. `SlipFormPage.test.tsx:1204, 1220, 1248-1253, 1273, 2327` — 위 늦은 단건 호출에 취약한 once 기반 단건 가격 mock 후보.
3. `SlipFormPage.test.tsx:559, 598, 621, 1305, 2332` — 늦은 bulk 호출과 같은 `getPriceMemories` once 큐를 쓰는 후보. 특히 2332가 이번 실패점이다.
4. `SlipFormPage.test.tsx:461-502` — 현재 확정된 오염원. 테스트가 의도한 “새 A DC pending 동안 이전 B bulk 무시” 계약을 유지하되 pending A DC의 수명을 테스트 내부에서 반드시 닫아야 한다.

## 신규 파일

- `docs/dev-reports/2026-08-09-slipform-idref-flaky-diagnosis.md`

제품 코드와 테스트는 수정하지 않았고, 브랜치 전환·DB 쓰기·Docker 재배포·commit·push를 하지 않았다.
