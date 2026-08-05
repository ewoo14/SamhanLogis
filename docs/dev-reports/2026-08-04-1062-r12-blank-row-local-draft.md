# PR #1063 R12 빈행 로컬 draft 분리

- 라운드: R12
- 작업 디렉터리: `C:/dev/Samhan-Public/.claude/worktrees/t1062`
- 브랜치: `fix/1062-line-input-ux`
- 시작 HEAD: `5da4fcf700395a90da9ce30ab98f5ecd4faad2f2`
- 시작 시점: 2026-08-04 (Asia/Seoul)
- 원칙: BE와 `docs/qa/1062-line-input-real-qa/renderer-real-qa*.log`는 수정하지 않으며, commit/add/push를 수행하지 않는다.

## 1. 채택 설계와 근거

R11 권고의 (다)인 “trailing 빈행은 로컬 React draft로만 유지하고 품목 확정 시 Y.Doc 문서 라인으로 승격”을 채택한다. 협업 문서에는 확정행만 두고, 저장 payload도 확정행만 직렬화한다. R9가 도입한 `previousServerLineIds` 기반의 `old - new = 원격 삭제` 추론은 제거한다. BE의 안정 ID 설계는 별도 슬라이스로 남긴다.

## 2. RED 원문

아래 다섯 테스트를 먼저 작성하고 현재 HEAD에서 각각 기대 실패를 확인한다. RED-A1은 R11 진단의 origin/main 대 HEAD 양 ref 대조 방식으로 재현한다.

```text
RED-A1  상대가 수량·메모만 저장해도 내 확정행이 유지된다 (R10 결함)
RED-A2  내 trailing 빈행이 상대 화면에 나타나지 않는다
RED-A3  빈행에서 품목을 확정하면 문서 라인이 되고 저장된다
RED-B1  미확정 빈행은 저장 payload 에서 제외된다
RED-B2  수정 진입 시 trailing 빈행이 유지되고, 확정하면 아래에 새 빈행이 생긴다
```

### RED 실행 원문

RED 파일 작성 직후 현재 HEAD에서 실행한 첫 결과다.

```text
RUN  v2.1.9
SlipDetailPage.lineIdContract.test.tsx (112 tests | 4 failed)
× RED-A1 상대가 수량·메모만 저장해도 내 확정행과 미저장 값이 유지된다
  expected ... to have a length of 3 but got 1
× RED-A2 ... seedSlipCoeditProvider is not a function
× RED-A3 ... seedSlipCoeditProvider is not a function
× RED-B2 ... seedSlipCoeditProvider is not a function
108 passed / 4 failed, exit 1
```

A1 양 ref 대조(동일 메모리 provider, 동일 입력)의 원문이다.

```text
{"ref":"origin/main","rowCount":3,"products":["P1","P2",""],"quantities":["7","9",null],"notes":["B 미저장","B 미저장 2",null],"pass":true}
{"ref":"5da4fcf70","rowCount":1,"products":[""],"quantities":[null],"notes":[null],"pass":false}
```

즉 R11 진단대로 origin/main은 통과하고 시작 HEAD(R9)는 확정행·미저장값을 제거했다. RED-A2/A3/B2의 초기 함수 미노출 오류는 구현 함수 export로 테스트 표면을 닫은 뒤 재실행했으며, B1은 기존 payload 필터가 이미 지키던 RED-B 불변식이다.

## 3. 새 조합과 결과

| 조합 | 결과 |
|---|---|
| 빈행에 입력 중 상대가 저장 | PASS — provider는 확정행만 1개 유지하고 로컬 draft는 2번째 화면 행으로 유지 |
| 빈행 확정 직후 상대가 같은 위치에 라인 추가 | PASS — 확정행 3개가 productId 순서대로 유지 |
| 두 사용자가 동시에 빈행 확정 | PASS — 서로 다른 신규 lineId 2개와 기존행이 모두 payload 대상 |
| 확정 후 새로 생긴 빈행 | PASS — 화면 로컬 행만 1개 추가, provider 문서 라인 수 불변 |
| 상대가 수량·메모만 저장해 서버 ID가 전량 교체 | PASS — 위치 재시드가 값 보존, old-new 삭제 추론 없음 |
| 수정 진입 및 확정 | PASS — 협업 문서는 확정행만 seed하고 확정 순간 `addItem` 승격 |

관련 테스트에서 `resultSelectionMode={null}` 및 기존 `SlipFormPage`/견적·이동·분개 계약은 수정하지 않았다.

## 4. 종료조건 증거

### 참조 전수

```text
rg -n "coeditLineIdsAreStale|reseedCoeditLineIds|replaceItems|toServerLineIdSet|ensureTrailingBlankRow|persistedDetailLines|previousServerLineIds" clients/desktop/src
```

핵심 결과: `SlipDetailPage.tsx`는 `previousServerLineIds`를 만들거나 전달하지 않는다. `reseedCoeditLineIds`는 2인자 위치 재시드만 남았고, `seedSlipCoeditProvider/syncSlipCoeditProvider`는 `persistedDetailLines(...)`만 `replaceItems`한다. `previousServerLineIds` 문자열은 코드가 아닌 과거 R10/R11 및 본 보고서의 역사 기록에만 남았다.

### typecheck 원문

```text
> @samhan/desktop@0.1.0 typecheck
> ... tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit ...
Exit code: 0
real-QA typecheck tests: 2 passed / 0 failed
real-QA scope tests: 50 passed / 0 failed
```

실행 중 기존 미추적 로컬 real-QA 스펙 안내/CRLF warning이 출력됐으나 typecheck와 scope test의 exit code는 0이다.

### 관련 Vitest GREEN 원문

```text
RUN  v2.1.9
✓ SlipDetailPage.lineIdContract.test.tsx (116 tests)
✓ createCoeditProvider.test.ts (29 tests)
✓ autoBlankRow.test.ts (6 tests)
Test Files 3 passed (3)
Tests 151 passed / 0 failed
exit 0
```

### Playwright mock 원문

이번 변경 전용 mock 스펙:

```text
Running 3 tests using 1 worker
[1/3] 후보 2건 이상은 UUID 없이 읽을 수 있는 품목 표 모달을 연다
[2/3] 견적 수정 화면은 처음부터 trailing 빈행을 두고, 확정 후 다음 빈행을 만든다
[3/3] 판매전표 수정 빈행은 ProductAutocomplete로 품목을 확정하고 새 trailing 빈행을 만든다
3 passed (6.7s)
exit 0
```

참고로 mock 전체 `npm exec playwright test --config=playwright.config.ts --reporter=line`은 124초 및 304초 제한에서 모두 출력 없이 timeout(exit 124)했다. 실패 테스트 출력은 없으며, 전체 suite 완료를 주장하지 않는다. R12 전용 스펙은 3/3 pass다.

### `git diff --check`

```text
exit 0
```

## 5. 동시 GREEN

R12 RED 5개와 새 조합 4개를 포함한 관련 계약 suite의 동시 최종 결과:

```text
116 passed / 0 failed
151 passed / 0 failed (3 test files)
typecheck exit 0
Playwright R12 mock 3 passed / 0 failed
```

## 6. 변경 파일

기존 수정 파일:

- `clients/desktop/src/renderer/realtime/coeditLineIds.ts` — R9 3인자 삭제 추론 제거, 2인자 위치 재시드만 유지.
- `clients/desktop/src/renderer/routes/SlipDetailPage.tsx` — 협업 seed/reload에서 확정행만 문서화, 빈행 확정 순간 `addItem` 승격, `previousServerLineIds` 경로 제거.
- `clients/desktop/src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx` — RED-A1~A3/B1~B2 및 빈행 경쟁 조합 회귀 테스트.

신규 파일:

- `docs/dev-reports/2026-08-04-1062-r12-blank-row-local-draft.md` — 본 R12 보고서.

기존 사용자 변경으로 보존한 파일(이번 라운드 미수정): `docs/qa/1062-line-input-real-qa/renderer-real-qa.err.log`, `docs/qa/1062-line-input-real-qa/renderer-real-qa.log`, `docs/dev-reports/2026-08-04-1062-r10-sol-reconvergence.md`, `docs/dev-reports/2026-08-04-1062-r11-line-identity-diagnosis.md`.

## 5. 변경 파일
