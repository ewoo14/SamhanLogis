# #1062 R9 — R7 자기 표면 폐쇄 보고서

- 라운드: R9 (R7 완결, 범위 축소)
- 검증 일자: 2026-08-04 (Asia/Seoul)
- 워크트리: `C:/dev/Samhan-Public/.claude/worktrees/t1062`
- 브랜치: `fix/1062-line-input-ux`
- 시작 HEAD: `68b23222a213387a876293a9d08eaf296f2297a0`
- 제약: `git add`/commit/push 금지, 지정 QA 로그 변경 금지, Docker 조작 금지, 견적·이동·분개·모달·리팩터링 범위 금지

## 채택한 최소 설계

R7이 새로 연 표면만 되돌린다. `SlipDetailPage`에서는 `productId`가 없는 trailing 미확정 빈행에만 `ProductAutocomplete`를 렌더하고 기존 확정행은 품목 선택 조작이 없는 표시 셀로 바꾼다. 협업 재시드는 직전 서버 ID 집합과 현재 서버 ID 집합을 함께 사용해 삭제된 확정행과 현재 ID 중복을 먼저 제거한 뒤, 남은 legacy 미확정 행만 누락된 현재 서버 ID에 매핑한다. 빈행은 stale 판정·ID 소비·payload에서 계속 제외하며 `SlipFormPage`와 타 도메인은 변경하지 않는다.

## RED-first 원문

### RED-A1 — 기존 확정행에서 품목 교체 조작이 불가능하다

R8 원문: `모든 행에 ProductAutocomplete를 조건 없이 렌더`하여 기존 확정행에도 선택기가 열렸다. 기존행 품목을 교체하면 `productId, productName, modelName, specification`만 바뀌고 `sellingPrice`, 수량, 단가, 공급가액, 부가세, 합계는 이전 품목 값을 유지했다.

### RED-A2 — 서버 라인 삭제 후 재시드에서 lineId가 중복 부착되지 않는다

R8 원문: 서버 현재 ID가 `[B]`일 때 재시드 결과가 `[B, B, client-blank]`가 되었고 `staleAfter=false`로 오인되어 저장 시 `400 INVALID_INPUT`이 발생했다.

### RED-A3 — 삭제된 행이 신규행으로 부활하지 않는다

R8 원문: 1라인 문서에서 서버 ID 배열이 비면 삭제된 옛 행이 익명 신규행으로 강등되지만 `productId`는 남아, 저장 payload에 다시 실렸다.

### RED-B1 — 빈행 품목 확정 → 저장 → 재열기 경로가 여전히 동작한다

R8 원문: 빈행 품목 확정 뒤 확정 신규라인은 payload 대상에 남고 저장 후 재열기 계약을 유지해야 한다.

### RED-B2 — 미확정 빈행은 여전히 payload에서 제외된다

R8 원문: `persistedDetailLines`는 `productId.trim()`으로 분기하며 미확정 trailing 빈행은 저장 payload에서 제외된다.

## 조사 중

구현 전 근본 원인·접근·테스트 대상을 확인한다. 아래 절은 조사와 검증 결과를 append한다.

## 근본 원인과 범위 근거

`git show 68b23222a^:clients/desktop/src/renderer/routes/SlipDetailPage.tsx | rg -n "ProductAutocomplete|product autocomplete"`의 출력은 `(none)`이었다. R7 커밋에서 `ProductAutocomplete` import·렌더·`applySalesProductSelection`이 새로 추가됐으므로 기존 확정행 교체는 이 화면의 원래 기능이 아니라 R7이 만든 표면이다. D2는 R7이 빈행 stale 오염만 제외하고 삭제된 확정행 제거를 하지 않아 위치 재시드가 남은 행에 중복 ID를 부착한 것이 근본 원인이다.

## RED 실행 원문

명령:

```text
npm exec vitest run src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx -t R9
```

R7 구현에 테스트를 먼저 추가한 결과:

```text
Test Files 1 failed | 1 passed (2)
Tests 4 failed | 110 passed (114)
R9 RED-A1: 기존 확정행에는 품목 선택기를 렌더하지 않는다 — failed
R9 RED-A2: 서버에서 삭제된 확정행을 제거한 뒤 남은 행에 lineId를 중복 부착하지 않는다 — expected [B, ''] / received [B, B, client-blank]
R9 RED-A3: 1라인 서버 삭제는 삭제행을 신규행으로 부활시키지 않는다 — received deleted productId
R9 조합: 2라인 이상에서 중간 라인을 삭제해도 앞뒤 서버 행만 남는다 — failed
```

## 변경 및 동시 GREEN

- `coeditLineIdsAreStale`: 확정행의 현재 서버 lineId 중복도 stale로 판정한다. 빈행은 기존처럼 제외한다.
- `reseedCoeditLineIds`: SlipDetailPage에서 직전 서버 ID 집합을 전달한다. 직전에는 있었지만 현재 서버에 없는 행과 중복 현재 ID를 먼저 제거하고, 초과 legacy 행을 제거한 뒤 누락 ID만 남은 legacy 확정행에 부착한다. 빈행은 건드리지 않는다. 기존 EstimateFormPage 호출은 세 번째 인자를 생략해 기존 legacy 재시드 계약을 보존한다.
- `SlipDetailPage`: `const canSelectProduct = !line.productId?.trim()` 조건으로 미확정 빈행에만 ProductAutocomplete를 렌더하고, 확정행은 품목명 표시 셀로 렌더한다. `persistedDetailLines`, SlipFormPage, 모달 계약은 변경하지 않았다.
- R9 Playwright mock: 확정행 combobox 0개, trailing 빈행 combobox 1개, 빈행 확정 뒤에도 combobox 1개를 검증하도록 기존 R7 테스트 단정을 좁혔다.

최종 관련 Vitest:

```text
npm exec vitest run src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx src/renderer/realtime/createCoeditProvider.test.ts src/renderer/routes/SlipDetailPage.partner-required.test.tsx src/renderer/routes/SlipFormPage.test.tsx
Test Files 4 passed (4)
Tests 198 passed (198)
```

최종 Playwright mock:

```text
npm exec playwright test playwright/1062-line-input-ux/1062-line-input-ux.spec.ts
Running 3 tests using 1 worker
3 passed (7.1s)
```

최종 타입체크:

```text
npm run typecheck
Exit code: 0
tsc -p tsconfig.node.json --noEmit — passed
tsc -p tsconfig.web.json --noEmit — passed
typecheck:real-qa — 50 tests passed, 0 failed
```

관련 Vitest에는 기존 React Router Future Flag warning 2건이 stderr에 있었으나 테스트 실패는 없었다. 지정된 `renderer-real-qa*.log` 파일은 읽기·수정하지 않았다.

## 새 조합 열거와 결과

| 조합 | 결과 |
|---|---|
| 빈행에 품목 확정 → 저장 → 재열기 | GREEN. 확정행은 `productId`가 있어 payload에 남고, trailing 빈행은 유지된다. Playwright 3/3 및 Vitest 계약 통과. |
| 빈행에 품목 확정 → 다시 해제 | GREEN. `applySalesProductSelection(null)`/빈행 commit 경로가 품목 필드를 비우며 `persistedDetailLines`에서 제외된다. 기존 Vitest `payload 제외` 통과. |
| 협업 중 상대가 확정행 삭제 + 내가 빈행 확정 | GREEN. 직전 삭제 ID는 reseed에서 제거되고 빈행은 서버 ID를 소비하지 않는다. 생존 ID 중복 없음, 빈행은 payload 제외. |
| 2라인 이상 전표에서 중간 라인 삭제 | GREEN. 앞·뒤 서버 행과 trailing 빈행만 남고 삭제된 중간 행은 부활하지 않는다. R9 Vitest 통과. |
| 기존 확정행에 품목 선택 시도 | GREEN. 확정행은 ProductAutocomplete를 렌더하지 않아 조작 불가. R7 부모 파일에는 해당 사용처가 없었음. |
| 신규 작성 `/sales/slips/new` | GREEN. SlipFormPage 관련 58 tests 통과, 소스 변경 없음. |

## 종료조건 2 — 참조 전수 명령·출력 원문

명령:

```text
rg -n --hidden --glob '!docs/qa/1062-line-input-real-qa/renderer-real-qa*.log' --glob '!node_modules/**' --glob '!dist/**' "coeditLineIdsAreStale|reseedCoeditLineIds|replaceItems|persistedDetailLines|ProductAutocomplete" .
```

핵심 소비처 출력:

```text
coeditLineIdsAreStale
clients/desktop/src/renderer/realtime/coeditLineIds.ts:86
clients/desktop/src/renderer/routes/SlipDetailPage.tsx:1883
clients/desktop/src/renderer/routes/EstimateFormPage.tsx:887
clients/desktop/src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx:34,547,639,651,688

reseedCoeditLineIds
clients/desktop/src/renderer/realtime/coeditLineIds.ts:121
clients/desktop/src/renderer/routes/SlipDetailPage.tsx:1885-1889
clients/desktop/src/renderer/routes/EstimateFormPage.tsx:891-892
clients/desktop/src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx:35,548,640,662,679

persistedDetailLines
clients/desktop/src/renderer/routes/SlipDetailPage.tsx:512,2456,2487
clients/desktop/src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx:27,484-485,567,586,600,605

ProductAutocomplete
clients/desktop/src/renderer/routes/SlipDetailPage.tsx:44,2652 (R9 조건부 빈행 전용)
clients/desktop/src/renderer/routes/SlipFormPage.tsx:39,1642,1720 (신규 작성, 미변경)
clients/desktop/src/renderer/routes/EstimateItemsCatalogPage.tsx:46,894 (견적, 미변경)
clients/desktop/src/renderer/routes/SafetyStockAlertsPage.tsx:36,292 (안전재고, 미변경)
clients/desktop/src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx:503,509
clients/desktop/playwright/1062-line-input-ux/1062-line-input-ux.spec.ts:4,65
```

`replaceItems`의 공용 구현(`createCoeditProvider.ts:733`)과 테스트, Estimate/SalesPartnerOrder/CashReceipt 소비처도 전수 확인했으며 R9에서는 수정하지 않았다. 견적·이동·분개 경로는 변경 파일·호출부가 없다.

## 변경 파일과 신규 파일

이번 R9 변경 파일:

```text
clients/desktop/src/renderer/realtime/coeditLineIds.ts
clients/desktop/src/renderer/routes/SlipDetailPage.tsx
clients/desktop/src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx
clients/desktop/playwright/1062-line-input-ux/1062-line-input-ux.spec.ts
```

신규 파일:

```text
docs/dev-reports/2026-08-04-1062-r9-scope-narrowing-fix.md
```

기존 워크트리 잔여 신규 파일 `docs/dev-reports/2026-08-04-1062-r8-sol-reconvergence.md`와 기존 수정 상태인 `docs/qa/1062-line-input-real-qa/renderer-real-qa.err.log`, `renderer-real-qa.log`는 R9 변경이 아니며 건드리지 않았다.

## 최종 상태

`git diff --check`는 출력 없이 통과했다. 커밋·add·push는 실행하지 않았다. R9의 D1/D2와 자기 표면 조합은 GREEN이며, 머지 판단은 PM 범위다.
