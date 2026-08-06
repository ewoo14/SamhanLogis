# PR #1063 R16 SOL 5.6 재수렴 적대검증

- 검증 일자: 2026-08-05 (KST)
- 대상 브랜치: `fix/1062-line-input-ux`
- 대상 HEAD: `6146cb0afae55c0fab88f525945ebdd3fbb887f2`
- 판정 질문: R15 변경 후 사용자 행위로 도달 가능한 기능 결함이 남아 있는가
- 제한: 코드 수정, 컨테이너 조작, DB 직접 쓰기, 견적·이동·분개 재측정 금지

## 진행 기록

- 작업 루트가 `C:/dev/Samhan-Public/.claude/worktrees/t1062`임을 확인했다.
- 브랜치와 HEAD가 요청값과 일치함을 확인했다.
- 기존 변경 상태인 `renderer-real-qa.log`, `renderer-real-qa.err.log`는 열거나 수정하지 않는다.

## 판정 요약

- 도달 결함: **1건**
- 새 표면 1(원격 삭제 후 index 축소): 결함 미도달
- 새 표면 2(`setItemValueById` draft 누수): 결함 미도달
- 새 표면 3(확정 승격 순간): 같은 JS 이벤트 안에서는 중간 입력이 끼어들 수 없지만, **승격 뒤 첫 문서 재수렴에서 협업용 신규 lineId가 소실되는 도달 결함 1건**
- 새 표면 4(삭제와 상대 편집 경합): 서버 기존행은 안정 ID 삭제가 수렴하며 관련 Yjs 테스트도 통과
- 새 표면 5(저장 payload): 품목 확정행 포함과 미확정 draft 제외는 동시에 성립. 단, 아래 결함 때문에 신규 확정행의 후속 편집·삭제 계약은 성립하지 않음

## 도달 결함 1 — 신규 확정행은 다음 문서 변경에서 협업용 lineId를 잃어 삭제가 다시 Y.Doc에 전파되지 않는다

### 사용자 도달 순서

1. 판매전표 수정 화면의 trailing 빈행에서 품목을 선택한다.
2. `promoteSelectedProductToCoedit`가 `provider.addItem()`으로 Y.Doc 행과 클라이언트 신규 lineId를 만들고, 선택한 품목 필드를 기록한다 (`SlipDetailPage.tsx:421-443`).
3. 화면은 반환 lineId를 로컬 행에 잠시 귀속한다 (`SlipDetailPage.tsx:4846-4852`).
4. 사용자가 그 확정행의 규격·수량·단가 중 하나를 편집하거나, 상대가 아무 협업 필드를 편집한다. Y.Doc의 모든 update는 동기적으로 `notifyDoc()`를 호출하고 (`createCoeditProvider.ts:578-582`), 화면의 구독은 매번 `applyProviderState`를 실행한다 (`SlipDetailPage.tsx:1845-1865, 1915-1917`).
5. 재수렴 함수는 Y.Doc에 있는 클라이언트 신규 lineId를 읽지만, `knownServerLineIds`에 없는 ID는 `resolveServerLineId`에서 의도적으로 `null`로 강등한다 (`coeditLineIds.ts:49-57`, `SlipDetailPage.tsx:707-742`). 따라서 로컬 신규 확정행은 `lineId: null`이 된다.
6. 이후 삭제 버튼을 누르면 `removeSalesLine`의 `if (lineId)`가 거짓이므로 `provider.removeItem`이 호출되지 않는다 (`SlipDetailPage.tsx:4873-4880`). 화면 state에서만 행이 사라지고 Y.Doc에는 확정행이 남는다. 다음 문서 update에서 `applyProviderState`가 그 행을 다시 구성하므로 부활 경로가 열린다.

### 같은 뿌리의 후속 편집 손상

- `lineId`가 `null`이 된 뒤 입력 경로는 ID형에서 숫자 index형으로 바뀐다 (`detailCoeditFieldPath`, `SlipDetailPage.tsx:415-418`). 이 index는 실제 Y.Doc 범위 안이므로 R15 guard를 통과한다.
- 수량·단가 파생 금액 동기화는 `preEditLine.lineId`가 없으면 즉시 반환한다 (`syncDetailAmountToDoc`, `SlipDetailPage.tsx:1094-1116`). 따라서 신규 확정행의 두 번째 이후 편집부터는 원래 이 함수가 막던 stale 공급가액·부가세 재수렴 경로가 다시 열린다.
- `coeditLinesToEditLines`의 previous 매칭도 Y.Doc의 클라이언트 lineId와 로컬의 `null`이 일치하지 않아 실패한다 (`SlipDetailPage.tsx:713-718`). 즉 삭제 전파만의 문제가 아니라 신규 확정행의 안정적인 후속 편집 계약 자체가 끊긴다.

### 근본 원인

하나의 `lineId` 필드가 서로 다른 두 책임을 동시에 맡는다.

- Y.Doc 내부에서는 아직 저장되지 않은 신규 확정행을 안정적으로 편집·삭제하기 위한 **협업 ID**가 필요하다.
- BE payload에서는 서버 소유 ID가 아닌 클라이언트 ID를 보내면 안 되므로 **서버 lineId**만 허용하고 나머지는 `null`이어야 한다.

R15는 `addItem()`의 협업 ID를 화면 행의 `lineId`에 넣었지만, 기존 재수렴 계층은 그 필드를 서버 ID로 해석해 바로 `null`로 강등한다. 승격 함수 단독 검증과 실제 화면 재수렴 계약이 서로 충돌한다.

### 증거 무결성

다음 두 테스트 계약은 각각 GREEN이지만 함께 놓으면 실제 화면 시퀀스를 증명하지 못한다.

- `R15 RED-A2 draft 품목 확정은 반환된 lineId로 삭제 가능한 협업 라인을 만든다`: 승격 직후 반환 ID로 `provider.removeItem(lineId)`를 직접 호출한다. 화면의 `applyProviderState → coeditLinesToEditLines` 단계를 거치지 않는다.
- `신규 라인(lineId 미보유)은 null 로 전송한다`: `addItem`으로 만든 클라이언트 ID가 `coeditLinesToEditLines` 뒤 로컬 `lineId: null`이 됨을 명시적으로 단언한다.

R16에서 두 테스트를 같은 명령으로 실행했고 둘 다 통과했다. 이는 각각의 단위 계약이 GREEN이라는 뜻이지, “승격 → 화면 재수렴 → 후속 편집/삭제” 연결 계약이 성립한다는 증거가 아니다.

## 새 표면별 도달성 판정

### 1. 원격 삭제로 배열이 줄 때 정상 편집이 index guard에 막히는가

**미도달.** 서버 기존행과 현재 확정행은 `detailCoeditFieldPath`가 숫자 위치가 아니라 `lineId`를 사용한다. 원격 삭제가 선행행을 제거해 배열 index를 당겨도 잔여행 입력은 `setItemValueById`로 자기 Map을 찾는다. 삭제된 행 자체의 구독은 `getItemIndexById(rowKey) < 0`이면 doc-sync를 로컬 index state에 반영하지 않는다 (`CollaborativeSlipInput.tsx:157-169`). 원격 update 처리와 React commit 사이에는 사용자 입력 이벤트가 끼어들 수 없으므로, 정상 잔여행이 stale 숫자 index로 조용히 no-op 되는 사용자 경로를 찾지 못했다.

기존 `원격 피어가 1행을 삭제해도 잔여 행이 자기 lineId를 유지한다`와 삭제/편집 Yjs 조합 테스트를 실행해 통과를 확인했다.

### 2. ID형 경로로 draft가 Y.Doc에 새는가

**미도달.** 확정 사양상 draft는 `productId`가 없는 trailing 화면 행이고, `ensureTrailingBlankRow`가 만드는 이 행의 `lineId`는 `null`이다. 따라서 `detailCoeditFieldPath`는 숫자 index를 만들며 R15 범위 guard에 걸린다. Y.Doc에 남은 레거시 빈 Map이 클라이언트 ID를 갖더라도 서버 ID 집합에 없는 ID는 로컬 `lineId: null`로 강등된다. 현재 판매전표 UI에서는 확정 기존행의 품목을 다시 비우는 조작도 노출되지 않아, draft가 유효 서버 lineId를 가진 채 ID형 경로로 들어가는 도달 행위를 찾지 못했다.

### 3. 확정 승격 시점과 Y.Doc 삽입 사이 입력

`addItem()`과 네 품목 필드 기록은 같은 동기 이벤트 핸들러 안에서 끝난다. 브라우저 입력 이벤트나 원격 WebSocket 이벤트가 그 호출 스택 중간에 실행될 수 없으므로 “삽입 전 입력” 자체는 미도달이다. 그러나 삽입 완료 뒤 첫 문서 변경에서 lineId가 소실되는 위 결함이 도달한다.

### 4. 확정행 삭제와 상대의 동시 편집

서버 기존행처럼 안정 ID가 유지되는 행에서는 삭제가 Y.Array 요소를 제거하고, 상대의 같은 Map 필드 편집이 병합돼도 삭제된 요소는 배열에 다시 나타나지 않는다. `setItemValueById`도 삭제 후 ID를 찾지 못하면 no-op이다. 관련 2-peer Yjs 테스트 2건을 실행해 통과했다. 신규 확정행은 동시성 이전에 위 lineId 소실 결함 때문에 삭제 전파 자체가 끊긴다.

### 5. 저장 payload의 확정행 포함과 draft 제외

`persistedDetailLines`는 `productId.trim()`이 있는 행만 남긴다 (`SlipDetailPage.tsx:537-540`). 판매전표 저장은 이 필터 뒤 `buildDetailLinePayload`를 적용한다 (`SlipDetailPage.tsx:2462-2479`). 따라서 품목 확정행은 포함되고 미확정 draft는 제외된다. 신규행의 서버 payload `lineId: null`도 기존 BE 계약상 의도다. 다만 협업 ID와 서버 ID를 같은 로컬 필드에 담은 결과, 저장 전 후속 편집의 파생 금액과 삭제 전파에는 위 결함이 남는다.

## 실행 근거

실행 명령:

```text
npx vitest run src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx src/renderer/components/collab/CollaborativeSlipInput.test.tsx -t "R15 RED-A|신규 라인\(lineId 미보유\)|원격 피어가 1행을 삭제|draft 행"
```

결과: 2 files passed, 4 tests passed, 125 skipped.

추가로 서버 기존행 삭제/편집 경합 관련 2개 테스트를 실행해 2 tests passed를 확인했다.

## 브라우저 한계

인앱 브라우저 런타임을 확인했으나 사용 가능한 브라우저가 0개여서 라이브 UI 재현은 수행하지 못했다. 독립 Playwright나 mock으로 대체하지 않았으며, 판정은 실제 화면 핸들러·provider 구독·Y.Doc 재수렴의 연결 코드와 기존 순수함수/Yjs 테스트 계약을 근거로 했다.

## 이 라운드가 보지 않은 것

- 이미 확인된 R4 견적·분개 라이브QA를 재측정하지 않았다.
- 이동은 수정 가능 문서 0건이라는 기존 상태를 재측정하지 않았다.
- 컨테이너를 조작하지 않았고 DB를 직접 읽거나 쓰지 않았다.
- `docs/qa/1062-line-input-real-qa/renderer-real-qa*.log`를 열거나 수정하지 않았다.
- 브라우저 부재로 실제 두 창에서 신규 확정행의 “편집 → 삭제 → 상대 편집”을 클릭 재현하지 못했다.
- CI 49/49는 제공된 결과로 수용했고 재실행하지 않았다.

## 최종 판정 — 머지 비권고

**도달 결함 1건이므로 PR #1063 머지를 권고하지 않는다.** R15의 목표였던 “신규 확정행 삭제의 Y.Doc 양방향 반영”이 실제 화면 재수렴을 한 번 거치면 다시 깨진다. 개발책임자가 제시한 조건에 따르면 결함 0이 아니므로, 추가 fix를 반복하기보다 판매전표 빈행 요구를 제외하는 바운드 전환 조건에 해당한다.
