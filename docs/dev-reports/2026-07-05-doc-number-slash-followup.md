# 2026-07-05 — 문서번호 통일 후속 (%2F 결함군·재고실사 동시성·커버리지) (PR #728)

> #727 병합 후 **소급 5-agent+Codex 리뷰**가 적발한 실 버그·커버리지 갭 종합 fix. #727에서 sweep/통일을 정식 리뷰 없이 진행한 워크플로우 미준수를 시정하며, **본 PR은 캐논 전면 준수**(Codex 개발 → Opus 5-agent ↔ Codex 순차 → 0수렴 → PM 종합 → CI → 머지). 교훈 [[feedback_expanded_scope_reinstate_review]].

## 배경
#727 소급 리뷰가 (a) 수금계획 CREATE mock 구형식 (b) %2F 결함군 미완주 (c) 재고실사 채번 동시성 미보강 (d) 테스트 갭 (e) 문서 stale 적발.

## 구현 (Codex 개발 3 dispatch)
- **A**: %2F 결함군 — postSalesSlip/postPurchaseSlip·서명 x2·getAccountingOrder·수금계획 status → FE `toOrderPathId`(슬래시→하이픈 URL 경로) + BE `DocumentNumberPathResolver.toSlashDocumentNo`(하이픈→슬래시 정규화). CollectionPlan 비정석 overload 제거. 수금계획 CREATE mock 슬래시. Javadoc stale 3.
- **B**: 재고실사 채번 count+1 race → `InventoryAuditNumberSequence`+PESSIMISTIC_WRITE·V21 마이그(백필)·동시성 IT.
- **C**: 형식가드(planNo/auditNo)·동시성 IT·**마이그 전환 회귀 IT 2건**(레거시→슬래시 자동검증·#727 CI no-op 갭 해소)·%2F 실경로 회귀.

## 리뷰 라운드 (실행=게시 1:1)
Opus 5-agent R1(HIGH1·MED다수) → **fix1**(off-by-one 가드 <12+정규식·서명 중복 revert·재고실사 락 타이밍 save직전 이동·resolver 단위·Sales/Purchase post IT·주문/기사서명 mock·문서) → Codex R1 0 → **Opus 5-agent R2**(FE 주문mock shape·QA driver-signature IT 갭) → **fix2** → Codex R2(ReceivablesPermissionEnforcementIT 404 회귀) → **fix2b**(하이픈 경로·mobile 첨부) → Codex R3(공개첨부 BE 404) → **fix2c exhaustive sweep**(첨부BE·견적·partner-order·주문 전수·FE↔BE 정규화 8쌍) → Codex 최종 정합 확인.

## 검증
- BE: accounting :test 1121·slip :test 1169·inventory *InventoryAudit* — 전부 0 fail(--rerun-tasks --no-build-cache). resolver 단위·동시성 IT(뮤테이션 실증)·마이그 회귀 IT(레거시 seed→전환 검증).
- FE: typecheck 0·mock/documentNumberPath vitest·partner-order/견적/주문 Playwright 56 passed. 5개 client typecheck.
- 마이그 V21: DevOps Testcontainers 실증(전환·중복 RAISE·idempotent·soft-delete MAX 백필이 구 count race 원천 차단).

## 파생/별건
- **#729 게이트웨이 도달성**(pre-existing·main 실증): desktop 서명 `/public/` prefix(→`/api/public/`)·매출/매입 `/admin/sales-slips` 라우트 부재 → 게이트웨이 404. %2F 정규화와 다른 인프라 레이어라 분리(admin-slip 라우팅은 개발책임자 결정 요청).
- stripSlipNoZeros 인쇄/화면 비대칭·DRY 3중 복제 = 스펙 disposition 보류(근거 명기).

## 교훈
- **범위 점증 시 리뷰 재가동**([[feedback_expanded_scope_reinstate_review]]) — 자체 검증(grep/probe/CI)은 리뷰의 보완이지 대체 아님. mechanical→BE/마이그면 즉시 정식 듀얼.
- **%2F URL 경로 = FE toOrderPathId ↔ BE 정규화 쌍**([[feedback_slip_order_number_format]]). 한 곳만 고치면 %2F(400) 또는 하이픈 미정규화(404). exhaustive sweep로 전 쌍 대조.
- 소급 리뷰가 실 버그(mock shape·off-by-one·IT 404 회귀·첨부 404) 다수 적발 — 정식 리뷰의 가치 실증.
