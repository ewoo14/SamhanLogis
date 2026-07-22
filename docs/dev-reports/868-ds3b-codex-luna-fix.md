# PR #891 / #868 DS-3b — CODEX LUNA 5.6 fix 보고서

## 결론

제품 결함을 새로 발견하지 않았고, SOL 적대검증 범위를 현재 PR의 회귀 방어선으로 고정했다. 제품 코드 변경은 print 주석 1건뿐이며, 테스트 결정성 보강은 Playwright 스펙에만 반영했다.

## 항목별 RED / GREEN

### 1. 경계값 회귀 스위트 — mutation RED / GREEN

- `playwright/ac-868-document-template-editor.spec.ts`에 1100, 1099, 700, 699, 640, 639, 320px을 모두 포함했다.
- 각 viewport에서 편집 시작 → 문구 추가 → 요소 선택 → 문구 입력 → x/y 좌표 변경 → 굵게 변경 → 요소 삭제 → 양식명 변경 → 저장 → 목록 복귀를 완주한다.
- 목록 복귀 후 실제 ARIA role tree를 검사한다: `table → rowgroup → row → columnheader/cell`.
- 조작 전 `editorScrollWidth/clientWidth`, 좌우 경계, inspector bounding-box, `elementFromPoint()` hit-test를 검사한다. 이동은 `page.mouse.wheel()`만 사용한다.

뮤테이션 결과:

| 임시 뮤테이션 | 기대한 RED | 결과 |
|---|---|---|
| `.document-template-editor-grid { min-width: 824px !important }` | `editorScrollWidth 824 > clientWidth 812` 수평 clipping | RED |
| viewport 전체 fixed overlay 삽입 | inspector `elementFromPoint()` hit-target false | RED |
| 1099px 이하 scroll ancestor에 `height:700px; overflow:hidden` | wheel 뒤 inspector hit-target false | RED |

세 뮤테이션은 모두 테스트 실행 후 제거했다. 스펙 원복 SHA-256은 매번 기준값과 동일했다.

`playwright/ac-868-document-template-editor.spec.ts` 기준 SHA-256:

`E677350AD4FDB510497E28D4BE25EE70BA95CA6B06E03477B62ECAF54EEB4892`

GREEN:

`H-B boundary` 1 test passed, 7개 viewport 전체 경로, 7.8s.

### 2. H-B wheel 결정성 — RED 조사 / GREEN

- 기존 H-B는 이 세션의 수정 전 기준선에서 8/8 통과했다. 따라서 현재 환경에서는 SOL이 기록한 간헐 RED(복원 상태 15/16)를 새로 재현하지 못했다.
- 테스트를 수정하는 과정에서 새 boundary helper가 desktop에서 inspector가 `y=-66`인데도 양의 wheel만 반복해 `y=-1194`로 지나치는 테스트 자체 RED가 발생했다. 원인은 제품이 아니라 helper의 방향성 가정이었다.
- 수정 후 화면 위 대상에는 음의 wheel, 화면 아래 대상에는 양의 wheel을 사용한다.
- 고정 sleep은 사용하지 않았다. `requestAnimationFrame` 기반 연속 3회 안정화 조건만 사용하며, 실제 `page.mouse.wheel()`과 `elementFromPoint()` 판정은 유지했다.

반복 GREEN:

`npx playwright test playwright/ac-868-document-template-editor.spec.ts --grep "H-B:" --repeat-each=16 --reporter=line`

`16 passed (35.7s)`

### 3. print 실제 가시성 — mutation RED / GREEN

- H-A를 `page.emulateMedia({ media: 'print' })` 기반으로 강화했다.
- 제목, 폼, 팔레트, 캔버스, 속성 패널, footer, 라이브 미리보기 제목은 실제 `toBeHidden()`을 검사한다.
- `.paper`는 실제 visible 상태, computed `display/visibility`, 양수 폭, 본문 제목을 검사한다.
- `.no-print` 전역 규칙을 임시로 `display:block !important`로 바꿨을 때 제목이 `visible`로 관찰되어 RED가 났다.
- CSS 원복 후 H-A GREEN: `1 passed (3.7s)`.

임시 global.css 원복 SHA-256:

`1899285918C42F810E8ECC34FAE1A617272A698184F31BDE3297EB715C17ACEE`

### 4. 주석 정합성 — GREEN

기존 주석은 print에서 mm 크기 규칙을 “그대로 사용”한다고 설명했지만 구현은 `width:210mm; max-width:none`을 재선언했다. 주석을 다음 실제 동작으로 수정했다.

> print에서는 반응형 화면 폭을 덮어쓰고 공용 paper의 A4 세로 mm 크기를 복원한다.

## 변경 파일

- `clients/desktop/playwright/ac-868-document-template-editor.spec.ts`
  - 안정화 helper
  - 7개 경계값 전체 경로
  - 실제 print 가시성
  - ARIA role tree
  - geometry / hit-test 방어선
- `clients/desktop/src/renderer/components/documentTemplate/documentTemplateEditor.css`
  - 구현과 일치하도록 print 주석만 수정
- `docs/dev-reports/868-ds3b-codex-luna-fix.md`
  - 본 보고서

## 최종 검증 출력

```text
npm run typecheck
Exit code: 0

npx vitest run
Test Files  138 passed (138)
Tests       1085 passed (1085)

npx playwright test playwright/ac-868-document-template-editor.spec.ts --reporter=line
Running 9 tests using 1 worker
9 passed (13.8s)

npx playwright test playwright/ac-868-document-template-editor.spec.ts --grep "H-B:" --repeat-each=16 --reporter=line
Running 16 tests using 1 worker
16 passed (35.7s)
```

## CI 시간 영향 및 스위트 분할 근거

- 기존 좁은 파일 기준선은 8 tests / 8.0s였다.
- 최종 좁은 파일은 9 tests / 13.8s였다. 관찰된 증분은 약 5.8s다.
- 7개 viewport를 7개 test/browser 기동으로 나누지 않고 단일 test 안에서 순차 실행했다. 따라서 브라우저 기동·mock 초기화 비용은 1회이며, hard gate 증가분은 약 6~10초로 추정한다.
- 줄인 범위는 없다. 7개 경계 모두에서 전체 편집 경로, geometry, wheel hit-test, 목록 role tree를 검사한다.
- 16회 반복은 hard gate에 포함하지 않은 결정성 진단 실행이다. CI에서는 1회 경계 스위트만 실행하고, 간헐 RED 재발 시 동일 명령을 반복한다.

## 못 한 것 / 안전성 기록

- 전체 mock Playwright 스위트는 실행하지 않았다. 지정된 `ac-868-document-template-editor.spec.ts`만 실행했다.
- Docker DB를 시작하거나 쓰지 않았다.
- git 명령, commit, push, merge는 실행하지 않았다.
- 원격 CI 재실행은 권한/범위 밖이므로 하지 않았다. PM이 파일을 커밋한 뒤 CI를 확인해야 한다.
- Vitest 출력에는 기존 React Router future flag/ref 경고와 의도된 fixture stderr가 있었지만 실패 테스트는 0건이었다.
