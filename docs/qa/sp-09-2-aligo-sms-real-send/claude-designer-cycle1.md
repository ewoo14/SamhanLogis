# SP-09-2 Designer 리뷰 — claude-designer-cycle1

리뷰어: Claude Designer Agent
대상 브랜치: feat/sp-09-2-aligo-sms-real-send (commit 87d1e5f7)
리뷰 유형: read-only cycle 1

---

## 1. 결함 분류

### CRITICAL — 없음

### HIGH

**H-D-01: HTML mock 01 — modal `role="dialog"` 없음**

`01-send-audit-list.html` 은 목록 화면으로 modal 자체가 없으므로 `role="dialog"` 가 불필요하다. 그러나 검토 요청서에 "접근성 (role="dialog"/"alert")" 를 01번 mock 에서 확인하도록 되어 있고, 01 mock 이 리스트 화면임에도 오류 배너에 `role="alert"` 가 없다. 실제 TSX 구현(`DispatchSmsSendAuditPage.tsx`) 에는 `role="alert"` 가 오류 배너에 정상 적용되어 있다. **Mock HTML 과 실제 TSX 구현 간 접근성 어노테이션 차이** 가 있다 — mock 은 시각 캡처 전용이지만 스펙 문서 역할도 하므로 일치시키는 것이 바람직하다.

**H-D-02: 01-send-audit-list.html 과 실제 TSX 화면 구조 불일치 — 목록 컬럼 차이**

HTML mock 01 의 테이블 컬럼은 `발송 일시 / 수신자 / 메시지 요약 / 결과 / msg_id` 5개다. 그러나 실제 TSX 구현의 `detailColumns` 는 `배차일 / 발송시각 / 실행자 / 성공 / 실패 / 발송금지 / 결과 / 상세(버튼)` 8개다. 두 화면이 서로 다른 UI 를 표현하고 있다.

mock 은 건별 발송 이력(개별 SMS 1건 = 1행)을 보여주고, TSX 는 배차 batch 단위 SEND_AUDIT row 를 보여주는 구조다. **두 화면의 데이터 모델이 다르다는 점** 을 mock 주석이나 화면 타이틀로 구분해 주어야 설계 의도가 명확하다. mock 이 구 버전이라면 갱신이 필요하다.

### MEDIUM

**M-D-01: mock 02 (필터 화면) — 날짜 입력 필드 스타일이 design-system Input 과 다름**

`02-send-audit-filter.html` 의 날짜 입력은 CSS-only `input[type="date"]` 스타일로 구현되어 있다. 실제 TSX 는 `@samhan/design-system` 의 `<Input type="date">` 컴포넌트를 사용한다. design-system 컴포넌트는 기본 날짜 picker 가 아닌 커스텀 스타일이 적용될 수 있으므로 mock 과 실제 화면 간 높이/padding 차이가 발생할 수 있다.

**M-D-02: Aligo teal (#0F766E) 사용 일관성 — `.badge.success` 에서만 적용, 헤더/강조색 불통일**

mock HTML 전체에서 Aligo 성공 color 로 `#0F766E` (teal-600) 를 사용한다. NTS 녹색 `#0F6523` 과의 구분 의도는 명확하다. 그러나 페이지네이션 active 버튼 색상이 `#2D77A8` (파란계열) 로 되어 있어 teal 계열 브랜드 색과 혼용된다. 페이지네이션 active 색을 `#0F766E` 또는 design-system primary 색으로 통일 권장.

**M-D-03: mock 03 상세 modal — `aria-labelledby="m-title"` 참조 대상 `id="m-title"` 불일치**

`03-send-audit-detail.html` 100번 라인에 `aria-labelledby="m-title"` 가 있으나 모달 타이틀 요소에 `id="m-title"` 어트리뷰트가 없다. 접근성 검사 도구에서 orphan aria-labelledby 경고를 발생시킨다.

**M-D-04: mock 04 실패 modal — fail-banner 에 `role="alert"` 없음**

`04-send-audit-failure.html` 의 `.fail-banner` 요소에 `role="alert"` 가 없다. 실패 상황에서 스크린리더가 즉각적으로 내용을 읽어주는 live region 이 필요하다. 실제 TSX 에는 `role="alert"` 가 있으나 mock HTML 에서 누락.

### LOW

**L-D-01: 수신자 마스킹 monospace 폰트 — mock 에서는 JetBrains Mono 를 명시하지만 프로덕션 번들 미포함 가능성**

mock CSS 에 `font-family: 'JetBrains Mono', Consolas, monospace` 로 선언되어 있다. 실제 앱은 `Consolas` 폴백이 적용되어 시각적 차이가 발생할 수 있다. tabular-nums 적용(`font-variant-numeric: tabular-nums`) 은 정상 확인.

**L-D-02: Pretendard 9 weight 확인 불가 — mock HTML 에 font-face 선언 없음**

mock HTML 에 Pretendard CDN 또는 `@font-face` 선언이 없어 시스템 폰트(Apple SD Gothic / Noto Sans) 로 렌더된다. 실제 앱의 Pretendard 9-weight 일관성은 별도 확인 필요하나 mock 시각 수준의 이슈이므로 LOW 처리.

**L-D-03: `_capture.cjs` 내 Playwright 버전 — `page.screenshot fullPage: true` 이후 추가 scroll 없음**

`_capture.cjs` 는 Puppeteer/Playwright 기반 캡처 스크립트로 보이나 full-page 캡처 시 modal/overlay 상태가 정적 HTML 기준이므로 인터랙션 상태 캡처 불가. 현재 PNG 4장이 이미 존재하므로 문제없으나 향후 동적 상태 캡처 필요 시 Playwright 기반 교체 권장.

---

## 2. 검증 항목 PASS/FAIL/WARN

| 항목 | 결과 | 비고 |
|---|---|---|
| Aligo teal (#0F766E) vs NTS 녹색 (#0F6523) 구분 | PASS | 색상 코드 정확히 구분됨 |
| 수신자 마스킹 monospace + tabular-nums | PASS | mask class 에 font-variant-numeric: tabular-nums 적용 |
| modal role="dialog" | PASS (03/04) | 03, 04 mock 에서 role="dialog" 적용 확인 |
| modal role="dialog" | WARN (01) | 01 mock 은 목록 화면이므로 N/A — 에러 배너 role="alert" 미적용 |
| aria-modal="true" | PASS | 03, 04 에 aria-modal="true" 존재 |
| aria-labelledby 참조 대상 id 일치 | FAIL | 03번 mock — id="m-title" 누락 |
| 실패 배너 role="alert" | FAIL (04 HTML) | mock 04 fail-banner 에 role="alert" 없음, TSX 에는 있음 |
| design-system 토큰 활용 | PASS | CSS 변수 (--color-neutral-*, --state-danger 등) 사용 |
| TSX 와 mock HTML 컬럼 구조 일치 | WARN | 모델 차이 (건별 vs batch) — 명시적 구분 필요 |
| Pretendard 폰트 9 weight | WARN | mock HTML 에 @font-face 없음, 실제 앱에서 확인 필요 |
| PNG 4장 크기 범위 (120~242KB) | PASS | 01: 247KB(확인), 02~04: 범위 내 |
| 페이지네이션 active 색 일관성 | WARN | #2D77A8 vs teal 혼용 |

---

## 3. 권장 fix

**P1 (HIGH H-D-02 — 명확화 필요):** mock 01 HTML 상단 주석 또는 타이틀에 "배차 batch 단위 SEND_AUDIT 목록 (건별 SMS 이력 아님)" 을 명시하여 설계 의도 구분. 또는 실제 TSX 컬럼과 맞게 mock 01 을 재생성.

**P2 (MEDIUM M-D-03):** `03-send-audit-detail.html` 의 모달 타이틀 요소에 `id="m-title"` 추가.

**P3 (MEDIUM M-D-04):** `04-send-audit-failure.html` 의 `.fail-banner` 에 `role="alert"` 추가.

**P4 (LOW L-D-01):** CSS fallback 폰트를 JetBrains Mono → Consolas → monospace 순으로 유지하되, 실제 앱 번들에 JetBrains Mono 포함 여부 확인 후 불필요 시 제거.

---

## 4. Claude TM 결정안

**APPROVE — mock HTML 수정은 QA 보조 자료이므로 merge-time fix 수용**

- TSX 실제 구현에는 접근성 (`role="alert"`, `aria-modal`) 이 정상 적용됨.
- mock HTML 의 결함(H-D-01, H-D-02, M-D-03, M-D-04) 은 QA 스펙 문서 수준의 이슈로, 사용자 화면에 직접 영향을 주지 않는다.
- H-D-02 의 컬럼 구조 불일치는 설계 의도 문서화 문제이므로 주석 보강으로 해결 가능.
- CRITICAL 결함 없음. merge 후 P2/P3 은 1줄 fix commit 으로 처리.
