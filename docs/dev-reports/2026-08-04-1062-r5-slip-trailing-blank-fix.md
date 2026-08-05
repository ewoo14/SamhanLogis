# 2026-08-04 R5 판매전표 수정 모드 trailing blank fix

## 시작 기록

- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\t1062`
- 브랜치: `fix/1062-line-input-ux`
- 시작 HEAD: `a69f28bf305c074cbf477f5d309c7676b9dbe42b`
- 작업 범위: 판매전표 수정 모드의 맨 아래 빈행 유지와 저장 시 빈행 제거

## RED-A 원문

명령: `npm exec vitest run src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx`

출력:

```text
FAIL src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx (96 tests | 2 failed)
× RED-A: 수정 hydrate 후 맨 아래 빈행이 있고, 빈행 확정 시 그 아래에 다시 빈행을 둔다
  → expected [ { …(17) } ] to have a length of 2 but got 1
× RED-B: 빈행만 남겨 저장해도 payload에는 빈행이 없고, 신규 증식·최소 1행 계약은 유지한다
  → persistedDetailLines is not a function
94 passed, 2 failed
```

## RED-B 원문

위 동일 실행에서 RED-A·RED-B가 동시에 실패했다.

## 변경 파일

### 기존 파일

- `clients/desktop/src/renderer/routes/SlipDetailPage.tsx`
  - 판매전표 수정 hydrate/coedit 반영에 `ensureTrailingBlankRow` 배선
  - `persistedDetailLines`로 품목코드 미확정 행 저장 제외
  - 판매 수정 행 삭제 시 `removeLinePreservingMinimum`으로 최소 1행 보장
- `clients/desktop/src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx`
  - RED-A·RED-B 회귀 테스트 및 빈 전표/전체 삭제 조합 검증 추가

### 신규 파일

- `docs/dev-reports/2026-08-04-1062-r5-slip-trailing-blank-fix.md`

## 종료조건 3종

### 1. 새 조합 열거 및 실행

| 모드 × 라인 수 × 확정 여부 | 실행 결과 |
|---|---|
| 수정 × 0 × 없음 | `toPurchaseEditLines({ lines: [] })` → 빈행 1개 |
| 수정 × 1+ × 모두 확정 | hydrate 후 확정행 아래 빈행 1개 |
| 수정 × 1+ × 마지막 미확정 | trailing 빈행 유지, 추가 증식 없음 |
| 수정 × 전체 삭제 | `removeLinePreservingMinimum` → 빈행 1개 |
| 수정 × 빈행만 남김 × 저장 | `persistedDetailLines([blank])` → `[]`, 저장 버튼 비활성 계약 |
| 신규 작성 × 5행 × 마지막 변경 | 기존 `appendBlankRowIfLastChanged`로 1행만 증식 |
| 신규 작성 × 1행 × 삭제 | 기존 `removeLinePreservingMinimum`으로 빈행 1개 유지 |

실행 명령:

```text
npm exec vitest run src/renderer/utils/autoBlankRow.test.ts src/renderer/routes/SlipFormPage.test.tsx src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx src/renderer/routes/SlipDetailPage.partner-required.test.tsx
```

출력 원문:

```text
Test Files  4 passed (4)
Tests       164 passed (164)
```

### 2. 참조 전수

`rg -n "ensureTrailingBlankRow|appendBlankRowIfLastChanged|removeLinePreservingMinimum|filterMeaningfulRows" clients/desktop/src/renderer --glob '*.ts' --glob '*.tsx'` 실행 결과 판매전표 조합은 다음과 같다.

- `SlipFormPage`: `appendBlankRowIfLastChanged`(신규 입력 마지막행 증식), `removeLinePreservingMinimum`(최소 1행). 수정 hydrate/save 유틸은 사용하지 않는 기존 신규 작성 경로다.
- `SlipDetailPage` 판매 수정: `ensureTrailingBlankRow`(REST hydrate 및 coedit 반영), `filterMeaningfulRows`를 감싼 `persistedDetailLines`(저장 payload), `removeLinePreservingMinimum`(행 삭제).
- `EstimateFormPage`: 네 함수 중 `appendBlankRowIfLastChanged`, `ensureTrailingBlankRow`, `removeLinePreservingMinimum` 사용. 변경하지 않았다.
- `JournalFormPage`: 네 함수 모두 사용. 변경하지 않았다.
- `TransferFormPage`: `appendBlankRowIfLastChanged`만 사용. 변경하지 않았다.
- `autoBlankRow.ts`·`autoBlankRow.test.ts`: 네 함수 정의/공통 계약 테스트.

### 3. 영향 테스트·타입·Playwright

```text
npm run typecheck
Exit code: 0

npm exec vitest run src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx
Test Files  1 passed (1)
Tests       96 passed (96)

.\node_modules\.bin\playwright.cmd test playwright/1062-line-input-ux/1062-line-input-ux.spec.ts --reporter=line
Running 2 tests using 1 worker
2 passed (5.9s)
```

전체 `npm test`도 시도했으나, 변경과 무관한 저장소 산출물 가드가 `out/main/index.js` 부재로 1건 실패했다. `REAL_QA_SKIP_FRESHNESS_CHECK=1 npm test`에서도 해당 동일 1건만 실패했으며 나머지 테스트는 통과했다. 빌드 산출물 생성은 이번 라운드의 금지 범위(빌드/Docker 조작)라 실행하지 않았다.

## 동시 GREEN 원문

명령: `npm exec vitest run src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx`

출력 원문:

```text
✓ src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx (96 tests) 50ms
Test Files  1 passed (1)
Tests       96 passed (96)
```

RED-A·RED-B가 같은 실행에서 동시에 실패한 뒤, 동일 테스트 파일이 동시에 GREEN이 됐다.

## 최종 작업 상태

- 워크트리: `C:/dev/Samhan-Public/.claude/worktrees/t1062`
- HEAD: `a69f28bf305c074cbf477f5d309c7676b9dbe42b` (변경 없음)
- 신규 파일: 본 보고서 1개
- `git diff --check`: 통과
- `git add`/`commit`/`push`: 실행하지 않음
