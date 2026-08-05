# R21 — orphan RED 테스트 제거 라운드 보고서

- 일자: 2026-08-05
- 대상: PR #1063 / `fix/1062-line-input-ux`
- 목적: 제품 코드가 `origin/main`과 동일한 상태에서, 분리된 편집 라우트 사양을 단정하는 잔존 테스트를 제거한다.

## 1. 배경

R20 결정으로 편집 라우트(`/sales/:id/edit`)를 본 PR의 범위에서 분리했다. 따라서 `CollaborativeSlipInput.tsx` 제품 코드는 `origin/main`과 동일해야 하며, R15가 추가한 draft 행 격리 테스트만 현재 제품 계약과 맞지 않는 고아 RED 테스트로 남아 있었다.

R21의 범위는 `clients/desktop/src/renderer/components/collab/CollaborativeSlipInput.test.tsx`를 `origin/main`과 동일한 내용으로 복원하는 것이다. 편집 라우트, `SlipDetailPage.tsx`, `CollaborativeSlipInput.tsx`, `SlipFormPage.tsx`의 제품 변경은 범위에 포함하지 않았다.

## 2. 착수 전 전제 검증

지정된 세 명령을 먼저 실행했다.

```text
git -C . diff --stat origin/main HEAD -- clients/desktop/src/renderer/components/collab/
 .../collab/CollaborativeSlipInput.test.tsx         | 28 ++++++++++++++++++++++
 1 file changed, 28 insertions(+)

git -C . diff --stat origin/main HEAD -- clients/desktop/src/renderer/routes/SlipDetailPage.tsx
(출력 없음)

git -C . diff origin/main HEAD -- clients/desktop/src/renderer/components/collab/CollaborativeSlipInput.tsx
(출력 없음)
```

전제는 참이었다.

- `CollaborativeSlipInput.tsx`: `origin/main` 대비 0 diff
- `SlipDetailPage.tsx`: `origin/main` 대비 0 diff
- `collab/` 변경: 대상 테스트 파일의 R15 추가분 28줄뿐

## 3. 조치 및 단정 표면 확인

수정 파일은 테스트 파일 하나다.

```text
clients/desktop/src/renderer/components/collab/CollaborativeSlipInput.test.tsx
```

제거한 변경은 다음 두 가지다.

1. 규격·수량·단가·적요 draft 입력 뒤 Y.Doc 행 수가 0이어야 한다는 신규 테스트 블록 28줄을 제거했다. 따라서 네 필드 각각의 입력 직후 단정과 반복 종료 후 최종 행 수 단정은 더 이상 이 PR에서 가능하지 않다.
2. 기존 Yjs 입력 테스트의 행 선행 생성 호출 1줄을 제거했다. 이제 해당 테스트는 빈 provider에서 시작해 입력 후 Yjs 필드 쓰기, `onValueChange`, last-edit 전송, 원격 사용자명 표시를 기존 main 계약대로 확인한다. 행 선행 생성에 의존하는 lineId 계약 테스트의 기존 호출 두 개는 유지했다.

새로 추가된 명시적 제품 동작 단정은 없다. R21은 R15의 draft 격리 단정을 제거하고, 기존 main 계약의 입력 쓰기 단정을 복원하는 테스트 정합성 변경이다.

수정 후 다음 확인이 성공했다.

```text
git diff --exit-code origin/main -- clients/desktop/src/renderer/components/collab/CollaborativeSlipInput.test.tsx
Exit code: 0

git diff --exit-code origin/main -- clients/desktop/src/renderer/components/collab/CollaborativeSlipInput.tsx clients/desktop/src/renderer/routes/SlipDetailPage.tsx
Exit code: 0
```

제품 코드와 `SlipFormPage.tsx`는 수정하지 않았다. `git add`, `git commit`, `git push`도 실행하지 않았다.

## 4. 제거 식별자 전수 조사

Git 추적 파일 기준 전수 검색과 의존성·생성물을 제외한 워크트리 검색을 수행했다.

### 4.1 R15 draft 격리 테스트 식별자

테스트와 스펙에는 남아 있지 않았다. 기존 개발 보고서의 역사적 참조만 남아 있다.

```text
docs/dev-reports/2026-08-05-1062-r15-draft-isolation-complete.md:47
docs/dev-reports/2026-08-05-1062-r15-draft-isolation-complete.md:53
docs/dev-reports/2026-08-05-1062-r15-draft-isolation-complete.md:131
```

### 4.2 행 선행 생성 호출

제거한 위치의 호출은 사라졌다. 동일한 인자 형태가 남은 두 곳은 모두 기존 lineId 계약 테스트의 행 선행 생성이며, 제거 대상과 다른 테스트다.

```text
clients/desktop/src/renderer/components/collab/CollaborativeSlipInput.test.tsx:156
clients/desktop/src/renderer/components/collab/CollaborativeSlipInput.test.tsx:358
```

워크트리 전체의 나머지 행 추가 호출은 다음 기존 계약·문서 참조였다.

```text
clients/desktop/src/renderer/realtime/createCoeditProvider.test.ts:719
clients/desktop/src/renderer/realtime/createCoeditProvider.test.ts:740
clients/desktop/src/renderer/realtime/createCoeditProvider.test.ts:760
clients/desktop/src/renderer/realtime/createCoeditProvider.test.ts:761
clients/desktop/src/renderer/realtime/createCoeditProvider.test.ts:838
clients/desktop/src/renderer/realtime/createCoeditProvider.test.ts:856
clients/desktop/src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx:383
docs/dev-reports/2026-08-05-1062-r16-sol-reconvergence.md:29
docs/superpowers/specs/2026-07-01-coedit-slip-harden-lineid.md:20
```

`CollaborativeSlipInput`을 직접 import하거나 source 계약을 직접 읽는 단위 테스트는 아래 5개로 확인했고 모두 실행했다. Playwright 검색 결과는 제품 사용 설명 주석뿐이었다.

## 5. 검증 원문

요청된 명령은 다음 순서로 실행했다.

```powershell
cd clients/desktop
npx vitest run src/renderer/components/collab/CollaborativeSlipInput.test.tsx
npm run typecheck
npx vitest run          # 전체 단위 테스트 — CI 와 같은 축
```

대상 테스트 원문 요약:

```text
 Test Files  1 passed (1)
      Tests  11 passed (11)
```

변경 파일을 참조하는 5개 테스트의 추가 실행:

```text
 Test Files  5 passed (5)
      Tests  167 passed (167)
```

최초 `npm run typecheck`는 로컬 design-system 파생물 신선도 가드에서 중단됐다.

```text
[로컬 파생물 신선도 확인 실패] 검증 결과를 코드 결함으로 해석하지 마십시오.
- file: 의존 design-system dist이(가) 소스보다 오래됐습니다: ..\web\design-system\dist\index.d.ts
산출물=2026-08-04T01:03:55.412Z, 최신 소스=..\web\design-system\src\components\DataGrid\DataGrid.tsx (2026-08-04T23:42:48.959Z)
코드 오류로 단정하지 말고 먼저 cd ..\web\design-system; npm run build
```

안내된 `clients/web/design-system` 빌드를 실행한 뒤 `npm run typecheck`를 재실행했고 종료 코드 0이었다. real-QA scope 검사도 `pass 50`, `fail 0`으로 종료됐다.

전체 Vitest의 첫 실행에는 변경과 무관한 `CodefImportScopeForm.test.tsx:367`의 `codef-scope-conflict` 대기 실패가 있었다. 동일 코드에서 `npx vitest run`을 재실행한 최종 결과는 다음과 같다.

```text
 Test Files  198 passed (198)
      Tests  1752 passed (1752)
```

## 6. 후속 이슈로 넘긴 사양

R15의 draft 행 격리 사양(규격·수량·단가·적요 입력만으로 Y.Doc 행을 생성하지 않는 동작)은 `/sales/:id/edit` 편집 라우트 후속 이슈로 이관한다. 해당 라우트 제품 코드와 저장·재진입 계약이 다시 범위에 들어올 때, 그때의 실제 제품 계약에 맞춰 테스트를 별도로 복원한다.

## 7. 신규 파일

```text
docs/dev-reports/2026-08-05-1062-r21-orphan-red-test-removal.md
```
