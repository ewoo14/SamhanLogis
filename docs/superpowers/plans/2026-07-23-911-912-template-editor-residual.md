# PR #914 결재 문서 양식 편집기 잔여 묶음 구현 계획

> **For agentic workers:** 이 계획은 `superpowers:test-driven-development`와 `superpowers:verification-before-completion` 규칙에 따라 RED 원문을 먼저 확보하고 단계별로 실행한다.

**목표:** 결재 문서 양식 편집기의 좌표 기본값, 본문 FIELD 참조, 넓은 미리보기 인쇄 겹침을 실제 사용자 경로에서 해결한다.

**구조:** 좌표 입력은 저장된 geometry가 없을 때 빈 값으로 표시한다. 본문 필드는 렌더 모델에 key를 보존하고 양식 유형별 API 필드 목록을 선택지로 주입한다. 좌표 밴드는 화면용 측정과 A4 인쇄용 측정을 분리해 인쇄 폭에서 spacer를 계산한다.

**기술:** React/TypeScript, Vitest, Testing Library, Playwright, 실서버 groupware API, Chromium page.pdf.

## 전역 제약

- 모든 보고·주석·문서 문구는 한국어로 작성한다.
- 기존 공유 실 템플릿은 수정·삭제하지 않는다.
- 실 결재문서 renderer 경로는 변경하지 않고 700/1024/1600/2560px 대조군으로 회귀 확인한다.
- 인쇄 검증은 화면 viewport가 아니라 A4 210mm(약 793.7px) 레이아웃 폭을 사용한다.
- Git 쓰기 명령은 실행하지 않는다.

### 작업 1: 좌표 패널 RED/GREEN

- 수정: `clients/desktop/src/renderer/components/documentTemplate/ElementInspector.tsx`
- 테스트: `clients/desktop/src/renderer/components/documentTemplate/ElementInspector.test.tsx`
- geometry 없는 요소의 x/y/w/h가 빈 값인지, 입력 이벤트가 geometry를 생성하는지 확인한다.
- 최소 수정 후 단위 테스트와 mock Playwright A 경로를 실행한다.

### 작업 2: FIELD key projection과 선택 UI RED/GREEN

- 수정: `approvalRenderModel.ts`, `approvalDoc.ts` 관련 기대값, `templateSchema.ts`, `DocumentRenderer.tsx`, `ElementInspector.tsx`, `DocumentTemplateEditorPage.tsx`, `documentTemplateEditor.css`
- 테스트: `DocumentRenderer.test.tsx`, `templateSchema.test.ts`, `ElementInspector.test.tsx`
- `ApprovalRenderFieldRow.key`를 보존하고 renderer는 key를 우선 비교한다.
- 양식 유형과 일치하는 `/admin/groupware/approval-templates` 필드를 선택지로 노출한다.
- 미존재 binding은 선택지와 출력에서 조용한 빈칸 대신 오류 상태를 표시한다.

### 작업 3: A4 인쇄 폭 기반 spacer RED/GREEN

- 수정: `clients/desktop/src/renderer/print/DocumentRenderer.tsx` 및 필요한 editor CSS
- 테스트: `clients/desktop/playwright/911-912-template-editor-residual-real-qa/` 아래 라이브 스펙
- 화면 폭과 A4 고정 폭을 각각 측정하고 print spacer를 A4 초과분으로 계산한다.
- 1920/2560px에서 화면 상태 즉시 인쇄와 media 정착 후 인쇄를 모두 측정한다.

### 작업 4: 검증 및 보고

- `vitest`, typecheck, mock 전체 617개, 라이브 Playwright, page.pdf, 12개 반응형 폭과 1920/2560 폭을 실행한다.
- 단계별 스크린샷은 `docs/qa/914-luna-impl-2026-07-23/`에 저장한다.
- RED 원문·뮤테이션 RED·재생성 스크린샷 목록·#913/#890 미착수 항목을 한국어로 기록한다.
