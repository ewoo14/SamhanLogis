# E2 기둥2 — 배차 취소선 삭제 + cascade 복원 (dev-report)

- **PR**: #700 (`feat/e2-strikethrough-delete-dispatch`, base=main)
- **에픽**: E2 전역 라이브 데이터 동기화 + 취소선 삭제 (기둥1 라이브 컬렉션 동기화 #699 위에 얹음)
- **범위(파일럿)**: 배차 하위 차량그룹/전표매핑을 하드삭제하지 않고 **취소선 + 삭제자 이름 + 영구 표시 + 권한자 복원(cascade)**. 전 메뉴 일반화 전 배차 파일럿.

## 개요
soft-delete 행을 목록에서 숨기지 않고 취소선으로 영구 노출하며, "삭제: {이름}" 배지로 삭제자를 표시하고(UUID 비노출), 권한자(dispatch.board RESTORE)가 복원할 수 있다. 그룹 복원은 같은 삭제 시점에 함께 삭제된 하위 전표 매핑을 **cascade** 로 되살린다.

## 아키텍처
**BE (slip-service)**
- `@SQLRestriction("is_deleted = false")` 우회를 위한 native `...IncludingDeleted` 조회로 삭제행 포함(`DispatchVehicleGroupRepository`·`DispatchVehicleGroupSlipRepository`).
- DTO 삭제메타(`isDeleted`/`deletedAt`/`deletedByName`) — `DispatchTaskDetailResponse`. `deletedByName` 은 신규 컬럼(V55, nullable additive), `deletedBy`(userId)는 감사용 유지. `resolveActorName` 이 UUID 형태면 null(비노출)·100자 초과면 truncate.
- 복원 서비스(`DispatchTaskService.restoreVehicleGroup`/`restoreSlipFromGroup`) + 엔드포인트(`DispatchTaskAdminController`, `@RequirePermission(page="dispatch.board", action=RESTORE)` + EDIT 동적 가드) + `publishBoardChanged("RESTORED")` afterCommit 발화(기둥1 `CollectionRealtimePublisher` 재사용).
- cascade 집합 = `removeVehicleGroup` 이 그룹+하위 매핑에 주입한 **공유 삭제 시각(`deleted_at`)의 등호 매칭**(`markDeleted(userId, deletedAt)` 오버로드)으로 확정. 재배정/발송 전표는 `isMappingRestorable` 가드로 제외(이중 배차 방지).
- 권한 시드 V78(auth) — dispatch.board RESTORE 를 MASTER/MANAGER/DISPATCH role/group/account 3계층 additive.

**FE (clients/desktop)**
- `dispatchDeletedRow.ts` 공용 파생값(`activeSlipRows`/`activeVehicleGroups` — 게이팅/카운트/정렬은 활성 행 기준, 삭제행 length 직접 사용 금지) + 삭제 표시 유틸(배지 라벨/aria-label/취소선 스타일).
- 삭제행 취소선 + neutral 배지 + 권한 게이트(`canAccess('dispatch.board','restore')`) 복원 버튼 — `VehicleGroupCard`·`DispatchTaskDetailModal`.
- 모바일=WebView 라 웹 SSE 자동 반영(RN 신규 불요).

## 개발책임자 결정
- **D-E2-01**: 배차 파일럿 삭제 대상 = 하위 차량그룹/전표매핑 soft-delete.
- 그룹 복원 = **cascade**(그룹 + 같은 삭제시점 하위매핑 함께 복원).
- `deletedByName` = **신규 컬럼**(deletedBy=userId 감사 유지) + X-User-Name(non-UUID) 저장.

## 듀얼리뷰 이력 (순차 5-agent)
- **Codex 개발**: BE(Task1-4) + FE(Task5).
- **Opus 5-agent R1**: 37건(BLOCKING 2·HIGH 9·…) — 복원 unique 충돌→reassignSequence, ±2초 휴리스틱→공유 now() 등호매칭, loadSnapshot 분기, reorder 삭제행 제외, opacity 페이드 제거(WCAG) 등.
- **Codex 5-agent R1**: 9건 — addVehicleGroup 활성 max+1(reassignSequence 갭 재사용 차단), 단건복원 tombstone 중복 가드, 배지 aria-label, 헤더 flexWrap.
- **Opus 5-agent 재검2**: 실결함 5건(직전 2사이클 미포착) —
  - **[BLOCKING] WCAG AA 대비**: 삭제행 취소선 `neutral-500`(#6B7280)이 DRAFT 그룹헤더 `neutral-100`(4.23:1)·DISPATCHING/FAILED 배경에서 AA(4.5:1) 미달 → **`neutral-600`(#4D5562, 최악 6.58:1)** 상향.
  - **[HIGH] 삭제그룹 매칭기사 노출**: `DispatchTaskDetailModal:715` `!groupDeleted` 가드 누락(자매 카드/730행은 有) → 추가.
  - **[HIGH] 드래그 삭제그룹 배정**: `DispatchBoardPage` 풀→그룹 신규배정이 `isDeleted` 미검사(dnd-kit 행 droppable 항상 활성) → `canAssignSlipToGroupTarget` 순수함수 가드 + mock 404 동형.
  - **[HIGH] restoreSlip 다중 tombstone 영구 409**: (그룹,전표)에 tombstone 2건이면 행 단위 복원 경로 부재로 영구 409 → **mappingId 타겟 복원**(상세 행 id 전달, `findByIdIncludingDeleted` native, IDOR 안전 NOT_FOUND).
  - **[MED] restoreVehicleGroup 멱등가드 stale**: 그룹 조회를 락 획득 이후로 이동(더블클릭 시 순번 튐·RESTORED 중복발화 차단).
  - + 저비용: mock assign 정렬 parity·deletedByName 100자 truncate·복원 onError 서버사유 노출·ci.yml 주석 정합·행 wrap.

## 검증
- **FE**: desktop typecheck(node+web) 통과 · vitest **73 files / 508 tests 통과**(dispatch-board `DispatchBoardPage.test`·`dispatchDeletedRow.test`[neutral-600]·`useDispatchTask.restore.test`[mappingId] 포함).
- **BE**: `service.dispatch` 단위테스트 통과(mappingId 타겟복원·타그룹 NOT_FOUND·restoreVehicleGroup 멱등 포함) · `it.dispatch` E2E(실 PG Testcontainers, `restore_slip_with_mapping_id_restores_selected_tombstone_leaving_others` 로 native `findByIdIncludingDeleted` + 2-tombstone 409 실 DB 검증) · 마이그 V55(nullable additive)/V78(ON CONFLICT 멱등) 신규.
- **라이브 QA**: (본 라운드 후속 게시) Docker 재빌드 slip + 게이트웨이 :8080 + mock OFF, 삭제→취소선→복원 단계별 GUI 스샷.

## 알려진 한계 / 백로그
- **cascade 등호매칭 pre-PR 데이터**: 본 PR 이전 소프트삭제(행별 개별 `now()`)는 그룹/매핑 시각 불일치로 cascade 대상에서 빠지며 단건 복원으로 처리(문서화된 graceful degradation, 실데이터 near-zero).
- **IncludingDeleted 쿼리용 non-partial 인덱스 부재**: 단일 물류사 규모 OK(CI 개별 쿼리 <0.14s), 삭제행 대량 누적 시 후속 인덱스 검토.
- **legacy `checkEditPermission` 이중게이트**: RESTORE 엔드포인트가 `@RequirePermission(RESTORE)` + role 기반 canEdit 이중 통과(기존 sibling 공통 패턴, 본 PR 회귀 아님).
- **복원 mutation loading 스코프 공유**: 카드/모달 내 형제 복원 버튼이 같은 mutation isPending 공유(동시 오조작 방지엔 합리, 혼란 리포트 시 in-flight id 단위 개선).
