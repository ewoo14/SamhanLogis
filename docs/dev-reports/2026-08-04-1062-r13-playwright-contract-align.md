# R13 Playwright 계약 정렬 보고서

## ① 작업 시작 상태

- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\t1062`
- 저장소 루트 확인: `C:/dev/Samhan-Public/.claude/worktrees/t1062`
- 브랜치: `fix/1062-line-input-ux`
- HEAD: `562079bdd7c6bf663d986c83ab1d33e364b99e92`
- 작업 시작 시점: 2026-08-05 (Asia/Seoul)

## ② 실패 스펙 특정 및 A/B 판정

- 실패 스펙: `clients/desktop/playwright/slip-collab/slip-collab-panel.spec.ts:183`
- 실패 locator: `getByTestId('slip-coedit-field-items-0-productName')`
- A 판정. R9가 `productId`가 있는 확정행에서 `ProductAutocomplete`를 제거하고 품목명을 읽기 전용으로 렌더했으므로, 구현 결함이 아니라 옛 계약을 단언한 스펙이다.
- 최초 재현: `slip-collab` + `slip-form-v20`를 `CI=1` 새 서버에서 실행했을 때 해당 스펙 1건 실패, 나머지 11건 통과.

## ③ 스펙이 단언하던 계약과 변경 이유

기존 스펙은 협업 수정 폼의 첫 번째 확정 품목행에도 `slip-coedit-field-items-0-productName` coedit input이 존재하고 표시되어야 한다고 단언했다. 현재 계약은 확정행의 품목 교체 금지이므로 해당 input은 없어야 하며, 품목명은 읽기 전용 텍스트로 표시된다. 수량·단가 등 허용 편집 셀의 coedit input은 계속 유지된다.

스펙은 다음 사용자 경로를 새 계약에 맞게 보존한다.

- 확정행 품목명 표시: `시스템에어컨 4Way 4HP` visible
- 확정행 품목 교체 UI 부재: `slip-coedit-field-items-0-productName` count 0
- 수량·VAT 포함 단가 편집: 기존 `getByLabel('수량 1')`, `getByLabel('단가(VAT 포함) 1')` 단언 유지
- 빈행 품목 확정·trailing 빈행 생성: 별도 R13 스펙 `1062-line-input-ux.spec.ts`의 3개 테스트 유지

## ④ 같은 계약 전수 조사

`rg` 전수 조사 결과, 옛 `slip-coedit-field-items-0-productName` 단언은 수정한 스펙 1건뿐이었다. `sales-slip-edit-lines`/`slip-005` 관련 Playwright 스펙은 `1062-line-input-ux`, `slip-collab`, `slip-form-v20`, `coedit-s2a.shots`에 분포하지만 확정행 품목 autocomplete를 단언한 다른 스펙은 발견되지 않았다.

계약 테스트는 사라지지 않았다. `SlipDetailPage.lineIdContract.test.tsx`에 `canSelectProduct`, `ProductAutocomplete`, `resultSelectionMode={null}`, trailing draft/payload 제외 계약이 남아 있고, `1062-line-input-ux.spec.ts`에는 빈행 확정 경로가 남아 있다.

## ⑤ RED 원문

[RED-B1 — 실패 스펙 원문]

```text
Error: expect(locator).toBeVisible() failed
Locator: getByTestId('slip-coedit-field-items-0-productName')
Expected: visible
Error: element(s) not found
at clients/desktop/playwright/slip-collab/slip-collab-panel.spec.ts:183:77
```

[RED-A1 — 전체 mock hard gate 원문]

```text
[guard] expected=655 unexpected=1 skipped=0 flaky=0
```

수정 후 영향 스펙 원문:

```text
Running 8 tests using 2 workers
8 passed (8.1s)
```

## ⑥ CI=1 Playwright mock 전체 결과

실패 스펙 포함 영향 실행은 `CI=1`에서 새 Vite 서버로 8/8 통과했다. 전체 실행은 두 차례 시도했으나, 첫 시도는 약 500번째 테스트 이후 자동 webServer가 종료되어 `ERR_CONNECTION_REFUSED` 연쇄 실패했고, 두 번째는 별도 새 Vite 프로세스도 약 2분 후 종료되어 같은 환경 실패가 발생했다. 따라서 이 라운드에서는 전체 suite의 `unexpected=0` 원문을 확보하지 못했으며, 전체 hard gate 완료를 주장하지 않는다.

영향 검증 원문:

```text
npm run typecheck
tsc -p tsconfig.node.json --noEmit + tsc -p tsconfig.web.json --noEmit: pass
real-QA typecheck tests: 2 passed / 0 failed

vitest: 4 test files passed
Tests 191 passed / 0 failed
```

전체 미완 원문:

```text
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:5173/...
Error: dev server 미접근 ...
```
