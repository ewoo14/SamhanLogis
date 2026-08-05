# R24 — #1062 Playwright strict mode locator 수정 보고서

## 상태

`DONE_WITH_CONCERNS`

- mock 회귀 hard gate, 단위 테스트, typecheck는 통과했다.
- 실 QA 스펙은 `REAL_JWT`가 없는 환경에서 안전하게 차단되었으며, 사용자 지시의 DB 쓰기 금지 범위상 JWT를 확보하거나 실행하지 않았다.
- 제품 코드와 DB에는 변경이 없다.

## 1. `새 판매전표` heading 2개의 원인 판별

결론은 **R23이 heading을 두 개로 만든 것이 아니다**. 화면에는 원래 다음 두 제목이 함께 있었다.

1. 공통 레이아웃 헤더: `clients/desktop/src/renderer/components/AppLayout.tsx:1690`의
   `<h2 data-testid="header-page-title">`
2. 전표 작성 본문 제목: `clients/desktop/src/renderer/routes/SlipFormPage.tsx:574,578,1208`의
   `titleLabel = '새 판매전표'` → `usePageTitle(titleLabel)` 및
   `<h2 className="sfp-page-title">`

`usePageTitle()`가 공통 헤더의 제목을 갱신하고, 본문은 별도 `h2`를 렌더링하므로
`getByRole('heading', { name: '새 판매전표' })`는 두 요소를 찾는 것이 정상이다.

견적서도 동일한 구조다. `EstimateFormPage.tsx:669`의 `usePageTitle('견적서 작성')`와
`EstimateFormPage.tsx:1597`의 본문 `h3`가 공존한다.

R23 변경 확인:

- `git diff origin/main -- clients/desktop/src/renderer/routes/SlipFormPage.tsx`에서
  제목 관련 변경은 확인되지 않았다.
- `git show --format= --unified=0 HEAD -- clients/desktop/src/renderer/routes/SlipFormPage.tsx`의
  R23 변경은 자동 빈행/라인 추가 동작과 `+ 라인 추가` 버튼 제거였다.
- 따라서 제품의 중복 heading은 유지하고, 실제 구조에 맞춰 스펙 locator만 좁히는 것이 맞다.

## 2. 조치

다음 7개 스펙의 페이지 준비 locator를 중복되지 않는 공통 헤더 test id로 바꿨다.

- `ac-2-product-autocomplete.spec.ts`
- `ac-3-partner-autocomplete.spec.ts`
- `ac-b1b-ds-a11y-layout.spec.ts`
- `bundle-set-options.spec.ts`
- `rc9-line-input-lookups.spec.ts`
- `slip-form-v20-matching.spec.ts`
- `slip-cutoff-real-qa.spec.ts`

변경 형태는 다음과 같다.

```ts
await expect(page.getByTestId('header-page-title'))
  .toHaveText('새 판매전표')
```

견적서 경로는 동일하게 `toHaveText('견적서 작성')`를 사용한다. 본문 heading을 숨기거나
제품 화면을 변경하지 않았다.

R23의 `ProductAutocomplete`에서 `resultSelectionMode={null}`이 `"single"`로 바뀐 결과,
2건 이상 검색은 inline listbox가 아니라 `품목 검색 결과` 선택 dialog가 되는 것도 함께
실제 DOM에 맞췄다.

- AC-2의 복수 결과 `AJ` 시나리오는 dialog/table/radio/`선택 확정` 경로를 검증한다.
- 단일 결과 시나리오는 기존 inline listbox 경로를 유지한다.
- UUID 비공개 검증은 dialog 텍스트, `outerHTML`, radio `aria-label`, 전체 body에 적용한다.
- B1-B의 품목명 badge 경로는 복수 결과인 `에어컨` 대신 단일 결과인 `10HP`를 사용한다.
  복수 결과가 modal로 바뀌는 조합 자체는 AC-2에서 검증한다.

## 3. 자기 표면 닫기 — 새로 가능해진 조합과 실제 실행

| 조합 | 확인한 경로 | 결과 |
|---|---|---|
| 공통 헤더 + 본문 heading 공존 | AC-2/AC-3 신규 판매전표 진입 | 고유 `header-page-title`로 통과 |
| 품목 복수 결과 | `AJ` → 선택 dialog → radio 확정 | 통과 |
| 품목 단일 결과 | `AJ040` 등 → inline listbox 선택 | 통과 |
| 거래처 lookup | AC-3 후보/blur/빈 결과 | 통과 |
| DS a11y/layout | 360px·390px 모바일 및 1440px desktop | 통과 |
| bundle 옵션 | SINGLE/BUNDLE/mixed 및 견적서 lookup | 통과 |
| RC9 권한 조합 | 견적서 작성 + lookup 버튼 비노출 | 통과 |
| V20 입력/매칭 | 신규 전표 필드, 후보, 저장 payload | 통과 |

R23 CI 실패 전체는 다음 28건이었다: AC-2 7건, AC-3 7건, B1-B 3건,
bundle 8건, RC9 1건, V20 2건. 일부 AC-2/AC-3만 고치지 않고 이 계열 전체를
수정하고 mock hard gate 전체를 실행했다.

## 4. 전수 grep

워크트리 전체 `clients/desktop/playwright`에서 제목과 결합된 heading locator를 검색했다.

```text
rg -n -g '*.spec.*' "getByRole.*(새 판매전표|견적서 작성)" clients/desktop/playwright
NO MATCH: 제목용 getByRole heading locator
```

`getByRole('heading'` 자체는 다른 제목을 검증하는 100건이 남아 있지만,
`새 판매전표`, `새 견적서`, `견적서 작성`과 결합된 기존 locator는 없다.
같은 제목 문자열의 잔여 결과는 모두 `header-page-title` assertion, 테스트명 또는
주석이다.

## 5. 검증 원문

### 변경한 mock 스펙

```powershell
.\node_modules\.bin\playwright.cmd test playwright/ac-2-product-autocomplete/ac-2-product-autocomplete.spec.ts playwright/ac-3-partner-autocomplete/ac-3-partner-autocomplete.spec.ts playwright/ac-b1b-ds-a11y-layout.spec.ts playwright/bundle-set-options/bundle-set-options.spec.ts playwright/rc9-line-input-lookups/rc9-line-input-lookups.spec.ts playwright/slip-form-v20/slip-form-v20-matching.spec.ts --reporter=line
```

```text
Running 38 tests using 1 worker
38 passed (1.4m)
```

### Desktop Playwright (mock 회귀 hard gate)

```powershell
.\node_modules\.bin\playwright.cmd test --reporter=line
```

```text
Running 655 tests using 1 worker
655 passed (15.2m)
```

### 단위 테스트

```powershell
npx vitest run
```

```text
199 files / 1759 tests passed
Exit code: 0
```

중간에 동일 명령의 한 실행에서 R24와 무관한
`CodefImportScopeForm.test.tsx`의 `codef-scope-conflict` 대기 1건이 일시 실패했으나,
해당 파일 단독 실행은 `1 passed / 42 passed`였고 전체 명령 재실행은 위와 같이 통과했다.

### typecheck

```powershell
npm run typecheck
```

```text
Exit code: 0
@samhan/desktop@0.1.0 typecheck
tsc -p tsconfig.node.json --noEmit
tsc -p tsconfig.web.json --noEmit
npm run typecheck:real-qa
pass 2
fail 0
```

### 실 QA 스펙의 안전한 차단 확인

```powershell
.\node_modules\.bin\playwright.cmd test --config=playwright.real-qa.config.ts playwright/slip-outbound-cutoff-s3/slip-cutoff-real-qa.spec.ts --reporter=line --timeout=90000
```

```text
[BLOCKED] REAL_JWT 환경변수 없음. 실 JWT 필수.
[BLOCKED] REAL_JWT 환경변수 없음.
[BLOCKED] REAL_JWT 없음.
[D1] REAL_SALES_JWT 없음 — dev_sales JWT 필요, SKIP
3 failed
1 skipped
4 did not run
```

이는 애플리케이션 실패가 아니라 스펙의 인증 환경 guard이며, 해당 실 QA에는 마감시간
수정/전표 POST가 포함되어 있으므로 DB 쓰기 금지 조건에서 더 진행하지 않았다.

추가로 `git diff --check`도 통과했다.

## 6. 보지 않은 것 / 범위 밖

- `/sales/:id/edit` 및 후속 이슈 #1071
- `docs/handoff/`와 다른 트랙 파일
- 실 JWT를 이용한 real-QA 재실행
- 컨테이너 재배포, DB 쓰기
- `git add`, `git commit`, `git push`

