# SP-09-4 KFTC 오픈뱅킹 — Codex Designer cycle 1 review

대상: `feat/sp-09-4-kftc-shell` / `dee1f20c`  
모드: read-only, PR 댓글 미게시

## 결론

**Designer 단독 blocker는 없음.** KFTC 토큰 6종과 4장 HTML/PNG 산출물은 존재한다. 단, HTML mock의 modal/접근성 설계가 실제 FE 구현에는 아직 반영되지 않아 Phase 11 이관 범위가 문서상 더 명확해야 한다.

## Findings

| ID | Severity | 위치 | 내용 |
|---|---|---|---|
| DS-C1-1 | Medium | `docs/design/sp-09-4-kftc-shell/decisions.md:80-89`, `DepositMatchPage.tsx` | decisions는 summary `role="status"`, error `aria-live/assertive`, modal dialog/focus trap 등을 명시하지만 실제 FE는 summary role/status와 modal 구현이 없다. T4 modal은 Phase 11 이관으로 정당화되어 있으나 접근성 요건 중 현재 화면에 적용 가능한 summary/error 부분은 cycle 2에서 반영 권고. |
| DS-C1-2 | Low | `docs/design/sp-09-4-kftc-shell/decisions.md:120-127` | 다음 단계에 `GET /banking/kftc/deposits`, `KFTC_MODE=DRY_RUN`이 적혀 있다. 현재 구현 계약은 `POST /accounting/deposits/fetch-and-match`, `KFTC_SUBMIT_METHOD=DRY_RUN`이다. 디자인 핸드오프 문서가 실제 BE/FE 계약과 다르다. |

## Cross-check

- KFTC 토큰: PASS. `tokens.css`에 `--color-kftc-primary/50/100/200/700/text` 6종, `index.ts`에 `colors.kftc`가 있다.
- 4색 vendor 구분: PASS 산출물 기준. HTML mock에 NTS/Aligo/Clova/KFTC badge가 모두 있다.
- QA HTML 4장: PASS. `01` form, `02` result, `03` detail modal, `04` failure 산출물 존재.
- T4 modal RED 정당성: PASS. 상세 modal은 HTML mock과 Playwright 계약에는 있으나 `docs/dev-reports`에서 Phase 11 미구현 RED로 명시되어 있다.

## Decision

Designer는 **cycle 2 비차단 권고**. 실제 구현 가능한 접근성 속성 반영과 decisions.md의 endpoint/env 명칭 정정이 필요하다.
