# chore 축 B 기획 — 문서 모달 인쇄 시 배경 본문 차폐

- 작성: OPUS 4.8 (PM 겸 기획) · 2026-07-24
- 브랜치: `chore/modal-print-background-hide` (origin/main `2a1c3a076` 기반)
- 성격: #907·#909 슬라이스 sweep 이 드러낸 **pre-existing 횡단 결함**. 개발책임자 "전역 chore 로 묶어 처리" 승인 하에 **2분할된 축 B**(축 A = LIKE escape = PR #919).
- 상위 기획서: `docs/superpowers/plans/2026-07-24-chore-global-escape-modal.md` §4 (PR #919 브랜치에 존재). 본 문서는 **축 B 전용**으로 분리하고 **진단을 실행으로 재확증**한 것이다.

---

## 1. 🚨 진단 확증 (추정 아님 — PM 실행 측정)

배차보드(`/#/dispatch-board`)에서 전표 행을 클릭해 `SlipDetailModal`(design-system `<Modal>` = `createPortal(document.body)`)을 연 뒤, `emulateMedia({media:'print'})` 로 인쇄 미디어를 적용하고 실 DOM 기하를 측정했다.

```
[SCREEN]  .app-main   left=240 top=0  1200x900  display=block
          backdrop    left=0   top=0  1440x900  display=flex  position=fixed   (body 직속)
          .app-sidebar 240x900 display=flex   /  .app-header 1200x56 display=flex

[PRINT]   .app-main   left=0   top=0  1440x378  display=block   innerText 363자   ← 🔴 배경이 인쇄에 참여
          backdrop    left=0   top=0  1440x900  display=flex  position=fixed      ← 문서도 인쇄(정상)
          .app-sidebar display=none  ✅   /  .app-header display=none  ✅
          backdropInsideAppMain = false   (backdrop 은 .app-main 밖)
```

**확증된 사실**
1. `.app-sidebar`·`.app-header` 는 JSX 의 `no-print` class 로 **정상 차폐**된다.
2. **`.app-main` 만 차폐되지 않는다** — 인쇄 미디어에서 `display:block`, 실제 텍스트 363자를 그대로 싣는다.
3. backdrop 은 `position:fixed` 이고 **`body` 직속**(= `.app-main` 밖)이라 흐름에서 빠져 첫 페이지에 얹히고, `.app-main` 은 정상 흐름으로 레이아웃된다 ⟹ **두 레이어가 같은 지면에서 겹친다.**

**왜 `.app-main` 은 `no-print` 가 아닌가 (의도적)** — `.app-main` 은 **전체 페이지 인쇄 라우트**(`.print-page`·`.dispatch-page` 등 전표 상세 인쇄)의 인쇄 컨테이너다. 상시 숨기면 그 정식 인쇄가 깨진다. `AppLayout.tsx` 가 일부러 `no-print` 를 붙이지 않았다.

⟹ **조건부 차폐**가 필요하다: *문서 모달이 열려 있을 때만* 배경을 인쇄에서 뺀다.

증적: `docs/qa/choreb-print-probe/` (`01-board-loaded.png` · `02-modal-open-screen.png` · `03-modal-open-print-media.png` · `modal-open.pdf`) + 재현 스펙 `clients/desktop/playwright/choreb-print-probe-real-qa/`.

---

## 2. 🚨 U-gate — *"이 슬라이스가 끝나면 사용자가 실데이터로 무엇을 할 수 있게 되는가"*

> **배차보드에서 전표 상세 모달을 열고 `Ctrl+P` 를 눌렀을 때, 배차 목록이 섞이지 않은 배차지시서 문서만 인쇄할 수 있게 된다.**

구체 시나리오 — 실 전표 1건의 상세 모달을 열고 인쇄하면, 종이에 **DispatchDocument 만** 나오고 배경 배차보드 목록(차량 그룹·미배차 전표 리스트)은 나오지 않는다. 머지 직전 PM 이 실데이터로 1회 실행한다.

---

## 3. 불변식

- **IB-1**: 문서 모달(`SlipDetailModal` 등 DS `<Modal>`)이 열린 채 인쇄하면 **문서는 나오고 배경 본문(`.app-main`)은 나오지 않는다.**
- **IB-2**: **#909 업데이트 모달 3종 차폐 유지** — `app-version-blocking-modal` / `app-version-recommend-modal` / `app-version-minor-detail-modal` 이 든 backdrop 은 계속 인쇄에서 제외된다.
- **IB-3**: **모달이 없는 전체 페이지 인쇄 라우트는 불변** — 전표 상세 등 정식 인쇄에서 `.app-main` 이 계속 인쇄된다(차폐 규칙 미발동).
- **IB-4**: **#914 문서 양식 편집기 인쇄 규칙 불변** — `.document-template-*` / approval-doc fragmentation 처리에 영향 없음.

🔑 **불변식을 "표면 비참여"로 세운 이유** — 하네스 정본 2-B②: *"오버레이는 어디에 두든 무언가와 부딪힌다. 위치가 불변식이 되면 fix 는 영원히 자리를 옮긴다."* #909 가 이 함정을 3라운드 겪었다(좌상단→우하단→in-flow, 매번 새 피해자). 그래서 IB-1 은 *"무엇과 겹치지 않는가"* 가 아니라 **"어느 표면에 참여하지 않는가"**(인쇄 미디어)로 썼다.

---

## 4. 🚨 회귀 울타리 — 표면을 명시한다 (각각 따로 측정)

fix 가 기존 인쇄 경로를 조용히 죽이는 것이 이 레포의 전형적 사고다. 아래를 **각 표면에서 각각 측정**해 보고할 것. 한 곳만 재고 "통과"라고 하면 위반이다.

1. **배차보드 + SlipDetailModal** — 문서 인쇄됨 · 배경 목록 안 나옴 (IB-1 대상, fix 표면)
2. **모달 없는 배차보드** — `Ctrl+P` 시 배차보드 목록이 **정상 인쇄**(차폐 규칙 미발동)
3. **전표 상세 전체 페이지 인쇄 라우트**(`.print-page` 계열) — 불변 (IB-3)
4. **결재 문서 양식 편집기 미리보기 인쇄**(#914 `.document-template-*`) — 불변 (IB-4)
5. **업데이트 모달 3종**(#909) — 여전히 인쇄 제외 (IB-2)
6. **비문서 모달**(확인 dialog 등)이 열린 채 인쇄 — 배경 차폐 + 그 모달 인쇄. #909 철학("나머지 모달은 그대로 인쇄")과 정합하는 **허용 edge** 이며 불변식 위반 아님. 다만 **어떻게 동작하는지 측정해 보고**할 것.

---

## 5. 범위

**건드릴 것**
- `clients/desktop/src/renderer/styles/global.css` — 주 `@media print` 블록에 조건부 배경 차폐 (+2~6줄 예상)
- `clients/desktop/playwright/<slug>-real-qa/*.spec.ts` — 인쇄 배경 차폐 real-qa 신규

**명시적 제외**
- 🚫 **design-system 패키지 미수정.** `ds-modal-backdrop` 는 DS 가 부여하지만 CSS selector 로 참조만 한다 ⟹ 메모리 `feedback_design_system_playwright_mock_suite`(공용 컴포넌트 변경 = mock 스위트 필수)의 **트리거가 아니다.** 만약 구현 중 DS 수정이 필요해지면 **멈추고 PM 에게 보고**할 것(그 순간 mock 스위트가 필수가 된다).
- 🚫 #909 업데이트 게이트 로직 · #914 문서 템플릿 규칙 = 불변 유지 대상, 수정 대상 아님
- 🚫 축 A(LIKE escape) = PR #919

---

## 6. 수단은 구현자가 고른다 (참고 제안만)

상위 기획서 §4.3 은 `body:has([data-testid='ds-modal-backdrop']) .app-main { display:none !important }` 를 제안했다. **이는 제안이며 구속력이 없다.** 더 나은 수단이 있으면 근거와 함께 다른 선택을 하고 이유를 보고할 것.

참고 사실:
- `:has()` 는 Electron/Chromium 런타임에서 지원되며 **#909 가 이미 같은 print 블록에서 사용 중**이다.
- 제안 규칙은 **modal-agnostic** 이라 문서 모달 전수 열거가 fix 정확성의 전제가 아니다(견고성 이점).
- 더 공격적인 대안 = `#root` 차폐. 사이드바·헤더는 이미 `no-print` 라 `.app-main` 만으로 충분하다는 것이 §4.3 판단이나, **정찰에서 `.app-main` 외 미차폐 배경이 발견되면 승격**할 것. PM 측정에서는 `.app-sidebar`·`.app-header` 가 `display:none` 으로 확인됐다.

---

## 7. 테스트 전략

- **RED-first**: 배경 차폐 부재를 재현하는 실패 테스트를 먼저 쓰고 **RED 원문 제출** 후 고친다. 되돌리면 다시 RED 가 되는지(**뮤테이션 RED**)도 제출.
- 측정은 **`emulateMedia({media:'print'})` 기하 단언**(`.app-main` display / 문서 가시성)과 **`page.pdf()` 산출물** 양쪽으로. ⚠️ 메모리 실측(#908) — `emulateMedia` 는 **뷰포트를 그대로 두므로** 좁은 뷰포트 + print 조합은 사용자에게 존재하지 않는 상태다. **폭을 좁혀 인쇄를 재는 단언을 만들지 말 것.**
- real-qa 스펙 디렉토리·파일명은 **반드시 `-real-qa` 접미사**(mock CI 게이트 제외 규칙).
- 인쇄 작업은 시각 반복이 3~5회 붙는 경향이 있다(`feedback_print_design_iteration`) — **매 라운드 GUI 스크린샷** 필수.

---

## 8. 회귀 위험

- **R-B1** `:has()` 미지원 — Electron/Chromium 이라 해당 없음(#909 선례).
- **R-B2** 비문서 모달이 열린 채 인쇄 → 배경 차폐 + 그 모달 인쇄(허용 edge, §4-6 에서 측정).
- **R-B3** `.app-main` 만으로 부족한 미차폐 배경 존재 가능성 → 발견 시 `#root` 승격.
- **R-B4** 전체 페이지 인쇄 라우트 회귀(IB-3) — 조건부라 위험은 낮으나 **회귀 테스트 필수**.
- **R-B5** 🚨 **`!important` 남용이 #914·#909 규칙과 충돌** — 같은 print 블록에 이미 세 개의 규칙군이 산다. 우선순위 충돌을 만들지 말 것.

---

## 9. 기존 결정 교차검증

- `feedback_harness_defect_zero_design` 2-B② — 불변식을 "표면 비참여"로 세움(§3).
- `feedback_design_system_playwright_mock_suite` — DS **미변경**이므로 트리거 아님. 변경 필요 시 멈추고 보고(§5).
- `feedback_print_design_iteration` — 3~5 라운드 반복 가정, 매 라운드 GUI 스샷(§7).
- `feedback_realqa_run_and_false_red` — `-real-qa` 접미사 · 고아 vite 확인(§7).
- #909 dev-report — 업데이트 모달 3종 차폐가 **`ds-modal-backdrop` 통째 차폐로는 안 된다**는 PM 반증 이력(SlipDetailModal 을 지워버렸음). 본 슬라이스는 그 반대 방향(배경만 차폐)이라 정합하나, **IB-2 로 명시 보호**한다.
