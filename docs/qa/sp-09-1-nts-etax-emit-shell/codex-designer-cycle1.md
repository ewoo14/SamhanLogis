# SP-09-1 NTS e-Tax 발행 shell — Codex Designer Cycle 1 후반 리뷰

브랜치: `feat/sp-09-1-nts-etax-emit-shell`  
HEAD: `7363a729`  
범위: Section C — design-system, 상세 화면, QA mock screenshots

## 결론

**조건부 cycle 2 권고.** Claude cycle 1의 주요 디자인 지적(NTS 녹색 토큰, `Badge variant="nts"`, monospace, 비가역 경고, 빈 PNG 교체)은 대부분 반영됐다. 남은 문제는 디자인 산출물/PR 문구가 실제 UI와 다르게 “DRY_RUN/NTS 선택”을 말하는 점과, mock HTML 스크린샷이 실제 앱 render가 아니라 산출 증거로는 제한적이라는 점이다.

## 결함

### MEDIUM — PR/QA 설명은 “DRY_RUN/NTS 선택”인데 실제 confirm modal에는 선택 UI가 없음

- 위치: `docs/qa/sp-09-1-nts-etax-emit-shell/pr-body.md:60`, `TaxInvoiceDetailPage.tsx:696-751`
- 현상: PR body의 screenshot 설명은 “confirm modal — DRY_RUN/NTS 선택 + 비가역 경고”라고 되어 있으나 실제 modal은 현재 DRY_RUN 모드 문구만 보여주고 선택 컨트롤을 제공하지 않는다.
- 영향: reviewer가 screenshot과 구현을 다르게 이해한다. NTS 실 발행 shell의 UX 결정(운영 전 DRY_RUN 고정 vs 선택 제공)이 불명확해진다.
- 권고: 문구를 “DRY_RUN 안내 + 비가역 경고”로 정정하거나, segmented control/select로 DRY_RUN/NTS 선택을 구현한다.

### LOW — NTS CTA는 토큰을 쓰지만 inline style로 hover/focus state 일관성이 약함

- 위치: `TaxInvoiceDetailPage.tsx:461-470`
- 현상: 버튼은 design-system `Button`을 쓰되 `style`로 `background`, `borderColor`, `color`만 override한다. hover/active/focus 색은 `Button` primary 기본 스타일과 충돌하거나 NTS 토큰과 불일치할 수 있다.
- 영향: 기본 상태는 녹색으로 구분되지만 상호작용 상태에서 브랜드 블루/primary 스타일이 섞일 가능성이 있다.
- 권고: `Button` variant 확장 또는 local class로 `--color-nts-primary` 기반 hover/active/focus-ring을 함께 정의한다.

### LOW — QA PNG는 90~110KB UI mock으로 교체됐지만 실제 app render 증거는 아님

- 위치: `docs/qa/sp-09-1-nts-etax-emit-shell/screenshots/*.html`, `*.png`
- 현상: cycle 1의 5KB 빈 PNG는 교체됐다. 현재 4장 PNG는 HTML mock에서 생성된 정적 화면이다.
- 영향: PR screenshot 의무는 충족 방향이나, 실제 `TaxInvoiceDetailPage`/design-system 렌더와 CSS cascade까지 보장하지는 않는다.
- 권고: Playwright mock-mode 실제 route 캡처를 별도 파일로 추가하거나, PR 본문에서 “HTML mock evidence”라고 명확히 표기한다.

## Claude cycle 1 fix cross-check

| Claude 항목 | Codex 판정 | 근거 |
|---|---|---|
| D1 NTS 녹색 미사용 | FIXED | `--color-nts-primary: #0F6523` 추가 및 CTA/banner 사용 |
| D2 EMITTED 시각 구분 없음 | FIXED | `Badge variant="nts"` 추가 |
| D3 monospace 미적용 | FIXED | `fontFamily: var(--font-family-mono)` 적용 |
| D4 비가역 경고 약함 | FIXED | modal 내 danger `role="alert"` 경고 추가 |
| D5 CTA 시각 구분 | PARTIAL | 기본 색은 구분. hover/focus state는 inline style 한계 |
| D6 token 이탈 | PARTIAL | NTS 색은 토큰화. 일부 fontSize inline 유지 |
| 빈 PNG | FIXED | 90~110KB PNG로 교체됨 |

## TM 결정안

**cycle 2 진입 권고.** 디자인 merge blocker는 문서/UX 불일치 정리 정도다. 실제 앱 캡처 보강은 QA blocker 쪽에서 함께 처리하는 것이 적절하다.
