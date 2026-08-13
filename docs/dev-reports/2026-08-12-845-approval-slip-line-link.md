# #845 / PR #1158 — 결재문서 출고전표 참조 품목 연결

## 2026-08-12 Codex 구현 라운드

### 시작 측정 — rebase

실행 명령:

```powershell
git rebase origin/main
```

원문 출력:

```text
Rebasing (1/2)
Rebasing (2/2)
Successfully rebased and updated refs/heads/feat/845-ds-next-slice.
```

충돌은 없었다. 정찰 정본의 좌표 `refDocType/refDocNo`와 `SlipDetail.lines`가 현재 코드에도 존재함을 확인했다. 신규 DB 컬럼·DS-4 활성화 게이트 변경은 범위에서 제외한다.

### RED — 참조 출고전표 품목 미표시 재현 테스트

추가한 테스트:

```text
clients/desktop/src/renderer/print/approvalSlipLineLink.test.ts
```

핵심 기대 동작은 `SlipDetail.lines`의 품목명·모델명·규격·수량·공급가액·부가세·합계·비고를 UUID 없는 인쇄 projection으로 변환하는 것이다.

실행 명령 1:

```powershell
npm test -- --run src/renderer/print/approvalSlipLineLink.test.ts
```

원문 출력:

```text
> @samhan/desktop@0.1.0 pretest
> node scripts/actor-display-boundary.test.cjs && node scripts/real-qa-scope.cjs --phase=test

MUTATION_RED clients\\desktop\\src\\renderer\\.actor-display-mutation\\NewActorExit.tsx: unable to parse source: Cannot find module 'C:\\dev\\Samhan-Public\\.claude\\worktrees\\w1158\\clients\\desktop\\node_modules\\@typescript-eslint\\parser\\dist\\index.js'
...
✖ all actor display reads are resolver-bound
✖ a newly added raw display exit is rejected (mutation RED)
✖ a resolver-backed renderer is accepted
```

실행 명령 2 (pretest 우회):

```powershell
npx vitest run src/renderer/print/approvalSlipLineLink.test.ts
```

원문 출력:

```text
vitest.config.ts (1:407) [UNRESOLVED_IMPORT] Could not resolve 'vitest/config' in vitest.config.ts
...
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'vitest'
```

위 두 실행은 기능 테스트의 assertion까지 도달하지 못했다. 따라서 RED 원문은 “기능 실패”가 아니라 현재 worktree의 데스크톱 의존성 미설치/불완전으로 인한 실행 차단임을 명시한다. production code는 아직 추가하지 않았다.

의존성을 기존 `clients/desktop/package.json` 기준으로 lockfile 변경 없이 설치한 뒤 RED를 다시 실행했다.

실행 명령 3:

```powershell
npx vitest run src/renderer/print/approvalSlipLineLink.test.ts
```

원문 출력:

```text
 RUN  v2.1.9 C:/dev/Samhan-Public/.claude/worktrees/w1158/clients/desktop

 ❯ src/renderer/print/approvalSlipLineLink.test.ts (1 test | 1 failed) 3ms
   × 결재문서 출고전표 참조 품목 연결 > 참조 출고전표의 SlipDetail.lines를 인쇄 품목 행으로 보여준다 3ms
     → projectSlipLineItems is not a function

 Test Files  1 failed (1)
      Tests  1 failed (1)
```

테스트가 기능 부재를 정확히 가리키는 RED가 됐다. 실패 원인은 오타나 러너 오류가 아니라 아직 존재하지 않는 production projection 함수다.

### GREEN 및 중간 검증

추가 구현:

```text
clients/desktop/src/renderer/api/slip.ts
clients/desktop/src/renderer/print/approvalSlipLineItems.ts
clients/desktop/src/renderer/print/approvalRenderModel.ts
clients/desktop/src/renderer/print/ApprovalDocView.tsx
```

동작 원칙:

- 기존 `refDocType=OUTBOUND_SLIP/refDocNo`만 읽는다.
- 검색 결과의 날짜와 기존 `/slips/query` exact `slipNo` 결과로 내부 id를 해석한 뒤 기존 `/slips/{id}` 상세를 호출한다.
- `SlipDetail.lines`는 UUID 없는 인쇄 projection으로만 전달한다.
- 참조 없음·조회 실패·권한 거부는 `null`/`UNAVAILABLE`로 수렴하며 결재문서 렌더 자체를 막지 않는다.
- DS-4 활성화 게이트, DB 스키마, 기존 전표/결재 화면은 변경하지 않는다.

실행 명령:

```powershell
npx vitest run src/renderer/print/approvalSlipLineLink.test.ts src/renderer/print/DocumentRenderer.test.tsx
```

원문 출력:

```text
✓ approvalSlipLineLink.test.ts (1 test)
✓ DocumentRenderer.test.tsx (19 tests)
Test Files 2 passed (2)
Tests 20 passed (20)
```

추가 예외/회귀 테스트 후:

```powershell
npx vitest run src/renderer/print/approvalSlipLineLink.test.ts src/renderer/print/ApprovalDocView.real-render.test.tsx
```

원문 출력:

```text
✓ approvalSlipLineLink.test.ts (4 tests)
✓ ApprovalDocView.real-render.test.tsx (8 tests)
Test Files 2 passed (2)
Tests 12 passed (12)
```

처음에는 기존 real-render 테스트가 요구하는 `UNAVAILABLE` 배너 대신 참조 없음에서 `CONNECTED` 빈 배열을 사용해 1건 실패했다. `loadApprovalSlipLineItems`의 참조 없음 결과를 `null`로 바꾸고 재실행해 통과시켰다. 중간 실행에서 React Query가 undefined query data 경고를 냈으나 최종 구현에서는 `null`을 반환해 제거했다.

desktop 전량 typecheck:

```powershell
npm run typecheck
```

원문 출력:

```text
[로컬 파생물 신선도] typecheck 대상 확인 완료
src/renderer/print/PartnerLedgerView.tsx(252,61): error TS2550: Property 'at' does not exist
src/renderer/routes/PartnerLedgerPage.tsx(896,79): error TS2550: Property 'at' does not exist
src/renderer/routes/PartnerLedgerPage.tsx(897,61): error TS2550: Property 'at' does not exist
src/renderer/routes/PartnerLedgerPage.tsx(916,58): error TS2550: Property 'at' does not exist
src/renderer/routes/warehouse/inoutAnalysisModel.ts(89,29): error TS2550: Property 'at' does not exist
src/renderer/routes/warehouse/inoutAnalysisModel.ts(151,22): error TS2550: Property 'at' does not exist
```

이번 변경 파일에 대한 type error는 없었다. 전체 typecheck는 기존 6개 오류 때문에 실패했다.

### 전량 테스트 및 인쇄/미리보기 회귀

초기 전량 테스트는 Electron 설치 산출물 오류로 1건 실패했다:

```text
Error: Electron failed to install correctly, please delete node_modules/electron and try installing again
```

기존 `clients/desktop/package.json` 버전의 Electron 설치 산출물을 복구한 뒤 동일 전량 테스트를 재실행했다.

실행 명령:

```powershell
npm test
```

원문 결과 요약:

```text
MUTATION_RED ...
✔ all actor display reads are resolver-bound
✔ a newly added raw display exit is rejected (mutation RED)
✔ the eight adversarial raw actor exits are all rejected (mutation RED)
✔ a newly added raw API display exit is rejected (mutation RED)
✔ a resolver-backed renderer is accepted
```

Vitest 전량은 exit code `0`으로 종료했다. 상세 출력에는 테스트 파일별 녹색 결과만 있었고 실패 항목은 없었다.

독립 인쇄/미리보기 회귀 실행:

```powershell
npx vitest run src/renderer/print/approvalSlipLineLink.test.ts src/renderer/print/ApprovalDocView.test.tsx src/renderer/print/ApprovalDocView.real-render.test.tsx src/renderer/print/approvalRenderGolden.test.tsx src/renderer/print/documentTemplateEditorPreview.test.tsx
```

원문 결과:

```text
ApprovalDocView.test.tsx (29 tests) passed
ApprovalDocView.real-render.test.tsx (8 tests) passed
approvalRenderGolden.test.tsx (19 tests) passed
documentTemplateEditorPreview.test.tsx (13 tests) passed
approvalSlipLineLink.test.ts (4 tests) passed
```

초기 전체 build도 수행했다.

```powershell
npm run build
```

원문 결과:

```text
out/main/index.js built
out/preload/index.cjs built
renderer built — 741 modules transformed
Process exited with code 0
```

### 실데이터 건수 및 라운드 종료 확인

정찰에서 확인된 실데이터 건수는 결재 70건 중 `OUTBOUND_SLIP` 참조 5건, `JOURNAL` 참조 2건, 참조 없는 결재 64건이다. 저장형 레이아웃 pin은 0건이다. 이 슬라이스는 참조 없음/끊김을 `UNAVAILABLE`로 수렴하므로 64건 및 끊긴 참조가 결재문서를 막지 않는 경로를 테스트로 확인했다. 실 DB는 쓰지 않았다.

마이그레이션은 추가하지 않았다. 파일명·DB 적용분·다른 브랜치 미머지분 모두 `0`이다.

추적 파일 존재 확인(첫 검사에서 해당 파일이 없음을 발견해 본체 worktree의 동일 원문을 확인하고 복원):

```text
tools/.s24-build-only/build/deep/tracked-writer.mjs = present after restoration
MISSING_TRACKED_FILES=0
```

첫 검사 시 `tools/.s24-build-only/build/deep/tracked-writer.mjs`가 삭제된 상태였고, 동일 원문(`const OUT = 'docs/qa/.s24-build-only.png'`)으로 복원했다. 최종 전체 추적 경로 대조는 `MISSING_TRACKED_FILES=0`이다. 공유 Docker 스택에는 쓰기를 수행하지 않았다.
