# 코-에디팅 S2d-1 — 저장 revision 기반 셀 인라인 레드라인 (dev-report)

> 2026-06-30. 라이브 코-에디팅 에픽(#16) S2d 분할 1/2. PR #677. spec `docs/superpowers/specs/2026-06-30-coedit-s2d-redline-recursion-design.md` · plan `docs/superpowers/plans/2026-06-30-coedit-s2d1-saved-redline.md`.

## 목적
임계 통과(OUTBOUND COMPLETED後/비-OUTBOUND SENT後) 전표 조회 시 각 셀에 anchor 後 누적 레드라인(track-changes)을 인라인 표시 — 기존값 취소선 + 바로 위 수정값(사용자색+라벨), 수정의 수정도 세로 스택. S2b `slip_revisions` 재사용, revisionCount/baseline 불변.

## ⚠️ 본 슬라이스 스코프 — **헤더 필드 한정**(라인 셀 = S2d-1b 후속)
순차 듀얼리뷰에서 라인 셀 인라인 레드라인의 **2개 BLOCKING**이 적발되어, 안전·정확을 위해 **S2d-1은 헤더 필드 레드라인으로 한정**하고 라인 셀(품목)은 후속 슬라이스(S2d-1b)로 분리한다:
1. **BE — 라인 row-index 누적 misattribution**: 라인 fieldPath 가 행 인덱스(`lines[i]`) 기반이라, anchor 後 라인 삽입/삭제/재정렬(감사 복원 경로 도달 가능) 시 같은 인덱스에 다른 productId 값 혼입 + 이력 손실. → S2d-1b 에서 **productId 안정키 누적**으로 해소.
2. **FE/Design — 단가·합계 VAT 정합**: 단가/합계 셀 일반 표시는 VAT 포함값(`unitPriceWithVat`/`supply+vat`)인데 snapshot redline 값은 VAT 제외(`unitPrice`/`lineTotal`) → 인라인 시 합계=공급가 동일 표시되는 가시적 오류. snapshot 에 VAT 포함값 부재. → S2d-1b 에서 VAT 정합값 확보 후 재배선.

→ 헤더 필드(메모·거래처·배송지 등)는 안정 fieldPath + VAT 무관이라 정확. 임계 後 편집의 대부분(메모·주소 정정)을 커버.

## 구현 (헤더 한정)
- **Flyway V54** (`redline_anchor_revision_no`): 임계 전이 시점 `max(slip_revisions.revision_no)` anchor + 기존 임계통과 전표 backfill(현 max). DevOps fresh PG probe PASS(anchor 정확·멱등).
- **`Slip.captureRedlineAnchorIfAbsent(int)`** + **`SlipService.send()/inspect()`** anchor 세팅(S2c baseline 타입가드 대칭). anchor 결함계열 sweep: SlipPublishService 는 OUTBOUND 대칭 가드로 무력화(실버그 없음), seeder 비대칭은 시드한정 NB.
- **`SlipRedlineService.computeRedline`**: anchor 後 `slip_revisions` 인접쌍 S2b fieldChanges 재사용, **라인 fieldPath skip(헤더 한정)**, 필드별 layers(base+변경) 누적, layers≥2.
- **`GET /api/v1/slips/{id}/redline`** + `SlipRedlineResponse`(UUID 비노출).
- **FE**: `RedlineCell`(재귀 스택 취소선+사용자색+라벨) + `SlipDetailPage` **헤더 셀** 배선(anchored 게이트). 라인 셀은 일반 렌더. NB6: 임계 전이/매출·매입 PUT onSuccess 에 `['slipRedline']` invalidate.

## 테스트
- 단위: `SlipRedlineServiceTest`(헤더 누적·게이트·UUID), `SlipDomainTest`(anchor idempotent), `SlipServiceTest`(send/inspect anchor).
- 실 DB IT: `SlipRedlineIT`(anchor 세팅·memo 헤더 누적·DRAFT 게이트). CI Linux slip-it-core.
- FE: `RedlineCell.test`(재귀 스택), `mock.test`(anchored 양방향·헤더 fields·UUID 비노출).
- 마이그: fresh PG V54 probe(DevOps 라운드 실증).

## 듀얼리뷰
Opus 5-agent(BE/FE/Design/DevOps/QA) ↔ Codex 순차. BE BLOCKING(라인 row-index)·FE/Design BLOCKING(단가/합계 VAT) → 헤더 한정 스코프로 해소. DevOps 0(V54 probe PASS·ci.yml 커버 실증). 환경 이벤트로 Codex 백그라운드 kill → PM 검증·완성(테스트 매처 fix).

## 다음 — S2d-1b (라인 셀 레드라인)
productId 안정키 누적 + 단가/합계 VAT 정합값. 이후 S2d-2(라이브 Yjs 실시간 track-changes).
