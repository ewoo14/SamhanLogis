# PR #1050 / 이슈 #1049 R7 — Playwright mock hard gate RED fix

## 1. 스펙 판정

판정은 **계약 과잉이 아니라 구 UI 단정**이다.

M-7이 보존해야 하는 사용자 결과는 “`채권추심` 2건을 담당자코드 `00000`과 `999-99-99999`로 구분해 선택할 수 있다”이다. R6의 공용 `SearchResultSelectionModal`은 검색 결과가 2건 이상이면 모달을 열고, 두 후보를 각각 코드 병기 텍스트로 렌더링하며, `선택 확정` 콜백으로 선택값을 추가한다. 따라서 결과 계약은 새 UI에서도 성립한다.

기존 스펙은 다음 구 UI만 단정해 RED가 되었다.

```text
const listbox = page.getByRole('listbox', { name: '메신저 수신자 검색 결과' })
await expect(listbox.getByText('채권추심 (00000)')).toBeVisible()
```

새 단정은 Linux `ubuntu-latest`에서도 참인지 검토했다. `dialog`, `listbox`, `checkbox`, 표준 accessible name, 일반 한국어 텍스트만 사용하며 Windows 경로·시간대·픽셀·브라우저별 CSS를 단정하지 않는다.

## 2. fix

변경 파일은 Playwright 스펙 1개뿐이다.

- 2건 검색 후 `dialog`와 `검색 결과 선택` listbox를 찾는다.
- `채권추심 (00000)`, `채권추심 (999-99-99999)` checkbox가 보이는지 확인한다.
- 두 checkbox를 선택하고 `선택 확정`을 누른다.
- 수신자 칩이 2개이고 두 담당자코드가 화면에 남는지 확인한다. 즉, 결과 단정을 삭제하지 않고 실제 선택 결과까지 강화했다.
- 대조군 `박영업`은 기존 `메신저 수신자 검색 결과` dropdown에서 1건 exact 경로를 사용하고 괄호가 없음을 계속 확인한다.

자체 모달을 만들지 않았고, production 코드·API·R6 계약은 변경하지 않았다.

## 3. Playwright 실행 원문

### 수정 전 RED 재현

```text
npx playwright test playwright/ac-825-s6-messenger-chip/ac-825-s6-messenger-chip.spec.ts --reporter=line

Running 6 tests using 1 worker
...
Error: expect(locator).toBeVisible() failed
Locator: getByRole('listbox', { name: '메신저 수신자 검색 결과' }).getByText('채권추심 (00000)')
Error: element(s) not found
  140 | await input.fill('채권추심')
  141 | const listbox = page.getByRole('listbox', { name: '메신저 수신자 검색 결과' })
> 142 | await expect(listbox.getByText('채권추심 (00000)')).toBeVisible({ timeout: 10_000 })
  143 | await expect(listbox.getByText('채권추심 (999-99-99999)')).toBeVisible()

1 failed
5 passed (22.2s)
```

### 수정 후 대상 스펙

```text
npx playwright test playwright/ac-825-s6-messenger-chip/ac-825-s6-messenger-chip.spec.ts --reporter=line

Running 6 tests using 1 worker
6 passed (13.2s)
```

### Desktop mock hard gate 최종 실행

```text
npx playwright test --reporter=line

[657/657] ... version-management-v1b.spec.ts ...
657 passed (13.8m)
exit code 0
```

참고로 새 서버 이전 1차 전체 실행은 환경성으로 `619 passed / 28 failed / 10 skipped`였고, 후반 스펙의 공통 `page.goto(.../admin/app-releases)` timeout이 발생했다. Vite 서버가 종료된 뒤 새 서버로 전체 suite를 재실행했으며 최종 원문은 위와 같이 657/657 GREEN이다.

## 4. 불변식 1~4 실측

1. **Desktop Playwright hard gate GREEN:** `657 passed (13.8m)`, exit code 0. 스펙 skip·삭제는 하지 않았다.
2. **사용자 결과 보존:** M-7에서 두 코드 병기 checkbox를 실제로 선택하고 확정한 뒤 `messenger-recipient-chip` 2개와 두 코드 텍스트를 확인했다. 계약은 모달에서도 성립한다.
3. **R6 회귀 없음:**
   - 4종 모달 계약: `clients/desktop` 전체 Vitest에 포함된 `search-modal-four-target.contract.test.ts` 통과.
   - 1건 exact: M-7 대조군에서 기존 `메신저 수신자 검색 결과` dropdown과 `option`을 계속 확인.
   - Desktop Vitest: `195 files / 1728 tests passed`.
   - design-system: `25 files / 171 tests passed`.
   - Desktop `npm run typecheck`: exit code 0; real-QA scope `2/2`, `50/50` 통과.
4. **Linux 단정 및 범위 불변:** 새 locator는 표준 ARIA role/name과 텍스트만 사용한다. production 코드, API, DB, Docker, 다른 PR/worktree는 변경하지 않았다. `git commit`, `push`, `checkout`, 브랜치 조작도 수행하지 않았다.

design-system R6 비용 테스트 원문도 함께 확인했다.

```text
[R6 COST] partner response bytes=786730 renderMs=4003.84 rows=5587
Test Files  25 passed (25)
Tests       171 passed (171)
```

## 5. 파일별 diff (`+N/-M`)

`git diff --numstat` 기준이다. 보고서 파일은 새 파일이라 삭제는 0이다.

| 파일 | 추가 | 삭제 |
|---|---:|---:|
| `clients/desktop/playwright/ac-825-s6-messenger-chip/ac-825-s6-messenger-chip.spec.ts` | +12 | -3 |
| `docs/dev-reports/2026-08-02-1049-r7-playwright-gate-fix.md` | +74 | -0 |
| **합계** | **+86** | **-3** |

## 6. 새 파일 경로 목록

- `docs/dev-reports/2026-08-02-1049-r7-playwright-gate-fix.md`

기존 보고서 `docs/dev-reports/2026-08-02-1049-r6-green-and-cost.md`는 덮어쓰지 않았다.
