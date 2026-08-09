# #1153 소급 SOL 5.6 적대검증 — 도달성

## 결론

```text
도달 가능한 결함: 0건
소급 판정: dcc4541c5의 6줄 변경 자체는 정당하며 되돌릴 이유가 없다.
다만 머지 절차는 정당하지 않았다. 실 DB 쓰기 금지와 충돌하는 저장·409 라이브 경로는
이번 소급 검증에서도 미검증으로 남았으므로, 폐기 가능한 격리 데이터/DB를 마련해 라이브 QA를 보강해야 한다.
```

테스트 단정은 죽지 않았다. 세 뮤테이션이 모두 의도한 단정에서 RED였고, 대상 커밋의 테스트 파일은 20회 연속 20/20, 매회 42/42였다. 변경은 기대값을 새 동작에 맞춘 형태가 아니라 두 번째 저장 호출이라는 기존 조건을 기다리도록 관찰 시점만 바꾼 것이다.

## 0. 검증 기준과 작업tree 불일치

검증 시작 시 원문:

```text
git branch --show-current  -> main
git rev-parse HEAD         -> d8545c0350be7bf1c3969c0ea2e6d5805b4374b8
git merge-base --is-ancestor dcc4541c5 HEAD
ANCESTOR_EXIT=1
```

즉 로컬 `main`은 요청에 적힌 `dcc4541c5`가 아니며 그 커밋의 후손도 아니다. 브랜치/HEAD를 이동하지 말라는 지시를 지켰다. 구현 파일은 두 트리 사이 차이가 없었고 테스트 파일만 대상 커밋의 6줄이 현재 로컬 트리에서 반대로 돌아가 있었다.

```text
git diff --stat dcc4541c5 -- CodefImportScopeForm.tsx CodefImportScopeForm.test.tsx
CodefImportScopeForm.test.tsx | 6 ++----
```

따라서 `dcc4541c5`의 6줄을 작업tree에 임시 재현해 뮤테이션과 20회를 수행하고, 종료 전에 현재 HEAD 원문으로 복구했다. 최종 복구 원문은 `SOURCE_RESTORE_EXIT=0`이다.

## 1. 변경 전후 — 보호 계약이 그대로인가

`git show dcc4541c5 -- '*.test.tsx'`의 실 diff는 질문에 적힌 F1 충돌 테스트가 아니라 바로 앞 테스트인 아래 테스트에만 적용됐다.

```text
CODEF 낙관적 잠금 — 조회 버전을 저장 요청에 싣고 성공 응답 버전으로 다음 저장을 이어간다
```

변경 전:

```tsx
fireEvent.click(screen.getByTestId('codef-save-scope-button'))
await flushZeroDelayTasks()
expect(saveCodefImportScopeMock).toHaveBeenCalledTimes(2)
expect(saveCodefImportScopeMock.mock.calls[1]![0]).toMatchObject({ version: 1 })
```

변경 후:

```tsx
fireEvent.click(screen.getByTestId('codef-save-scope-button'))
await waitFor(() => expect(saveCodefImportScopeMock).toHaveBeenCalledTimes(2))
expect(saveCodefImportScopeMock.mock.calls[1]![0]).toMatchObject({ version: 1 })
```

판정:

- 호출 횟수 기대값 `2`는 그대로다.
- 두 번째 payload의 `version: 1` 단정도 그대로다.
- `waitFor`는 실패를 성공으로 바꾸는 재시도가 아니라 제한 시간 안에 같은 `calledTimes(2)` 조건이 실제로 성립하는지를 반복 관찰한다. 두 번째 호출이 영원히 없으면 RED다.
- 질문에 인용된 F1 충돌 테스트의 배너, BANK_A 유지, BANK_B 미선택, 일반 저장 잠금, 명시 덮어쓰기 버튼 단정은 한 줄도 바뀌지 않았다.
- 따라서 과거의 “새 동작에 맞춰 기대값을 바꿔 회귀 신호를 끈” 형태와 같지 않다.

기준 실행 원문:

```text
Test Files 1 passed (1)
Tests 2 passed | 40 skipped (42)
Exit code: 0
```

## 2. 뮤테이션 도달성

각 뮤테이션은 한 번에 하나만 적용했다. 매 회차 뒤 구현 파일을 역패치하고 다음 원문을 확인했다.

```text
IMPLEMENTATION_RESTORE_EXIT=0
M clients/desktop/src/renderer/routes/components/CodefImportScopeForm.test.tsx
```

남은 수정 표시는 대상 커밋의 6줄을 임시 재현한 테스트 파일뿐이며 구현 파일은 매번 원복됐다는 뜻이다.

### M1. 구현에서 후속 저장 호출 제거

뮤테이션은 `baseVersion === 1`인 두 번째 저장에서 API spy를 호출하지 않고 기존 스냅샷을 반환하도록 했다. 최초 저장은 그대로 실행되므로 “저장 기능 전체 제거”가 아니라 후속 저장만 제거한 변이이다.

```text
FAIL ... 성공 응답 버전으로 다음 저장을 이어간다
AssertionError: expected "spy" to be called 2 times, but got 1 times
CodefImportScopeForm.test.tsx:193:58
Tests 1 failed | 41 skipped (42)
Exit code: 1
```

판정: **RED — 두 번째 저장 소실을 잡는다.**

### M2. 409 충돌 시 서버 최신 선택으로 화면 덮어쓰기

충돌 재조회 성공 직후 `setSelection(latest...)`를 삽입했다.

```text
FAIL ... 충돌해도 내 화면 선택은 그대로 두고 서버 최신은 배너로만 안내한다
AssertionError: expected true to be false
- Expected false
+ Received true
CodefImportScopeForm.test.tsx:253:86
Tests 1 failed | 41 skipped (42)
Exit code: 1
```

판정: **RED — 서버 BANK_B가 체크되는 화면 덮어쓰기를 잡는다.**

### M3. 두 번째 저장 version 오송신

두 번째 저장에만 `version: 999`를 보내도록 바꿨다.

```text
FAIL ... 성공 응답 버전으로 다음 저장을 이어간다
AssertionError: expected ... to match object { version: 1 }
- "version": 1
+ "version": 999
CodefImportScopeForm.test.tsx:194:56
Tests 1 failed | 41 skipped (42)
Exit code: 1
```

판정: **RED — version 오송신을 잡는다.**

## 3. 결정성 20회 재현

`clients/desktop`에서 대상 커밋의 테스트 파일을 실행했다. 종료코드는 각 Vitest 호출 직후 `$LASTEXITCODE`로 읽었고 파이프 뒤에서 읽지 않았다.

```powershell
$ErrorActionPreference='Continue'
$passed=0
for($i=1; $i -le 20; $i++) {
  Write-Output "RUN $i/20"
  npx vitest run src/renderer/routes/components/CodefImportScopeForm.test.tsx --reporter=dot
  $runExit=$LASTEXITCODE
  Write-Output "EXIT $runExit"
  if($runExit -ne 0) { Write-Output "SUMMARY $passed/20"; exit $runExit }
  $passed++
}
Write-Output "SUMMARY $passed/20"
```

원문 요약:

```text
RUN 1/20   Tests 42 passed (42)   EXIT 0
RUN 2/20   Tests 42 passed (42)   EXIT 0
RUN 3/20   Tests 42 passed (42)   EXIT 0
RUN 4/20   Tests 42 passed (42)   EXIT 0
RUN 5/20   Tests 42 passed (42)   EXIT 0
RUN 6/20   Tests 42 passed (42)   EXIT 0
RUN 7/20   Tests 42 passed (42)   EXIT 0
RUN 8/20   Tests 42 passed (42)   EXIT 0
RUN 9/20   Tests 42 passed (42)   EXIT 0
RUN 10/20  Tests 42 passed (42)   EXIT 0
RUN 11/20  Tests 42 passed (42)   EXIT 0
RUN 12/20  Tests 42 passed (42)   EXIT 0
RUN 13/20  Tests 42 passed (42)   EXIT 0
RUN 14/20  Tests 42 passed (42)   EXIT 0
RUN 15/20  Tests 42 passed (42)   EXIT 0
RUN 16/20  Tests 42 passed (42)   EXIT 0
RUN 17/20  Tests 42 passed (42)   EXIT 0
RUN 18/20  Tests 42 passed (42)   EXIT 0
RUN 19/20  Tests 42 passed (42)   EXIT 0
RUN 20/20  Tests 42 passed (42)   EXIT 0
SUMMARY 20/20
Exit code: 0
```

실측 시간은 143초였다.

## 4. 라이브 QA

### 4.1 쓰기 시나리오의 제약

기존 실서버 스펙 자체가 다음과 같이 경고한다.

```text
이 스펙은 dev_master 의 실 CODEF 범위(connected-main)에 write 한다.
PM 이 실행 전 스냅샷을 뜨고 실행 후 원복한다(공유 스택).
```

계좌·카드·대출 선택을 “저장”하거나 두 화면에서 순차 저장해 409를 만드는 행위는 `/accounting/codef/scopes` PUT과 실 DB 변경을 필수로 한다. 사용자 지시의 **실 DB 쓰기 금지**가 더 강한 안전 제약이므로 이 두 경로를 실행하지 않았다. 따라서 아래 두 항목은 이번 라이브 QA로 증명됐다고 주장하지 않는다.

- 계좌·카드·대출을 새로 선택해 저장한 뒤 재진입 보존
- 두 실 화면의 충돌 생성 후 내 선택 유지 + 배너 표시

### 4.2 수행한 실 API 읽기 전용 재진입

임시 Playwright 스펙은 `clients/desktop` 안에서 실행했고 `headless: true`인 공유 real-QA config를 사용했다. 로그인과 CODEF API는 실 게이트웨이 `127.0.0.1:8080`이었다. `page.route`/mock은 사용하지 않았다. 캡처 경로는 다음 호출로만 결정했다.

```tsx
resolveQaShotsDir(path.resolve(here, '../../../../docs/qa/1153-retroactive-real-qa/screenshots'))
```

실행 원문:

```text
Running 1 test using 1 worker
[LIVE-QA] before={"bank":[true,true,false,false],"card":[],"loan":[]}
after={"bank":[true,true,false,false],"card":[],"loan":[]}
codefRequests=[
  GET .../accounting/codef/bank-accounts?connectedId=connected-main,
  GET .../accounting/codef/cards?connectedId=connected-main,
  GET .../accounting/codef/loans?connectedId=connected-main,
  GET .../accounting/codef/scopes?connectedId=connected-main,
  GET .../accounting/codef/bank-accounts?connectedId=connected-main,
  GET .../accounting/codef/cards?connectedId=connected-main,
  GET .../accounting/codef/loans?connectedId=connected-main,
  GET .../accounting/codef/scopes?connectedId=connected-main
]
1 passed (15.2s)
LIVE_QA_EXIT=0
```

실측 범위:

- 저장돼 있던 계좌 선택 4개 상태 `[선택, 선택, 미선택, 미선택]`는 reload 재진입 뒤 동일했다.
- 실 카드/대출 목록은 각각 0개여서 해당 종류의 선택 보존은 도달하지 못했다.
- CODEF 비GET 요청은 0건이었다. 즉 실 DB write를 하지 않았다.
- 화면 캡처에서 국민·신한 계좌가 재진입 후 선택된 상태로 보이는 것을 직접 확인했다.

로컬 캡처:

- `docs/qa/1153-retroactive-real-qa/screenshots/_local/01-real-api-scope-before-reentry.png`
- `docs/qa/1153-retroactive-real-qa/screenshots/_local/02-real-api-scope-after-reentry.png`

임시 스펙은 실행 후 삭제했다. Vite와 Playwright 잔여 확인 원문:

```text
PORT_5175_LISTENER_COUNT=0
QA_PROCESS_LEFTOVER_COUNT=0
```

## 5. 같은 계열 후보 재계수

대상 커밋 트리에서 직접 계산했다.

```text
ALL_OCCURRENCE_LINES=290
NO_WAIT_SAME_LINE=116
NO_WAIT_FILES=30
```

원 보고서의 파일 집합 30개는 정확하다. 파일별 원시 후보 줄 수 합계도 116개다. 이 기준은 “`toHaveBeenCalledTimes`가 있는 같은 줄에 `waitFor(` 문자열이 없음”일 뿐이므로 동기 콜백 단정, 앞 단계에서 이미 조건을 기다린 단정, 멀티라인 `waitFor` 내부 단정 가능성을 함께 섞는다. 따라서 116개를 곧바로 flaky 116개로 부르면 안 된다.

파일별 재계수:

```text
client.authheaders 6, lineIdContract 1, slip 3,
CollaborativeSlipInput 1, PartnerOrderCollaborationPanel.coedit 1,
AppNoticeGate 2, BiometricLockGate 13, PartnerLookupErrorBanner 2,
ElementInspector 1, DocumentReferencePicker 8, usePermissions.freshness 2,
ApprovalDocView.real-render 1, ApprovalDocView 5, pushRegistration 10,
createCoeditProvider 7, useCollectionRealtime 1, ApprovalLineConfigPage 1,
AligoAddressBookPage 9, CashReceiptFormPage 2, CollectionPlanPage 1,
CodefImportScopeForm 4, EstimateItemsCatalogPage 10, MessengerPage 3,
NotesReceivablePage 1, PartnerAgingPage 1,
SalesPartnerOrderDetailPage.coedit 1, SlipDetailPage.partner-required 1,
SlipFormPage 8, TaxInvoiceFormPage.partner-contract 1, session 9
```

추가 실제 flaky 실측 판정:

```text
확정 추가 flaky: 0건
미판정: CodefImportScopeForm을 제외한 29파일
```

여기서 “0건”은 추가 flaky가 없다는 뜻이 아니라 이번 실행으로 새 RED를 확정한 파일이 없다는 뜻이다. 29파일 묶음 실행은 180초 안에 완주하지 못해 종료코드 124였다. 첫 시도는 PowerShell 배열 전달 오류로 파일 인자가 빠져 전체 suite가 실행됐으므로 측정에서 폐기했고, 두 번째는 29파일을 명시했지만 제한 시간 안에 결과가 나오지 않았다. timeout 뒤 이 실행이 만든 Vitest/tinypool 프로세스는 명령행과 생성시각으로 특정해 회수했고 `LEFTOVER_COUNT=0`을 확인했다. 원 보고서의 “후보 목록”은 정확하지만 “실제로 flaky인지”는 분류·개별 스트레스 실행 전까지 미판정이다.

## 6. 최종 판정과 보강 요구

도달 가능한 제품/테스트 결함은 이번 범위에서 0건이다. `dcc4541c5`는 회귀 단정을 완화하지 않았고, 세 핵심 결함 모두 RED로 검출했으며, 결정성도 독립 재현됐다. 따라서 변경을 되돌리면 오히려 확인된 timing flake를 복원하므로 **revert하지 않는다**.

머지 절차는 정당하지 않았다. 라이브 QA와 적대검증 없이 머지한 사실은 결과가 우연히 옳았다는 것으로 치유되지 않는다. 필요한 보강은 다음 두 가지다.

1. 공유 `connected-main`이 아닌 폐기 가능한 격리 DB/계정에서 기존 `920-codef-scope-lock-real-qa`의 저장→재진입→두 화면 409→선택 보존·배너 경로를 실행한다.
2. 30파일·116줄 원시 grep을 동기/이미 대기/진짜 비대기 비동기로 분류한 뒤, 진짜 비대기 파일만 파일별 반복 실행한다. 현재 목록은 정확한 inventory이지 flaky 확정 목록이 아니다.

## 신규 파일 목록

- 추적 대상 신규 파일: `docs/dev-reports/2026-08-09-1153-retroactive-sol-review.md`
- gitignored 로컬 QA 캡처 2개: 위 `docs/qa/1153-retroactive-real-qa/screenshots/_local/` 목록

커밋·푸시·브랜치 이동·실 DB write는 하지 않았다.
