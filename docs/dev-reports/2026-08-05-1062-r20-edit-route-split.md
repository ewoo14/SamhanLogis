# #1062 R20 편집 라우트 분리 보고서

## 시작 기록

- 작업 디렉터리: `C:\dev\Samhan-Public\.claude\worktrees\t1062`
- `git rev-parse --show-toplevel`: `C:/dev/Samhan-Public/.claude/worktrees/t1062`
- 브랜치: `fix/1062-line-input-ux`
- 시작 HEAD: `bc3adf9639a81671b420afa323ea6495ecec20eb`
- 시작 시 기존 변경: `docs/qa/1062-line-input-real-qa/renderer-real-qa.err.log`, `docs/qa/1062-line-input-real-qa/renderer-real-qa.log`, `docs/dev-reports/2026-08-05-1062-r19-sol-reconvergence.md` (보존)

## ① 제거한 것

- `routes/index.tsx`의 `/sales/:id/edit` route 및 `sales.slip.edit/update` route guard
- `SlipFormPage.tsx`의 `useParams`·GET hydrate·PUT update 분기·편집 상태 가드·편집 전용 helper
- `SlipFormPage.edit.test.ts`
- `1062-r18-edit-route.spec.ts` 및 기존 `1062-line-input-ux.spec.ts` 안의 판매전표 편집 시나리오
- `api/mock.ts`의 `PUT /slips/{id}/sales` mock handler
- `SlipDetailPage` 행 추가 navigate 변경(상세 파일은 `origin/main`으로 복원)
- R18 전용 보고서 `docs/dev-reports/2026-08-05-1062-r18-edit-route.md`
- `slip-collab-panel.spec.ts`를 `origin/main` 계약으로 복원

## ② `origin/main` 대비 diff 확인 원문

```text
git diff --quiet origin/main -- clients/desktop/src/renderer/routes/SlipDetailPage.tsx
SlipDetailPage origin/main diff: empty

git diff --quiet origin/main -- clients/desktop/src/renderer/components/collab/CollaborativeSlipInput.tsx
CollaborativeSlipInput origin/main diff: empty

git diff --quiet origin/main -- clients/desktop/playwright/slip-collab/slip-collab-panel.spec.ts
slip-collab-panel.spec: empty
```

`SlipFormPage.tsx`의 `origin/main` 대비 차이는 신규 작성 경로의 `onInputCommitChange`와 `resultSelectionMode={null}` 두 자동완성 설정만 남겼습니다.

## ③ 남긴 것

- design-system `AsyncAutocomplete`/`ProductAutocomplete`/`SearchResultSelectionModal`의 판독성 경로
- 신규 `SlipFormPage`의 자동완성 커밋 해제 및 `resultSelectionMode={null}`
- `EstimateFormPage`, `JournalFormPage`, `TransferFormPage`의 자동 빈행 동작
- `utils/autoBlankRow.ts`와 테스트, 빈행 저장 제외(`filterMeaningfulRows`/`willLineBeSaved`) 계약
- 기존 상세 inline edit와 기존 `sales.slip.edit` BE/FE 권한 계약

## ④ `sales.slip.edit` 권한 출처

R18 신규가 아닙니다. R18 커밋은 route에서 기존 권한을 참조했을 뿐이며, 권한 자체는 기존 `SP-D6-6` 커밋(`cc030f67c`)과 auth `V36` seed에 존재합니다.

```text
SalesSlipUpdateController.java:50 @RequirePermission(page = "sales.slip.edit", action = UPDATE)
V36__seed_sp_d6_6_slip_page_codes.sql:26,66-68 sales.slip.edit seed
PageCode.java:188 SALES_SLIP_EDIT("sales.slip.edit", ...)
permissionsApi.ts:120 'sales.slip.edit'
PermissionMatrixPage.tsx:187,429 sales.slip.edit
```

따라서 권한 코드는 되돌리지 않았습니다.

## ⑤ RED 원문

```text
RED-A1
git diff --quiet origin/main -- SlipDetailPage.tsx CollaborativeSlipInput.tsx
SlipDetailPage origin/main diff: empty
CollaborativeSlipInput origin/main diff: empty

RED-A2 / RED 편집 식별자 전수
route/edit residue: 0

RED-B1
npm exec vitest run ...autoBlankRow.test.ts ...SlipFormPage.test.tsx ...JournalFormPage.test.tsx ...SlipDetailPage.lineIdContract.test.tsx
Test Files 4 passed (4)
Tests 166 passed (166)

RED-B2
CI=1 npm exec playwright test playwright/1062-line-input-ux/1062-line-input-ux.spec.ts ...
NO_LISTENER_5173
2 passed (5.8s)
```

## ⑥ 전수 조사 결과

코드·QA·서비스·공유 테스트 범위에서 `/sales/:id/edit`, `isSalesSlipEditable`, `hydrateSalesSlipEditLines`, `buildSalesSlipUpdateRequest`, `editSlipQuery`, `salesSlipUpdateMatch`, `__SAMHAN_LAST_SLIP_UPDATE`, `1062-r18-edit-route`, `SlipFormPage.edit` 검색 결과:

```text
route/edit residue: 0
```

`sales.slip.edit` 검색 결과는 기존 상세 inline edit/BE endpoint/auth catalog/계약 테스트만 남았고, R20이 새로 추가한 route/mock/편집 분기는 없습니다. `autoBlankRow` 참조는 Estimate·Journal·Transfer·신규 SlipForm 및 유틸 테스트에서 확인했습니다.

## ⑦ 종료조건 3종 명령·출력 원문

### 새 조합 열거 및 실행

```text
조합 1: 기존 상세 + 행 추가 → origin/main alert 동작 보존
조합 2: 신규 판매전표 + ProductAutocomplete 후보 2건 이상 → 모달
조합 3: 견적 수정 + trailing 빈행 → 확정 후 다음 빈행
조합 4: 분개 신규/편집 + 자동 빈행·최소 2행·저장 제외
조합 5: 이동 신규 + trailing 자동 빈행
조합 6: autoBlankRow 유틸 + 최소행/저장 제외 단위 계약
```

실행 결과:

```text
EstimateFormPage.coedit.test.tsx + JournalFormPage.model.test.ts
Test Files 2 passed (2)
Tests 35 passed (35)

autoBlankRow.test.ts
6 tests passed
```

### 참조 전수

```text
rg ... '/sales/:id/edit|isSalesSlipEditable|hydrateSalesSlipEditLines|buildSalesSlipUpdateRequest|editSlipQuery|salesSlipUpdateMatch|__SAMHAN_LAST_SLIP_UPDATE|1062-r18-edit-route|SlipFormPage\.edit' clients qa services shared
route/edit residue: 0
```

### 영향 테스트

```text
npm run typecheck
Exit code: 0
real-QA scope: tests 2 pass 2; tests 50 pass 50

npm exec vitest run 관련 파일
Test Files 4 passed (4)
Tests 166 passed (166)

CI=1 npm exec playwright test playwright/1062-line-input-ux/1062-line-input-ux.spec.ts --config=playwright.config.ts --reporter=line
NO_LISTENER_5173
Running 2 tests using 1 worker
2 passed (5.8s)
```

## 신규 파일 목록

- `docs/dev-reports/2026-08-05-1062-r20-edit-route-split.md`

기존 변경 파일 `docs/qa/1062-line-input-real-qa/renderer-real-qa*.log`는 건드리지 않았습니다. 커밋·스테이징·푸시는 수행하지 않았습니다.
