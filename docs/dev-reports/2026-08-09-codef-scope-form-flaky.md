# CODEF 범위 폼 flaky 테스트 결정화 보고서

## ① 원인 확정

판정은 **전자: 테스트가 두 번째 호출을 기다리지 않은 것**이다. 구현 결함은 확인되지 않았다.

- 충돌 전 최초 범위 조회는 `CodefImportScopeForm.tsx:235-243`의 `scopeQuery`가 수행한다.
- 409 충돌 처리에서 `CodefImportScopeForm.tsx:508-530`의 `onError`가 `loadCodefImportScope(DEFAULT_CONNECTED_ID)`를 반드시 다시 호출한다. 따라서 F1 시나리오의 `loadCodefImportScope` 호출 횟수 2는 최초 조회 1회 + 충돌 후 최신 조회 1회라는 실제 계약이다.
- F1 테스트의 해당 단정은 `CodefImportScopeForm.test.tsx:239-241`에서 이미 `waitFor(() => ...toHaveBeenCalledTimes(2))`로 기다리고 있다.
- 실제 회귀 지점은 같은 파일 `CodefImportScopeForm.test.tsx:187-191`의 두 번째 저장이다. `fireEvent.click()` 뒤 `flushZeroDelayTasks()`만 통과하고 즉시 `toHaveBeenCalledTimes(2)`를 실행했다. `saveMutation.mutate()`는 구현 `CodefImportScopeForm.tsx:491-492`, 버튼 연결은 `:713-718`이며 React Query 비동기 경계를 지난다.
- 과거 결정화 commit `f9006d018`가 같은 지점을 `waitFor`로 고쳤고, 후속 `3c4012db1`가 이를 고정 flush+즉시 단정으로 되돌린 diff도 확인했다.

즉, spy가 최종적으로 2회 호출되지 않는 실 결함이 아니라, 두 번째 저장 호출이 spy에 도착하기 전에 테스트가 관찰한 것이다. 저장 구현과 409 처리 구현은 변경하지 않았다.

## ③ 변경 내용

`clients/desktop/src/renderer/routes/components/CodefImportScopeForm.test.tsx:190`의 두 번째 저장 호출 검증을 다음과 같이 변경했다.

```tsx
await waitFor(() => expect(saveCodefImportScopeMock).toHaveBeenCalledTimes(2))
```

`setTimeout`, 고정 지연, 재시도 횟수 증가는 사용하지 않았다. `waitFor`는 “두 번째 저장 spy 호출이 실제로 발생함”이라는 조건을 기다린다.

## ④ 보호되는 회귀 계약

`2 times`는 두 번째 저장이 실제로 수행됐다는 뜻이며, 두 번째 호출 payload의 `version: 1`도 `CodefImportScopeForm.test.tsx:191`에서 계속 단정된다. 따라서 낙관적 잠금 계약(첫 저장 version 0, 후속 저장 version 1)을 약화하지 않았다.

F1 충돌 테스트의 핵심 보호도 그대로다.

- 충돌 후 최신 서버 선택은 배너에만 표시: `CodefImportScopeForm.test.tsx:242-243`
- 내 화면의 BANK_A 선택 유지: `:248-249`
- 서버의 BANK_B를 자동 선택하지 않음: `:249`
- 일반 저장 잠금 및 명시적 덮어쓰기 경로: `:250-252`

## ⑤ 20회 연속 실행 원문

명령:

```powershell
$ErrorActionPreference='Continue'; for ($i=1; $i -le 20; $i++) { Write-Output "RUN $i/20"; npx vitest run src/renderer/routes/components/CodefImportScopeForm.test.tsx --reporter=dot; $exitCode=$LASTEXITCODE; Write-Output "EXIT $exitCode"; if ($exitCode -ne 0) { exit $exitCode } }
```

결과 원문(20/20):

```text
RUN 1/20
  ✓ src/renderer/routes/components/CodefImportScopeForm.test.tsx (42 tests)
  Test Files 1 passed (1)
  Tests 42 passed (42)
EXIT 0
RUN 2/20
  ✓ src/renderer/routes/components/CodefImportScopeForm.test.tsx (42 tests)
  Test Files 1 passed (1)
  Tests 42 passed (42)
EXIT 0
RUN 3/20
  ✓ src/renderer/routes/components/CodefImportScopeForm.test.tsx (42 tests)
  Test Files 1 passed (1)
  Tests 42 passed (42)
EXIT 0
RUN 4/20
  ✓ src/renderer/routes/components/CodefImportScopeForm.test.tsx (42 tests)
  Test Files 1 passed (1)
  Tests 42 passed (42)
EXIT 0
RUN 5/20
  ✓ src/renderer/routes/components/CodefImportScopeForm.test.tsx (42 tests)
  Test Files 1 passed (1)
  Tests 42 passed (42)
EXIT 0
RUN 6/20
  ✓ src/renderer/routes/components/CodefImportScopeForm.test.tsx (42 tests)
  Test Files 1 passed (1)
  Tests 42 passed (42)
EXIT 0
RUN 7/20
  ✓ src/renderer/routes/components/CodefImportScopeForm.test.tsx (42 tests)
  Test Files 1 passed (1)
  Tests 42 passed (42)
EXIT 0
RUN 8/20
  ✓ src/renderer/routes/components/CodefImportScopeForm.test.tsx (42 tests)
  Test Files 1 passed (1)
  Tests 42 passed (42)
EXIT 0
RUN 9/20
  ✓ src/renderer/routes/components/CodefImportScopeForm.test.tsx (42 tests)
  Test Files 1 passed (1)
  Tests 42 passed (42)
EXIT 0
RUN 10/20
  ✓ src/renderer/routes/components/CodefImportScopeForm.test.tsx (42 tests)
  Test Files 1 passed (1)
  Tests 42 passed (42)
EXIT 0
RUN 11/20
  ✓ src/renderer/routes/components/CodefImportScopeForm.test.tsx (42 tests)
  Test Files 1 passed (1)
  Tests 42 passed (42)
EXIT 0
RUN 12/20
  ✓ src/renderer/routes/components/CodefImportScopeForm.test.tsx (42 tests)
  Test Files 1 passed (1)
  Tests 42 passed (42)
EXIT 0
RUN 13/20
  ✓ src/renderer/routes/components/CodefImportScopeForm.test.tsx (42 tests)
  Test Files 1 passed (1)
  Tests 42 passed (42)
EXIT 0
RUN 14/20
  ✓ src/renderer/routes/components/CodefImportScopeForm.test.tsx (42 tests)
  Test Files 1 passed (1)
  Tests 42 passed (42)
EXIT 0
RUN 15/20
  ✓ src/renderer/routes/components/CodefImportScopeForm.test.tsx (42 tests)
  Test Files 1 passed (1)
  Tests 42 passed (42)
EXIT 0
RUN 16/20
  ✓ src/renderer/routes/components/CodefImportScopeForm.test.tsx (42 tests)
  Test Files 1 passed (1)
  Tests 42 passed (42)
EXIT 0
RUN 17/20
  ✓ src/renderer/routes/components/CodefImportScopeForm.test.tsx (42 tests)
  Test Files 1 passed (1)
  Tests 42 passed (42)
EXIT 0
RUN 18/20
  ✓ src/renderer/routes/components/CodefImportScopeForm.test.tsx (42 tests)
  Test Files 1 passed (1)
  Tests 42 passed (42)
EXIT 0
RUN 19/20
  ✓ src/renderer/routes/components/CodefImportScopeForm.test.tsx (42 tests)
  Test Files 1 passed (1)
  Tests 42 passed (42)
EXIT 0
RUN 20/20
  ✓ src/renderer/routes/components/CodefImportScopeForm.test.tsx (42 tests)
  Test Files 1 passed (1)
  Tests 42 passed (42)
EXIT 0
```

개별 지정 명령도 `Test Files 1 passed (1)`, `Tests 42 passed (42)`, 종료코드 0을 확인했다.

## ⑥ 같은 계열 전수 grep 목록 — 이번에는 수정하지 않음

다음은 `clients/desktop/src`에서 `toHaveBeenCalledTimes(...)`를 직접 단정하면서 같은 줄에 `await waitFor`가 없는 후보 목록이다. 동기 콜백 단정도 포함된 원시 목록이며, 이번 작업에서는 판단·수정하지 않았다.

```text
renderer/push/pushRegistration.test.ts:97,110-111,180,252,267,295,306-308
renderer/hooks/usePermissions.freshness.test.tsx:51,115
renderer/stores/session.test.ts:113,135,138-139,156,162,183,202,226
renderer/realtime/createCoeditProvider.test.ts:252,337,341,386,407,409,699
renderer/realtime/useCollectionRealtime.test.ts:98
renderer/components/collab/CollaborativeSlipInput.test.tsx:223
renderer/components/collab/PartnerOrderCollaborationPanel.coedit.test.tsx:112
renderer/api/lineIdContract.test.ts:71
renderer/print/ApprovalDocView.test.tsx:307,327,355,449,492
renderer/print/ApprovalDocView.real-render.test.tsx:285
renderer/routes/CashReceiptFormPage.test.tsx:564,655
renderer/components/common/AppNoticeGate.test.tsx:54,88
renderer/components/common/BiometricLockGate.test.tsx:124,137,153,160,168,213,229,242,250,255,270,278,283
renderer/components/groupware/DocumentReferencePicker.test.tsx:70,100,109,200,236,250,282,307
renderer/components/common/PartnerLookupErrorBanner.test.tsx:66,82
renderer/api/slip.test.ts:36,91,119
renderer/components/documentTemplate/ElementInspector.test.tsx:178
renderer/routes/EstimateItemsCatalogPage.test.ts:33-36,44-45,47,55,58
renderer/api/__tests__/client.authheaders.test.ts:53,100-101,126,146,226
renderer/routes/admin/AligoAddressBookPage.test.tsx:86,106,171,188,205,222,245,392,421
renderer/routes/components/CodefImportScopeForm.test.tsx:182,653,896,1370
renderer/routes/CollectionPlanPage.test.tsx:97
renderer/routes/MessengerPage.test.tsx:119,220,344
renderer/routes/NotesReceivablePage.test.tsx:90
renderer/routes/PartnerAgingPage.test.tsx:64
renderer/routes/SalesPartnerOrderDetailPage.coedit.test.tsx:458
renderer/routes/SlipDetailPage.partner-required.test.tsx:66
renderer/routes/SlipFormPage.test.tsx:593,655,1623,1655,1690,1790,1814,1913
renderer/routes/TaxInvoiceFormPage.partner-contract.test.tsx:211
renderer/routes/__tests__/ApprovalLineConfigPage.test.ts:63
```

## 신규 파일 경로 목록

- `docs/dev-reports/2026-08-09-codef-scope-form-flaky.md`

변경한 기존 파일:

- `clients/desktop/src/renderer/routes/components/CodefImportScopeForm.test.tsx`

커밋·푸시는 하지 않았다.
