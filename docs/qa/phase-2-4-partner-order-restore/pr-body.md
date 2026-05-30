# [FEAT] 권한 재편 Phase 2.4 — 주문(Partner-Order) 버전이력 + point-in-time 복원

> 🚧 **조기 draft PR** — spec/plan 문서화 단계에서 생성 후 구현 누적 ([[early-pr-docker-qa-screenshots]]).
> ⚠️ **Codex 토큰 소진 → 2026-06-01(월) 12:00 복구**. 그 전까지 구현 + dual 리뷰 모두 **Claude 에이전트 전면 대체**.

## 개요

RESTORE 메커니즘 **4번째 도메인**. slip(2.1, #318) / estimate(2.2, #319) / partner(2.3, #320) 에 이어 주문(`partner-order-service`)에 헤더+라인 full-snapshot 버전이력 + DRAFT 상태 point-in-time 복원 추가.

## 범위

- **대상**: `partner-order-service` `PartnerOrder`(헤더) + `PartnerOrderLine`(1:N)
- **신규 테이블**: Flyway **V7** `partner_order_revisions` (JSONB full-snapshot)
- **캡처**: draft create / from-estimate(CREATE) · draft update / 본사 edit(EDIT) · confirm / cancel(STATUS). delete 제외.
- **복원**: **DRAFT 상태 한정** (CONFIRMED 는 slip-service 발행 연동 → 과거 스냅샷 복원 시 정합성 붕괴). 새 RESTORE revision 생성.
- **권한**: `sales.partner-order.history.view` 확장(VIEW/RESTORE) 권장. 비-MASTER grant 시드.
- **UUID 비공개**(PR #320 F4 회귀 차단) + **react-query invalidate**(F5 stale 차단) 가드.

## 설계/계획 문서

- spec: `docs/superpowers/specs/2026-05-30-partner-order-restore-version-history-design.md`
- plan: `docs/superpowers/plans/2026-05-30-partner-order-restore-version-history.md` (Task 1~13)

## 체크리스트

- [ ] Phase 1 — V7 테이블 + PartnerOrderRevision 엔티티/Repository
- [ ] Phase 2 — PartnerOrderSnapshot + RevisionService(capture/채번/restore + DRAFT 가드)
- [ ] Phase 3 — 변경경로 캡처 훅 (draft/from-estimate/edit/confirm/cancel)
- [ ] Phase 4 — REST API + 권한 grant 시드
- [ ] Phase 5 — FE 패널 + 페이지 통합 + invalidate
- [ ] Phase 6 — Testcontainers IT(skipped=0) + Playwright
- [ ] Phase 7 — dev-report + DECISIONS D-RST-06 + overview + Docker 실 QA 스크린샷
- [ ] 5-team 리뷰 (사이클 N=2) → CI green → 머지

## QA

(Docker 실 QA 스크린샷 — 구현 완료 후 인라인 첨부)

## 차기 슬라이스 예약

주문→출고전표 전환 고도화 (품목별 부분전환 + 다중주문 병합, 헤더 충돌 선택/'/' 병기) — `project_order_slip_conversion.md`. 견적→슬립·주문→슬립 1:1 은 기구현.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
