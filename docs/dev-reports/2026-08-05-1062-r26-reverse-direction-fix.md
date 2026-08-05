# PR #1063 R26 역방향 결함 수정 보고서

> 수정 전 RED 원문을 먼저 고정한다. 아래 RED-A/RED-B는 R26 착수 시점의
> 회귀 방지 기준이며, 수정 후 지정된 검증 명령의 원문과 대조한다.

## 수정 전 RED 원문

```text
RED-A  되돌리면 안 되는 것
  A1  R22 5건이 그대로 닫혀 있다 (포커스로 품목 해제 안 됨 · 모달 · 규격 열 · 미저장 행 보존 · 버튼 없음)
  A2  협업 편집 중 삭제 버튼은 여전히 비활성
  A3  읽기 전용 화면에 빈행이 생기지 않는다
  A4  최소행 규칙 유지 (전표 1 · 견적 1 · 분개 2 · 재고이동 1)
  A5  DailyClosingPage · BlockedPartnersPage 의 draft-vs-selection 비교가 유지된다
  A6  빈행이 저장되지 않는다 (개발책임자 결정)

RED-B  결함이 재발하지 않는다
  B1  네 화면 각각에서 trailing 빈행을 삭제한 뒤에도
      기존 입력을 건드리지 않고 다음 라인을 추가할 수 있다
  B2  확정값 위에 "AJ" 를 입력하면 "AJ" 가 그대로 남는다 (첫 글자 소실 없음)
  B3  입력을 비우고 blur 하면 선택이 해제된다
  B4  견적 버전 복원 결과가 stale Y.Doc 에 덮이지 않는다
  B5  동시에 — 미저장 입력 행이 참가자 진입으로 사라지지 않는다 (R23 발견 4)
```

## 1. 결함별 진단

진단은 먼저 통독한 R25 보고서와 지정 좌표의 현재 코드에서 확정했다.

### 발견 1 — 삭제가 다음 입력 경로를 끊음

`appendBlankRowIfLastChanged`는 마지막 행의 실제 내용 변경 때만 빈행을 추가한다.
반면 `removeLinePreservingMinimum`은 삭제 후 `minimumRows`까지만 채우고 끝내므로,
`[확정행, trailing 빈행]`에서 trailing 빈행을 지우면 확정행만 남는다. 최소행 1을
만족하지만 사용자가 다음 라인을 만들 입력행은 없다. 네 삭제 경로에도 삭제 직후
trailing 보장이 없었다.

### 발견 2 — 공용 자동완성의 draft와 controlled selection 경합

`AsyncAutocomplete`는 확정값 재포커스에서 draft를 비운다. 첫 실제 입력 시
`onInputCommitChange(false)`를 발화하는 소비자는 controlled value를 `null`로 바꾸는데,
그 `null`을 외부 동기화로 처리한 effect가 현재 draft를 `selectedLabel`로 덮었다.
따라서 `AJ`의 첫 글자가 사라졌다. 또한 빈 draft blur는 선택값이 있어도
`onChange(null)` 없이 예전 label을 복원했다. 이 동작은 공용 컴포넌트의 19개 소비자에
공통 영향을 준다.

### 발견 3 — R23의 미저장 보존 조건과 버전 복원의 충돌

R23의 `providerLineCount < serverLineCount` 조건은 같은 서버 세대에서 참가자가
진입할 때 앞선 Y.Doc을 full-seed하지 않아 미저장 입력을 보존한다. 그러나 서버
revision 복원으로 `estimate.version`과 서버 라인 집합이 바뀐 뒤에는, 과거 세대의
앞선 Y.Doc도 단순히 “현재 협업 문서가 앞섰다”고 오인한다. 삭제된 라인의 내용이
`lineId=null` 신규 입력으로 되살아나는 것이 역방향 결함이다.

## 2. 불변식

수정 전 RED-A/RED-B를 통과한 뒤 다음 불변식을 구현 기준으로 고정했다.

- 전표 1, 견적 1, 분개 2, 재고이동 1의 최소행은 유지한다.
- 네 화면 모두 삭제 후 기존 확정 데이터는 그대로 두고 trailing 입력행을 보장한다.
- 협업 편집 중 삭제 비활성, 읽기 전용의 행 추가 불가, 빈행 저장 제외를 유지한다.
- 공용 자동완성에서 확정값 교체 시 입력 draft를 보존하고, 빈 draft blur 시 선택을
  해제한다. DailyClosingPage·BlockedPartnersPage의 draft-vs-selection 비교는
  유지한다.
- 견적 provider는 내부 `estimateServerVersion` 세대를 기록한다. 같은 세대의
  앞선 Y.Doc은 보존하고, version 복원으로 세대가 달라진 stale Y.Doc만 server
  seed로 수렴한다.

## 3. 조치

### 발견 1

- `autoBlankRow.ts:41-56`의 `removeLinePreservingMinimum`에 화면별
  `isConfirmed` 판정을 추가하고, 최소행을 채운 뒤
  `ensureTrailingBlankRow(next, emptyRow, isConfirmed)`를 호출하도록 했다.
- 다음 네 삭제 경로를 공통 helper로 연결했다.

  - `SlipFormPage.tsx:710` — 최소 1행, `productId` 확정 판정
  - `EstimateFormPage.tsx:1241` — 최소 1행, `productId` 확정 판정
  - `JournalFormPage.tsx:76,396` — 최소 2행, account/debit/credit/partner/note 중
    하나라도 있는 행을 확정행으로 판정
  - `TransferFormPage.tsx:104` — 최소 1행, `productId` 확정 판정

  첫·중간·마지막 삭제를 공통 helper 회귀 테스트로 추가했고, 기존 확정행 객체를
  수정하지 않는 것도 단언했다. `+ 라인 추가` 버튼, 협업 삭제 비활성, 읽기 전용
  라우트는 변경하지 않았다.

### 발견 2

- `AsyncAutocomplete.tsx:228-231`에서 후보 확정 시 `lastTypedDraftRef`를 비워
  다음 외부 clear가 이전 검색어를 복원하지 않게 했다.
- `AsyncAutocomplete.tsx:266-278`에서 선택값이 있는 빈 draft blur는 실제
  `onChange(null)`을 호출하고 draft를 빈 문자열로 유지한다. 이미 `value=null`인
  입력에는 더미 callback을 발화하지 않는다.
- `AsyncAutocomplete.tsx:433-450`에서 사용자가 입력 중 소비자가 controlled value를
  `null`로 바꾸는 경우는 외부 동기화로 간주하지 않고 현재 draft/surface를 보존한다.
  따라서 `AJ`가 그대로 남는다. 명시적인 후보 선택과 외부 selection 교체 시에는
  기존 동기화·정리 동작을 유지한다.
- R26 회귀 테스트로 `AJ` 첫 글자 보존과 빈 blur 해제를 추가했다. R23의
  DailyClosingPage 및 BlockedPartnersPage 테스트도 별도로 통과시켰다.

### 발견 3

- `EstimateFormPage.tsx:177,881-917`에 화면 미노출 내부 헤더
  `estimateServerVersion`을 추가했다.
- 편집 진입 시 서버 `estimate.version`과 provider marker를 비교한다. provider가
  비었거나 서버보다 뒤처졌거나 marker가 다른 경우에만
  `seedEstimateCoeditProvider`를 실행한다. marker가 같은 앞선 provider는 그대로
  보존한다.
- marker가 없던 구 Y.Doc도 미저장 입력 보존을 우선하고 현재 version을 기록한다.
  이후 새 코드로 정상 진입한 뒤 revision 복원이 발생하면 기록된 이전 marker와
  새 `estimate.version`이 달라져 stale 문서가 server seed로 수렴한다.
- `EstimateFormPage.coedit.test.tsx:555`에 version 변경 시 재시드, 같은 version
  선행 문서 보존, marker 없는 R23 미저장 입력 보존을 각각 단언했다.

## 4. GREEN 원문

아래는 지정 명령 및 변경 파일 참조 테스트의 실행 결과다.

### 대상 단위/계약 테스트

```text
cd clients/desktop
npx vitest run src/renderer/utils/autoBlankRow.test.ts src/renderer/routes/line-input-ux-r23.contract.test.ts src/renderer/routes/EstimateFormPage.coedit.test.tsx
3 files passed, 44 tests passed

cd clients/web/design-system
npx vitest run src/components/AsyncAutocomplete/AsyncAutocomplete.test.tsx
1 file passed, 23 tests passed

cd clients/desktop
npx vitest run src/renderer/routes/EstimateFormPage.coedit.test.tsx src/renderer/routes/line-input-ux-r23.contract.test.ts
2 files passed, 36 tests passed

npx vitest run src/renderer/utils/autoBlankRow.test.ts src/renderer/routes/line-input-ux-r23.contract.test.ts
2 files passed, 13 tests passed

npx vitest run src/renderer/routes/DailyClosingPage.test.tsx
1 file passed, 27 tests passed
npx vitest run src/renderer/routes/admin/BlockedPartnersPage.test.tsx
1 file passed, 4 tests passed
```

### 지정 전체 Vitest

```text
cd clients/desktop
npx vitest run
Exit code: 0
```

데스크톱 전체 출력의 모든 테스트 파일은 `✓`였고 실패 블록은 없었다.

```text
cd clients/web/design-system
npx vitest run
Test Files  1 failed | 25 passed (26)
Tests       1 failed | 178 passed (179)
FAIL src/components/PartnerAutocomplete/PartnerAutocomplete.cost.test.tsx
  Test timed out in 5000ms.
  [R6 COST] partner response bytes=786730 renderMs=9599.64 rows=5587
Exit code: 1
```

위 실패는 변경 파일과 무관한 5초 비용 측정 테스트의 환경 시간 초과다. 같은
소스에 다음 재검증을 실행했고 전체는 통과했다.

```text
npx vitest run --testTimeout=30000
Test Files  26 passed (26)
Tests       179 passed (179)
Exit code: 0
```

### 지정 Playwright

```text
cd clients/desktop
npx playwright test playwright/ac-2-product-autocomplete playwright/ac-3-partner-autocomplete playwright/rc9-line-input-lookups playwright/1062-line-input-ux
Running 23 tests using 1 worker
23 passed (42.7s)

npx playwright test playwright/sp-05-crud-surface/sp-05-crud-surface.spec.ts
Running 3 tests using 1 worker
3 passed (5.8s)
```

### typecheck 및 산출물

```text
cd clients/web/design-system
npm run build
Vite build completed successfully

cd clients/desktop
npm run typecheck
command timed out after 183612 milliseconds (exit code 124)

npx tsc -p tsconfig.node.json --noEmit
Exit code: 0
npx tsc -p tsconfig.web.json --noEmit
Exit code: 0
```

`npm run typecheck`는 소스 오류를 출력하지 않고 `typecheck:real-qa` 단계에서
시간 제한에 도달했다. 파생 산출물 freshness gate를 먼저 통과시키기 위해 실행한
design-system build는 성공했고, node/web TypeScript 두 프로젝트의 직접 검사는
통과했다. 마지막으로 `git diff --check`도 exit code 0이었다.

## 5. 19개 자동완성 인스턴스 영향 확인

워크트리 전체에서 변경 식별자와 문서·테스트·QA 로그까지 `rg`로 조사했다
(생성 의존성 `node_modules`, `dist`, `out`, `.git`만 제외).

```text
rg -n --glob '*.tsx' '<(ProductAutocomplete|PartnerAutocomplete)\b' clients/desktop/src/renderer
in_scope_instance_count=19
in_scope_file_count=14

rg -n --glob '*.tsx' --glob '!**/*.test.tsx' 'onInputCommitChange' clients/desktop/src/renderer
production_callback_count=4
```

19개는 R25가 산정한 범위대로 편집 route 후속 이슈 #1071의
`SlipDetailPage.tsx` 2개 인스턴스를 제외한 14개 소스 파일이다. 전체 JSX 검색은
테스트 fixture와 #1071 제외 화면을 포함해 23개/16개 파일로 보이지만, 이번 변경
범위의 소비자는 19개/14개 파일이다. 그중 callback 소비자는 전표 품목 2개,
DailyClosing 1개, BlockedPartners 1개이며 나머지 15개도 공용 component의
blank-blur 해제 계약을 받는다.

전수 검색에서 확인한 변경 식별자는 `removeLinePreservingMinimum`,
`ensureTrailingBlankRow`, `isJournalLineConfirmed`,
`estimateServerVersion`, `lastTypedDraftRef`이다. 검색 결과는 구현 파일뿐 아니라
관련 Vitest/Playwright 계약과 기존 dev-report/QA 로그에도 닿았으며, 누락된 소비자
또는 mock 계약은 발견하지 못했다.

## 6. 자기 표면 닫기 3절

### 6.1 네 화면 × 삭제 위치 × 협업/읽기 전용

| 화면 | 첫 행 삭제 | 중간 행 삭제 | 마지막/trailing 행 삭제 | 협업 편집·읽기 전용 |
|---|---|---|---|---|
| 전표 | 확정 후속 행과 trailing 빈행을 보존 | 기존 입력행 순서를 보존 | 빈행을 지워도 최소 1행과 다음 입력행을 복원 | 협업 삭제 버튼은 계속 비활성, 읽기 전용은 삭제·추가 경로 없음 |
| 견적 | 최소 1행, 기존 확정 품목 불변 | 확정 품목과 입력행 불변 | version seed와 무관한 일반 삭제에서도 trailing 입력행 복원 | 동일하게 삭제 비활성/행 추가 불가 |
| 분개 | 최소 2행을 유지 | 계정·금액·메모가 있는 행을 건드리지 않음 | 최소 2행을 채운 뒤 trailing 빈행을 보장 | 동일하게 삭제 비활성/행 추가 불가 |
| 재고이동 | 최소 1행과 기존 데이터 유지 | 기존 라인 순서 유지 | trailing 빈행 삭제 후 다시 입력 가능 | 동일하게 삭제 비활성/행 추가 불가 |

일반 편집의 세 위치는 `autoBlankRow.test.ts`에서 실제 helper 호출로 첫·중간·마지막
삭제를 밟았고, 네 route 모두 helper 계약을 `line-input-ux-r23.contract.test.ts`로
확인했다. 삭제 대상이 확정행이어도 다른 업무 데이터를 지우거나 고치지 않고,
삭제된 라인만 제거한 뒤 필요할 때 새 빈행을 만든다. 저장 payload의 의미 있는 행
필터는 바꾸지 않아 A6도 유지된다.

### 6.2 변경 식별자 전수 조사

다음 검색을 워크트리 전체에 실행했다.

```text
rg -n --hidden --glob '!.git/**' --glob '!node_modules/**' --glob '!dist/**' --glob '!out/**' \
  'removeLinePreservingMinimum|ensureTrailingBlankRow|estimateServerVersion|isJournalLineConfirmed|lastTypedDraftRef' .
```

결과에는 네 route, 공용 helper, AsyncAutocomplete, 회귀 테스트, Playwright/문서
참조가 모두 포함됐다. `SlipDetailPage.tsx`와 `CollaborativeSlipInput`은 소스와
diff를 건드리지 않았고 #1071 범위를 유지했다.

### 6.3 변경 파일 참조 테스트

변경 helper/route/provider/autocomplete 직접 테스트와 해당 소비자 테스트를 실행했고,
마지막으로 데스크톱 전체 Vitest 및 지정 Playwright 게이트도 실행했다. 설계시스템
전체 Vitest의 단독 실패는 R6 비용 측정 timeout뿐이며, 30초 재실행에서는 179/179가
통과했다.

## 7. 안 본 것

- `/sales/:id/edit`, `SlipDetailPage.tsx`, `CollaborativeSlipInput` 및 후속 이슈
  #1071 범위는 확인만 했고 수정하지 않았다.
- 다른 트랙 #1057, #1061, #1045, #1066의 파일은 수정하지 않았다.
- DB/API 쓰기가 필요한 실제 견적 revision 복원·재저장, 신규 전표/견적/분개/
  재고이동 저장은 실행하지 않았다.
- 컨테이너 재배포, 외부 환경 smoke test, git add/commit/push는 실행하지 않았다.
- 데스크톱 `npm run typecheck`의 `typecheck:real-qa`는 지정 시간 안에 끝나지
  않았으며, 직접 tsc 두 프로젝트 검사로 보완했다.
- 설계시스템 기본 5초 비용 측정 timeout은 테스트 코드 수정 없이 30초 제한으로
  재검증했다.
- `docs/handoff/` 및 워크트리 밖 파일은 건드리지 않았다.

## 신규 파일

- `docs/dev-reports/2026-08-05-1062-r26-reverse-direction-fix.md`
