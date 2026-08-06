```
git -C . rev-parse --show-toplevel
D:/dev/Samhan-Public/.claude/worktrees/w1062-lineux
git -C . branch --show-current
fix/1062-line-input-ux
git -C . rev-parse HEAD
5ce70bab5afced699f3b632b13cfd5aaa6c7397e
```

# PR #1063 R22 SOL 적대검증 최종 보고서

## 최종 판정

**머지 비권고.** 이 PR이 바꾼 화면에서 실사용자가 도달할 수 있는 오동작 5건을 확인했다. 그중 두 경로는 이미 확정한 품목 또는 협업 중인 미저장 행을 사용자 의도 없이 소실시킨다.

증거 무결성 이상은 찾지 못했다. 동일 HEAD에서 PR 코멘트의 `npx vitest run` 수치인 **198 files / 1,752 tests**를 그대로 재현했고, `npm run typecheck`도 종료 코드 0이었다. 집 PC 보고서의 `2,174건`·`2,026건`은 이 보고서의 건수로 사용하지 않았다.

## 회사 PC 실데이터 기준

모든 DB 명령은 `docker exec samhan-postgres psql -U samhan -d <db> -c "<SQL>"` 형식의 읽기 전용 `SELECT`로 실행했다.

| 표면 | 실측 |
|---|---:|
| 활성 품목 | 3,061건 |
| 규격이 실제로 있는 활성 품목 | 1,264건 |
| 판매·구매 전표 선택 가능 품목(`PARTNER_ORDER`/`BOTH`) | 774건 |
| 그중 규격이 실제로 있는 품목 | 315건 |
| 활성 전표 | INBOUND 2건/8라인, OUTBOUND 120건/269라인 |
| 수정 가능한 견적 초안 | 24건/35라인 (1라인 13건, 2라인 이상 11건) |
| 분개 초안 | 5건/13라인 (MANUAL 2건/4라인, SLIP 3건/9라인) |
| 재고이동 | 0건 |
| 창고 | 30건 |

전표 상태별 집계도 제시된 원문과 일치했다.

```
 slip_type |   status   | count
-----------+------------+------
 INBOUND   | CONFIRMED  |     1
 INBOUND   | INSPECTING |     1
 OUTBOUND  | CONFIRMED  |     1
 OUTBOUND  | DRAFT      |   115
 OUTBOUND  | SENT       |     4
```

## 발견 1 — 확정 품목 입력을 다시 포커스하는 것만으로 품목이 해제되고 저장 대상에서 사라진다

### ① 사용자가 밟는 화면 동선

`/sales/new` 또는 `/purchases/new` → 품목 한 건 선택 → Tab 이동 뒤 같은 품목 입력을 마우스로 다시 클릭하거나 역방향 Tab으로 재진입한다. 글자를 수정하지 않아도 확정된 `productId`와 품목 표시값이 즉시 지워진다.

이 행이 유일한 유효 행이면 저장 버튼이 비활성화된다. 다른 유효 행도 있으면 저장은 가능하지만, 방금 포커스한 행만 payload에서 빠진다.

### ② 재현 근거

- `AsyncAutocomplete.tsx:198-213`: `handleFocus()`가 선택값이 있는 경우에도 `setCommitted(value === null)`을 실행한다. 선택값은 `null`이 아니므로 단순 focus가 `onInputCommitChange(false)`를 발생시킨다.
- `SlipFormPage.tsx:1645-1652`, `1723-1730`: `committed === false`를 받으면 `productId`, `productName`, `productType`, `modelCode`를 지운다.
- `SlipFormPage.tsx:1105-1108`: 저장 payload는 `productId`가 있는 행만 포함한다.
- `SlipFormPage.tsx:1144-1157`, `1821-1827`: 유효 행 수도 `productId` 기준이므로 유일 행이면 저장 자체가 막힌다.
- 라우트는 `routes/index.tsx:438-443`, `572-577`에서 실제 권한 가드 아래 노출된다.

### ③ 실데이터에서 해당하는 건수

현재 선택 가능한 실품목 **774건 전부**가 이 포커스 경로의 대상이다. 이 화면들은 신규 작성 화면이므로 기존 저장 전표 중 직접 수정되는 건수는 0건이지만, 774건 중 어느 품목을 새 라인에 확정해도 동일하게 재현된다.

## 발견 2 — 판매·구매 신규 전표만 후보 2건 이상에서도 요구된 선택 모달이 열리지 않는다

### ① 사용자가 밟는 화면 동선

`/sales/new` 또는 `/purchases/new` → 품목 입력에 `AJ` 입력 → 복수 후보가 조회된다. 기획 결정은 후보 2건 이상이면 표 모달로 전환하는 것이지만, 이 두 화면은 계속 인라인 목록을 표시한다.

### ② 재현 근거

- `AsyncAutocomplete.tsx:353-358`: `resultSelectionMode`가 있고 결과가 2건 이상일 때만 모달을 연다.
- `ProductAutocomplete.tsx:154`, `185`: 공용 기본값은 `single`이지만 `null`을 넘기면 하위 컴포넌트에는 `undefined`가 전달된다.
- `SlipFormPage.tsx:1658`, `1736`: 모바일·데스크톱 양쪽에서 명시적으로 `resultSelectionMode={null}`을 넘겨 모달 조건을 끈다.

### ③ 실데이터에서 해당하는 건수

회사 DB에서 전표 선택 가능 품목을 같은 조건으로 검색한 결과는 다음과 같다.

```
    keyword     | candidates
----------------+-----------
 AC023CS1DBC1SY |          1
 AJ             |         45
```

따라서 1건 후보 경로는 실제 데이터에서 선택 가능하지만, `AJ`는 실품목 **45건**이 매치되어 복수 후보 모달 조건에 확실히 도달하면서도 모달이 열리지 않는다. 전체 선택 가능 모집단은 774건이다.

## 발견 3 — 복수 후보 모달의 규격 열이 실데이터 1,264건을 모두 `—`로 표시한다

### ① 사용자가 밟는 화면 동선

`/inventory/safety-stock-alerts`에서 제품 검색 또는 `/products/estimate-items`의 세트 구성품 추가 → 두 건 이상 검색 → 표 모달 확인. DB에 규격이 있는 품목도 규격 열에는 `—`가 나온다.

### ② 재현 근거

- `ProductAutocomplete.tsx:121-144`, 특히 `135`: 규격 열은 `product.specification`이 없으면 `—`를 렌더한다.
- `productApi.ts:26-37`, `72-85`: 프런트 타입에만 `specification`을 선택 필드로 선언하고 응답값을 매핑한다.
- 실제 검색 응답 DTO `services/product-service/.../ProductSummaryResponse.java:27-49`에는 `specification` 필드가 없다. `/api/products`가 이 DTO를 반환하는 것은 `ProductController.java:74-76`에서 확인된다.
- 실제 모달 소비자는 `SafetyStockAlertsPage.tsx:292-303`, `EstimateItemsCatalogPage.tsx:726-731`, `894-901`이다.

즉 DB 값의 문제가 아니라 검색 API 계약상 필드가 내려오지 않아 모든 모달 행이 fallback으로 렌더된다.

### ③ 실데이터에서 해당하는 건수

활성 품목 3,061건 중 규격이 비어 있지 않은 품목은 **1,264건**이다. 전표용 774건만 좁혀도 **315건**에 실제 규격이 있다. 안전재고 검색은 전체 활성 품목을 사용하므로 1,264건이 잘못 표시될 수 있다.

## 발견 4 — 견적 협업에서 자동 빈행 입력이 Y.Doc 행 수를 늘리고, 다른 참가자의 진입이 미저장 행을 서버 상태로 덮는다

### ① 사용자가 밟는 화면 동선

사용자 A와 B가 같은 `/sales/estimates/:id/edit` 견적을 편집한다.

1. A가 마지막 자동 빈행에 품목을 입력하면 로컬에 다음 빈행이 생긴다.
2. A가 그 다음 자동 빈행에도 입력을 시작하면 해당 숫자 index가 Y.Doc에 새 행으로 생성되어 원격 참가자에게 전파된다.
3. 저장 전 B가 같은 견적에 진입하거나 재연결한다.
4. 서버 라인 수에 trailing 빈행 하나만 더한 수와 Y.Doc 행 수가 다르므로 B의 초기화 경로가 `replaceItems`를 실행한다. A의 미저장 입력 행들이 서버 내용과 빈행 하나로 덮인다.

### ② 재현 근거

- `EstimateFormPage.tsx:1029-1038`: 사용자가 마지막 행 내용을 바꾸면 `appendBlankRowIfLastChanged`로 다음 빈행을 붙인다.
- 입력 필드는 `EstimateFormPage.tsx:1903-1985`에서 `items.${i}.*` 숫자 index 경로를 사용한다.
- `CollaborativeSlipInput.tsx:29-38`, `292-303`: 실제 입력을 로컬 상태에 반영한 뒤 숫자 index로 `provider.setItemValue()`를 호출한다.
- `createCoeditProvider.ts:488-492`, `699-700`: index가 현재 길이 밖이면 `ensureItemMap()`이 Y.Array에 행을 push한다.
- `EstimateFormPage.tsx:298-310`: 서버 내용에도 trailing 빈행을 포함해 `replaceItems`로 seed한다.
- `EstimateFormPage.tsx:876-886`: 연결 시 provider 행 수가 서버 내용 + trailing 빈행 수와 다르면 무조건 `seedEstimateCoeditProvider()`를 호출한다. 이 호출은 기존 Y.Doc 미저장 행을 보존하거나 병합하지 않는다.

따라서 손대지 않은 빈행 자체만의 문제가 아니다. 이 PR 정의상 아직 `productId`가 확정되지 않아 “빈행”인 사용자의 실제 입력 행이 Y.Doc에 생긴 뒤, 참가자 진입이 그 행을 제거하는 경로다.

### ③ 실데이터에서 해당하는 건수

회사 DB의 활성 견적은 모두 `QUOTE_DRAFT`이며 **24건/35라인**이다. 24건 모두 이 편집·협업 경로의 실제 문서 모집단이다. 현재 동시에 열려 있는 세션과 미저장 Y.Doc 행 수는 영속 DB로 계수할 수 없으므로, 이미 소실 중인 세션 수를 임의 수치로 만들지 않았다.

## 발견 5 — “행 추가 버튼 없음” 결정과 달리 네 화면 모두 수동 라인 추가 버튼을 유지한다

### ① 사용자가 밟는 화면 동선

전표 신규 작성, 견적 신규/수정, 분개 신규/수정, 재고이동 신규 작성 화면 하단에 `+ 라인 추가`가 그대로 보인다. 견적 협업 중에는 비활성일 수 있지만 버튼 자체가 남고, 나머지 경로에서는 클릭해 빈행을 추가할 수 있다.

### ② 재현 근거

- 전표: `SlipFormPage.tsx:662-665`, `1582-1583`
- 견적: `EstimateFormPage.tsx:1222-1226`, `2093-2097`
- 분개: `JournalFormPage.tsx:390`, `624-625`
- 재고이동: `TransferFormPage.tsx:97`, `302-303`
- 실제 라우트는 `routes/index.tsx:438`, `486`, `537`, `572`, `613`, `650`, `658`이다.

### ③ 실데이터에서 해당하는 건수

버튼이 있는 편집 라우트로 도달 가능한 기존 문서는 견적 24건 + 분개 초안 5건 = **29건**이다. 재고이동은 현재 0건이고, 전표·견적·분개·재고이동 신규 작성은 기존 레코드 수와 무관하게 각각 도달 가능하다. 버튼 클릭만으로 저장 데이터가 생기지는 않으므로 저장 오염 건수는 0건이다.

## 요청 각도별 비결함 판정

- **품목코드 미확정인데 규격·수량·단가·적요를 채운 행:** 개발책임자가 준 현재 정의상 이 행은 “빈행”이고 저장 제외가 의도된 계약이다. 그 삭제 자체는 별도 결함으로 보고하지 않았다. 다만 발견 1처럼 이미 확정한 품목을 단순 focus가 미확정으로 바꾸는 경우는 의도된 제외가 아니다.
- **자동완성 1건/2건 이상 선택 가능성:** 1건은 직접 선택 가능하고 2건 이상도 인라인 목록에서 선택 자체는 가능하다. 선택 불가능 결함은 없었다. 복수 후보가 요구된 모달로 전환되지 않는 계약 위반만 발견 2로 보고했다.
- **분개 차변·대변 최소 행:** `JournalFormPage.tsx:382-387`은 최소 2개 표시 행을 유지하고, `411-416`은 계정과 금액이 있는 의미 행 2개를 다시 요구한다. 자동 빈행 때문에 짝이 저장되거나 짝 검증이 우회되는 충돌은 찾지 못했다. 실데이터는 초안 5건/13라인이다.
- **재고이동 최소 행:** 한 행은 유지되고 저장은 `productId + 수량 > 0`인 행만 허용한다(`TransferFormPage.tsx:158-166`, `292-299`). 현재 실데이터 0건에서 별도 충돌은 없다.

## 증거 무결성 확인

동일 HEAD에서 다음을 재실행했다.

```
Test Files  198 passed (198)
Tests       1752 passed (1752)
```

`npm run typecheck`도 종료 코드 0이었다. PR 코멘트가 동일 HEAD의 실측으로 제시한 이 두 결과에는 불일치가 없다. 회사 PC의 전표 상태 집계도 보고서 앞부분의 SQL 원문과 일치한다.

## 이 라운드가 보지 않은 것

- 후속 이슈 #1071 범위인 `/sales/:id/edit`의 동작은 검증·판정하지 않았다. `SlipDetailPage`와 그 화면의 `CollaborativeSlipInput` 회귀도 대상에서 제외했다. 다만 발견 4에서는 견적 화면이 실제 호출하는 공용 Y.Doc 쓰기 함수만 데이터 흐름 근거로 추적했다.
- 테스트 강도, mock·스크린샷 품질, 문서 표현 품질, 가드의 빈틈은 판정하지 않았다.
- 배포 서버는 PR 코드가 아니므로 재배포하거나 그 화면으로 런타임 판정을 하지 않았다. 컨테이너·DB 쓰기도 하지 않았다.
- 심각도 분류, 범위 밖 코드의 일반 품질, 이 PR과 무관한 기존 경고는 보고하지 않았다.
- 코드는 수정하지 않았고 `git add`·commit·push를 하지 않았다.
