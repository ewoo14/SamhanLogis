# 협업 코-에디팅 S2d — 레드라인 재귀(track-changes) 설계

> 2026-06-30. 라이브 코-에디팅 에픽(#16) S2d. 개발책임자 brainstorming 결정 반영.
> 선행: S2c(#676, editHistoryCount 상태의존 게이트 + `revision_count_baseline`) · S2b(#675, `slip_revisions` 인접 스냅샷 `fieldChanges` diff) · S2a(#674, Yjs 전표 전체 폼 라이브 코-에디팅·단일색상).

## 1. 목표 / 룰 (개발책임자)
임계 통과(카운트 증가 상태 = OUTBOUND COMPLETED後 / 비-OUTBOUND SENT後) 전표를 **조회/편집할 때**, 각 셀에 **기존값 취소선 + 바로 위 수정값(사용자색+라벨)** 을 인라인 표시하고, **수정의 수정도 세로로 스택(재귀)** 한다 — 구글 독스식 track-changes. 임계 前(드래프트) 편집은 레드라인 없음.

## 2. 분할 (개발책임자: 2개 서브슬라이스)
- **S2d-1 (본 spec 상세)**: **저장 revision 기반** 셀 인라인 누적 레드라인(view-mode, SlipDetailPage 조회 셀). S2b `slip_revisions` 재사용.
- **S2d-2 (후속, 개요만)**: **라이브 Yjs** 실시간 track-changes(편집 순간 타인 화면에도, S2a awareness 위). S2d-1 위에 배선.

## 3. S2d-1 핵심 결정
- **표시 위치**: SlipDetailPage 조회 셀 인라인(헤더 필드+품목 셀). 편집모드/라이브는 S2d-2.
- **데이터 = anchor 기반**(개발책임자: 룰 충실 우선): 임계 전이 시점의 "확정 콘텐츠 상태"를 anchor 로 고정하고, anchor 後 편집만 레드라인(드래프트 편집 제외).
- **게이트**: S2c `baseline != null`(임계통과) 재사용.

## 4. BE 설계

### 4.1 anchor 컬럼 (Flyway V54, slip_db)
- 신규 `slips.redline_anchor_revision_no INTEGER NULL` — 임계 전이 시점의 `max(slip_revisions.revision_no)`(확정 콘텐츠 스냅샷). null = 미통과(레드라인 없음).
- **서비스 레이어 세팅**(도메인 아님): `redline_anchor_revision_no` 는 `slip_revisions` 최대 revision_no 가 필요하므로 도메인(Slip) 접근 불가 → 임계 전이를 호출하는 **`SlipService.send()`(line 812, 비-OUTBOUND) / `SlipService.inspect()`(line 884, OUTBOUND)** 에서 도메인 전이(`slip.send()`/`slip.inspect()`, baseline 세팅) 직후 `slip.captureRedlineAnchorIfAbsent(slipRevisionRepository.maxRevisionNo(slipId))` 1회(이미 set이면 보존). SlipService 는 slipRevisionService 보유. CREATE 도 revision 1 캡처하므로 anchor ≥ 1.
- **backfill**(V54): 기존 임계통과 전표(`revision_count_baseline IS NOT NULL` AND anchor IS NULL)는 `redline_anchor_revision_no = (SELECT max(revision_no) FROM slip_revisions WHERE slip_id = slips.id AND is_deleted=false)` — 현 시점을 anchor 로(향후 편집부터 레드라인, 과거 anchor 복원 불가 정직 트레이드오프).

### 4.2 redline 조회 (per-field 체인)
- 신규 `GET /api/v1/slips/{slipId}/redline` → `SlipRedlineResponse`:
  - `anchored: boolean` (anchor 존재=임계통과)
  - `fields: List<FieldRedline>` — anchor 後 실제 변경된 필드/셀만.
    - `FieldRedline`: `fieldPath`, `label`, `layers: List<Layer>`(오래된→최신; 첫 = anchor 시점 값, 마지막 = 현재값), 각 `Layer`: `value`(formatValue, UUID 제외), `actorName`(UUID 가드), `actorColor`(presenceColor), `changedAt`.
- 계산: `slip_revisions` 에서 `revision_no >= anchor` 인 스냅샷을 revision_no 오름차순으로, 필드별 인접 변경(SlipRevisionService 기존 `fieldChanges`/`countHeaderChanges`/`lineQueuesByProductId` 로직 재사용)을 누적해 layers 구성. productId 기준 라인 매칭(S2b 동일). UUID/내부식별자 비노출(S2b 동일 가드).
- anchor null(미통과) → `anchored=false, fields=[]`.

## 5. FE 설계
- `clients/desktop/src/renderer/api/slipRedline.ts` — `getRedline(slipId): SlipRedline`(shape는 BE 1:1, UUID 비노출).
- SlipDetailPage 조회 셀: 임계통과(anchored) 전표면 셀 값 옆/아래에 **레드라인 스택** 인라인 — 현재값(상단, 사용자색·라벨) + 직전 layers 취소선(최신↑/오래된↓), 각 actorName+actorColor. `SlipVersionHistoryPanel.renderFieldChange` 의 취소선+색 스타일 재사용(공용 컴포넌트 `RedlineCell` 추출).
- 변경 없는 필드(layers 1개=현재값만)는 일반 표시(레드라인 없음). UUID/connectedId 비노출.
- mock: 임계통과 전표 redline mock(anchor 後 다층), 드래프트는 `anchored=false`.

## 6. 테스트
- BE 단위(`SlipRedlineService`): anchor 後 단일/다중 편집 체인, 라인 추가/삭제/재정렬 productId 매칭, anchor null→빈. UUID 비노출.
- 실 DB IT: 전표 생성→임계 전이(anchor 세팅 확인)→편집 2회→redline 2층 / 임계 前 편집→anchor null→빈. fresh PG V54 probe.
- FE: RedlineCell vitest(다층 취소선·색·라벨), 임계 게이트(anchored=false→일반 셀), mock 계약.

## 7. 비목표 (YAGNI / S2d-2)
- 라이브 Yjs 실시간 track-changes = S2d-2.
- 편집모드(input) 내 레드라인 = S2d-2(view-mode 우선).
- 레드라인 accept/reject(수락/거부) UI = 비목표(track-changes 표시만, 영구 누적).
- 인쇄 양식 레드라인 = 별도(조회 view 우선).

## 8. 워크플로우
표준 슬라이스: 조기 PR → Codex 구현 → Opus 5-agent ↔ Codex 5-agent **순차 듀얼리뷰(각 라운드 즉시 게시)** 0수렴 → 라이브 QA(실 DB V54 probe + 셀 레드라인 캡처) → PM 종합 → CI → 머지. 적용 마이그 불변(V54 신규), UUID 비노출·page-code 해당없음.
