# 2026-08-04 #1062 R7 editable blank row fix

## 착수 기록

- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\t1062`
- `git rev-parse --show-toplevel`: `C:/dev/Samhan-Public/.claude/worktrees/t1062`
- 브랜치: `fix/1062-line-input-ux`
- 착수 HEAD: `b0479f4538e3e25d115d4fbd01ad422115e77460`
- 기존 사용자 변경: `docs/qa/1062-line-input-real-qa/renderer-real-qa.err.log`, `docs/qa/1062-line-input-real-qa/renderer-real-qa.log`
- 기존 미추적 보고서: `docs/dev-reports/2026-08-04-1062-r6-sol-final-review.md`

## RED 원문 — 구현 전

이번 라운드의 RED는 다음 네 불변식을 검증하는 테스트로 먼저 작성·실행한다.

- RED-A1: 수정 화면 빈행에서 품목을 확정하고 모델명·규격·수량·단가·적요를 입력해 저장하면 해당 라인이 저장된다.
- RED-A2: 협업 중 원격 삭제 후 진입·저장해도 서버 `lineId`는 원래 행에 유지된다.
- RED-B1: 미확정 빈행은 저장 payload에서 제외된다.
- RED-B2: 신규 작성 경로의 trailing 빈행 증식·최소행 보장은 변경 전과 동일하다.

### RED 실행 원문

명령:

```text
npx vitest run src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx -t 'R7 수정 화면' --reporter=verbose
```

원문 결과:

```text
Test Files  1 failed (1)
Tests       2 failed | 2 passed | 96 skipped (100)

× RED-A1: 매출 수정 표의 품목 셀은 ProductAutocomplete로 빈행 품목을 확정하고 저장 필드에 반영한다
  → expected source to match /<ProductAutocomplete[\s\S]*resultSelectionMode=\{null\}[\s\S]*onChange=/
× RED-A2: trailing 미확정 행의 client lineId는 협업 stale 판정과 재시드에 참여하지 않는다
  → expected true to be false
✓ RED-B1: 미확정 빈행은 품목·내용을 입력해도 저장 payload에서 제외된다
✓ RED-B2: 기존 저장 라인만 있는 hydrate도 마지막에 빈행 하나를 유지하는 기존 계약을 보존한다
```

RED-A1/A2는 수정 전 결함을 재현했고, RED-B1/B2는 R4·R5 불변식 회귀 가드로 기존 GREEN임을 확인했다.

## 동시 GREEN — 핵심 계약

명령:

```text
npx vitest run src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx -t 'R7 수정 화면' --reporter=verbose
```

원문 결과:

```text
Test Files  1 passed (1)
Tests       4 passed | 96 skipped (100)

✓ RED-A1 ProductAutocomplete 품목 확정·payload 반영
✓ RED-A2 trailing 미확정 행 stale/reseed 제외
✓ RED-B1 미확정 빈행 payload 제외
✓ RED-B2 기존 trailing 빈행·최소행 보장
```

## 새 조합 열거 및 결과

- 품목만 고르고 수량을 입력하지 않음: 품목이 확정되므로 `persistedDetailLines`에는 남고 payload의 `quantity=0`으로 명시된다. 조용히 유실되지 않는다. Vitest로 검증.
- 품목을 골랐다가 다시 지움: `ProductAutocomplete.onInputCommitChange(false)`가 확정값을 비우고 `productId=''`로 되돌리며, 저장 payload에서는 제외된다. Vitest 계약으로 검증.
- 협업 중 상대가 내가 고르는 중인 미확정 행을 삭제: trailing 행의 client lineId는 stale 판정·reseed에 참여하지 않으며, 삭제 뒤 서버 3개 라인의 lineId가 `[SERVER_LINE_1, SERVER_LINE_2, SERVER_LINE_3]`로 유지된다. Vitest로 검증.
- 품목 확정: 기존 design-system `ProductAutocomplete`가 `productId/productName/modelName/specification`을 함께 기록하고, 매출 수정 표에 다음 trailing 빈행을 추가한다. Chromium mock으로 검증.
- 품목 확정 후 자동완성 후보 표시: 판매전표는 `resultSelectionMode={null}`이므로 별도 검색 결과 모달이 열리지 않고 inline listbox만 표시된다. Chromium mock으로 검증.

## 참조 전수 조사

명령:

```text
rg -n "persistedDetailLines|filterMeaningfulRows|coeditLineIdsAreStale|reseedCoeditLineIds|replaceItems" clients/desktop/src/renderer
```

조사 결과: `SlipDetailPage.tsx`, `SlipDetailPage.lineIdContract.test.tsx`, `autoBlankRow.ts`, `autoBlankRow.test.ts`, `coeditLineIds.ts`, `createCoeditProvider.ts/.test.ts`, `EstimateFormPage.tsx/.coedit.test.tsx`, `JournalFormPage.tsx`, `SalesPartnerOrderDetailPage.tsx/.coedit.test.tsx`, `CollaborativeSlipInput.test.tsx`의 모든 참조를 확인했다. 이번 변경은 판매전표 상세의 `persistedDetailLines` 경로와 공용 coedit lineId 판정/reseed만 수정했으며 견적·분개·이동 경로의 저장 규약은 변경하지 않았다.

## 종료조건 명령·출력 원문

### 관련 Vitest

```text
npx vitest run src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx src/renderer/realtime/createCoeditProvider.test.ts src/renderer/utils/autoBlankRow.test.ts src/renderer/routes/SlipFormPage.test.tsx --reporter=dot

Test Files  4 passed (4)
Tests       196 passed (196)
```

### TypeScript 및 real-QA scope guard

```text
npm run typecheck

Exit code: 0
tsconfig.node.ts + tsconfig.web.ts 통과
typecheck:real-qa — 2 passed
real-QA scope test — 50 passed, 0 failed
```

실행 중 기존 로컬 미추적 real-QA 스펙 `n1b-native-qa/r2fix-untracked-only-real-qa.spec.ts` 경고가 출력됐으나, 하네스가 로컬 실행 모드로 허용했고 typecheck 자체는 통과했다. 해당 파일은 이번 변경 대상이 아니다.

### Playwright mock Chromium

```text
npx playwright test playwright/1062-line-input-ux/1062-line-input-ux.spec.ts --reporter=line

Running 3 tests using 1 worker
3 passed (6.5s)
```

## 변경 파일

수정:

- `clients/desktop/src/renderer/routes/SlipDetailPage.tsx`
- `clients/desktop/src/renderer/realtime/coeditLineIds.ts`
- `clients/desktop/src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx`
- `clients/desktop/playwright/1062-line-input-ux/1062-line-input-ux.spec.ts`

신규:

- `docs/dev-reports/2026-08-04-1062-r7-editable-blank-row-fix.md`

기존 사용자 변경으로 보존한 파일:

- `docs/qa/1062-line-input-real-qa/renderer-real-qa.err.log`
- `docs/qa/1062-line-input-real-qa/renderer-real-qa.log`
- `docs/dev-reports/2026-08-04-1062-r6-sol-final-review.md`
