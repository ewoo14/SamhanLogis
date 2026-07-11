# SeverityBadge + 알림 벨 뱃지 AA 대비 (#795, #784 후속)

- **일자**: 2026-07-12
- **PR**: #795 · **연관**: #784 warning-AA sweep 후속(HIGH로 분리) · feedback_css_var_token_not_fallback
- **워크플로우**: Codex 구현 → Opus 5-agent(Design AA·FE·BE·DevOps·QA 라이브캡처) → Design fold-in → Codex 5-agent 적대(family sweep) → 0수렴 → CI → 머지.

## 결함
`NotificationHistoryPage`의 `SeverityBadge`(INFO/WARNING/CRITICAL) solid bg + 흰텍스트(neutral-0)·11px/600(=normal text, AA 임계 4.5)가 **3종 전부 대비 FAIL**(#784서 "뱃지 패밀리 홀리스틱 재설계·후속 HIGH"로 분리). Design 리뷰가 **동일 결함군**으로 알림 벨 카운트 뱃지(전 페이지 헤더 고노출)도 추가 포착.

## 변경 (AA 셰이드 — 흰텍스트 CR≥4.5)
| 대상 | 이전 | 흰 CR | 이후 | CR |
|---|---|---|---|---|
| INFO(정보) | neutral-400 #8E97A4 | ~2.6 ❌ | neutral-600 #4D5562 | 7.52 ✅ |
| WARNING(경고) | warning-500 #E9A53D | ~1.9 ❌ | warning-800 #8C5C13 | 5.75 ✅ |
| CRITICAL(긴급) | danger-500 #D6504A | ~3.4 ❌ | danger-700 #991B1B | 8.31 ✅ |
| 알림 벨 카운트 | danger-500 | 4.11 ❌ | danger-700 | 8.31 ✅ |

+ `AuditOverlaySection:140` dead fallback 정리(`var(--color-warning-800, #92400E)` → 토큰만; 토큰 정의됨→#92400E 미렌더+값 불일치).

## 리뷰 disposition
- **Design(PASS)**: WCAG 실계산 4종 ≥4.5 확인(WebAIM 교차검증)·hue 보존(darken만)·라벨 동반으로 WCAG 1.4.1 충족·CVD-safe. **fold-in**: 벨 뱃지 동일 결함군(CR 4.11)→danger-700.
- **QA(GREEN)**: 실 desktop 렌더(mock OFF·:8080·실 notification-service API로 CRITICAL/INFO seed) before/after 라이브 캡처 4종(`docs/qa/severity-badge-aa/`) — 3종 뱃지 새 AA 색상·흰텍스트 판독·before 워시아웃 대조 명확.
- **FE/BE/DevOps(PASS)**: typecheck/eslint/build PASS·SeverityBadge 로컬(파급 0)·토큰 유효·CI frontend-desktop green.
- **Codex 적대(발견 0)**: family 전수 sweep — SeverityBadge 3 + 벨이 유일 2 인스턴스(다른 -500 solid+흰텍스트 뱃지 0). AA·토큰·회귀 PASS.

## 스코프 밖 (별도 후속)
1. **다크모드 latent**(Design 정량화): warning-800/danger-700에 다크 오버라이드 부재 → 다크 배선 시 텍스트(neutral-0 반전 #0F1216)+중간톤 bg로 WARNING~3.3·CRITICAL~2.3 회귀 확정. 근본책=on-solid 고정white 토큰 or 다크 오버라이드. **다크 배선 착수 시 필수**. (현재 data-theme 미배선·도달불가.)
2. **🐛 pre-existing 버그(QA 발견·별건)**: `NotificationCenterController`(/notifications/my·/history·/{id}/acknowledge)가 `@RequestHeader("X-User-Role")` 필수인데 PR #415가 게이트웨이 X-User-Role 주입 제거 → **알림 내역/벨 미확인이 게이트웨이 경유 시 항상 500**. 별도 백엔드 계약 fix 필요(게이트웨이 재주입 vs 컨트롤러 role 파생).
3. 하드코딩 #92400E(pass-site)·AuditOverlaySection 138-139 dead fallback 토큰화 → 하이진 후속.
