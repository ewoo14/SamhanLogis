# R15 draft isolation complete

## ① 작업 시작 상태

- 작업 디렉터리: `C:\dev\Samhan-Public\.claude\worktrees\t1062`
- 루트 확인: `C:/dev/Samhan-Public/.claude/worktrees/t1062`
- 브랜치: `fix/1062-line-input-ux`
- 시작 HEAD: `3ed4aaa45741b655d9809276c789063c5d733dea`
- 작업 범위: R12 미완 부분인 draft 필드 격리와 확정행 삭제의 Y.Doc 양방향 반영
- 금지 범위: BE, 견적/이동/분개, 모달, Docker, 지정 QA 로그

## ② Y.Doc write 경로 전수 목록과 draft 처리

조사 명령:

```text
rg -n "setItemValue(?:ById)?\(|addItem\(|replaceItems\(|items\.push|items\.delete" clients/desktop/src/renderer --glob '*.{ts,tsx}'
```

전수 결과:

| 경로 | 역할 | draft 처리 |
|---|---|---|
| `realtime/createCoeditProvider.ts:723` `addItem` | 신규 확정 라인 생성 | 호출자가 확정 경계에서만 호출. 반환 lineId를 로컬 행에 귀속 |
| `realtime/createCoeditProvider.ts:733` `replaceItems` | 서버 seed/재수렴 | `persistedDetailLines`가 품목 확정행만 전달; trailing draft 제외 |
| `realtime/createCoeditProvider.ts:706` `setItemValue` | index 셀 write | 기존 Y.Array 행에만 사용. 입력 공통 경계가 배열 밖 index를 차단 |
| `realtime/createCoeditProvider.ts:708` `setItemValueById` | 안정 lineId 셀 write | lineId 미존재 시 no-op. draft는 lineId가 없어 통과하지 않음 |
| `components/collab/CollaborativeSlipInput.tsx:31` `setProviderValue` | 모든 `CollaborativeSlipInput` 필드 단위 write | **R15 수정:** 숫자 index가 `provider.items.length` 이상이면 no-op. 규격·수량·단가·공급가액·부가세·적요 등 공통 경로 전체 적용 |
| `routes/SlipDetailPage.tsx:1100` `syncDetailAmountToDoc` | 확정행 수량/단가 파생 금액 동기화 | `preEditLine.lineId` 없으면 즉시 no-op |
| `routes/SlipDetailPage.tsx:2400` 가격 자동 보정 | 확정행 단가 갱신 | lineId 기반, 이번 변경 범위 밖; draft는 price refresh 대상 아님 |
| `routes/SlipDetailPage.tsx:430` `promoteSelectedProductToCoedit` | 품목 확정 승격 | **R15 수정:** trailing draft에서만 `addItem`, 네 필드 기록 후 생성 lineId 반환 |
| `routes/SlipDetailPage.tsx:4850` `removeSalesLine`/`removePurchaseLine` | 행 삭제 | lineId가 있으면 `removeItem`; R15 승격 lineId 귀속으로 신규 확정행도 양방향 삭제 |
| `realtime/coeditLineIds.ts:132` 재시드 | 레거시 lineId 보강 | 품목 없는 draft는 서버 ID를 소비하지 않고 건너뜀 |
| `routes/EstimateFormPage.tsx:1193,1359-1371` | 견적 협업 단가/품목 | 별도 문서·기존행 계약. R15 전표 draft 경계와 무관, 수정하지 않음 |
| `routes/SalesPartnerOrderDetailPage.tsx:1549` | 이동/파트너주문 협업 필드 | 별도 문서 계약. 수정하지 않음 |

핵심 누락은 `CollaborativeSlipInput`의 index write였다. 기존 `setItemValue`가 `ensureItemMap`으로 배열 밖 행을 생성해 D1을 만들었다.

## ③ RED 5개 원문

### RED-A1

원문 테스트:

```text
CollaborativeSlipInput.test.tsx
R15 RED-A1 draft 행의 규격·수량·단가·적요 입력은 Y.Doc 행을 생성하지 않는다
```

원인 수정 전 실행 원문:

```text
× CollaborativeSlipInput > R15 RED-A1 draft 행의 규격·수량·단가·적요 입력은 Y.Doc 행을 생성하지 않는다
→ expected 1 to be +0 // Object.is equality
```

### RED-A2

원문 테스트:

```text
SlipDetailPage.lineIdContract.test.tsx
R15 RED-A2 draft 품목 확정은 반환된 lineId로 삭제 가능한 협업 라인을 만든다
```

원인 수정 전 실행 원문:

```text
× SlipDetailPage — R12 빈행 로컬 draft 분리 (RED-first) > R15 RED-A2 draft 품목 확정은 반환된 lineId로 삭제 가능한 협업 라인을 만든다
→ promoteSelectedProductToCoedit is not a function
```

### RED-B1

원문 테스트:

```text
SlipDetailPage.lineIdContract.test.tsx
R12 조합: 빈행에 입력 중 상대가 저장해도 로컬 draft는 협업 라인 수를 바꾸지 않는다
```

원문 기대:

```text
provider.items.toArray() 는 기존 확정행 수만 유지
local trailing draft.productId 는 빈 문자열
```

### RED-B2

원문 테스트:

```text
SlipDetailPage.lineIdContract.test.tsx
R12 조합: 빈행 확정 직후 상대가 같은 위치에 라인을 추가해도 각 확정행이 보존된다
```

원문 기대:

```text
next.map(line => line.productId) === [PRODUCT_1, PRODUCT_2, PRODUCT_3]
```

### RED-B3

원문 테스트:

```text
SlipDetailPage.lineIdContract.test.tsx
R12 조합: 미확정 빈행은 품목·내용을 입력해도 저장 payload에서 제외된다
```

원문 기대:

```text
persistedDetailLines([...확정행, draft]) 의 길이 === 1
```

RED 묶음 실행 후 원인 수정 전 상태:

```text
2 failed, 127 passed (129 tests)
RED-A1: expected 1, received 0
RED-A2: promoteSelectedProductToCoedit is not a function
```

## ④ 새 조합 열거 및 결과

| 조합 | 실행 경로 | 결과 |
|---|---|---|
| draft에 필드만 입력 → 저장 → 재진입 | R15 RED-A1 + `persistedDetailLines` | 입력 시 Y.Doc items 길이 0. 저장 payload 제외. 재진입 시 서버 확정행만 복원되고 trailing 빈행 1개만 생성 |
| draft 확정 → 삭제 → 협업 필드 편집 | R15 RED-A2: 승격 lineId 반환 → `removeItem` → missing lineId write | 승격행이 Y.Doc에서 제거되고 이후 lineId write는 no-op; 부활하지 않음 |
| draft 확정 → 상대가 그 행 편집 → 내가 삭제 | 확정 lineId로 원격 수량/메모 write 후 동일 lineId remove | 상대 필드가 있어도 `removeItem(lineId)`가 행 전체를 제거. 이후 `setItemValueById`는 missing no-op |
| 기존행 삭제 → 새 draft에 재입력 → 저장 | 기존행 `removeItem` → 배열 밖 draft 필드 입력 → 품목 확정 승격 | 삭제된 기존행은 복귀하지 않고, 새 행은 품목 확정 순간에만 새 lineId로 1행 생성. draft 필드는 Y.Doc에 선기록되지 않음 |
| 두 사용자가 각자 draft를 갖고 동시에 확정 | 기존 R12 동시 확정 테스트 (`addItem` 2회) | 서로 다른 lineId 2개가 모두 보존되고 payload 2행 증가. trailing draft는 계속 문서 밖 |

## ⑤ 종료 조건 명령·출력 원문

### `npm run typecheck`

```text
> @samhan/desktop@0.1.0 typecheck
> node scripts/real-qa-scope.cjs --phase=typecheck && tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit && npm run typecheck:real-qa

[로컬 파생물 신선도] typecheck 대상 확인 완료
✔ real-QA 공식 수집 집합은 현재 Git 추적 집합과 이름 단위로 일치한다
ℹ tests 50
ℹ pass 50
ℹ fail 0
```

### 관련 Vitest

```text
npx vitest run src/renderer/components/collab/CollaborativeSlipInput.test.tsx src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx

✓ SlipDetailPage.lineIdContract.test.tsx (117 tests)
✓ CollaborativeSlipInput.test.tsx (12 tests)
Test Files 2 passed (2)
Tests 129 passed (129)
```

### Playwright mock — stale 5173 재사용 금지

```text
$env:CI='1'; npx playwright test playwright/1062-line-input-ux/1062-line-input-ux.spec.ts --config playwright.config.ts --reporter=line

Running 3 tests using 1 worker
3 passed (6.8s)
```

실행한 mock 세 항목은 품목 모달 UUID 비노출, trailing 빈행/확정 후 다음 빈행, 판매전표 수정 ProductAutocomplete 확정이다.

## ⑥ 동시 GREEN

두 결함의 최소 수정과 기존 RED-B 회귀가 동시에 GREEN이다.

- draft 필드 공통 write: 배열 밖 index no-op
- 품목 확정 승격: `addItem()` 반환 lineId를 로컬 행에 저장
- 확정행 삭제: 저장된 lineId로 Y.Doc `removeItem`
- RED-A1/A2/B1/B2/B3 및 기존 관련 129 Vitest GREEN
- 최종 관련 범위 재실행: 4 files / 161 tests GREEN (`coeditApi`, `createCoeditProvider`, `CollaborativeSlipInput`, `SlipDetailPage.lineIdContract`)
- `npm run typecheck` GREEN
- `CI=1` Playwright mock 3/3 GREEN

## 변경 파일 및 신규 파일

변경:

- `clients/desktop/src/renderer/components/collab/CollaborativeSlipInput.tsx`
- `clients/desktop/src/renderer/components/collab/CollaborativeSlipInput.test.tsx`
- `clients/desktop/src/renderer/routes/SlipDetailPage.tsx`
- `clients/desktop/src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx`

신규:

- `docs/dev-reports/2026-08-05-1062-r15-draft-isolation-complete.md`

지정 금지 로그 `docs/qa/1062-line-input-real-qa/renderer-real-qa*.log`는 작업하지 않았다(기존 워크트리 변경 상태만 보존).
