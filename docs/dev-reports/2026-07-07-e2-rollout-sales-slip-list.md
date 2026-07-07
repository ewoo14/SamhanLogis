# E2 롤아웃 — 판매전표 목록 (soft-delete·복원·실시간) — 2026-07-07 (#758)

거래처(#756)·주문(#757)과 동일 E2 패턴을 판매전표(SLIP_OUTBOUND) 목록에 이식. `useCollectionRealtime` SSE + 삭제행 취소선/복원 + slip V56(`deleted_by_name`) + auth V84(sales.slip.list restore 권한).

## R1 5-agent 리뷰 + Opus fix (STEP4 = Opus 적대검증, Codex 한도 대체·개발책임자 승인)

Codex 개발분이 **거래처 STEP4-이전 패턴을 미러**해, 거래처 STEP4가 고친 결함들이 재유입됨 → R1 5-agent가 포착, Opus 직접 fix:

- **🔴 CRITICAL (BE) — 공유/레거시 소비처로 삭제행 누출 (감사자료 오염)**: Codex 가 `listIncludingDeleted`/`searchIncludingDeleted` 를 공용 메서드 `SlipService.list()`(=`GET /slips`·자동완성·**Excel export**)·`SlipQueryService.listForQuery()`(=`GET /slips/query`·판매/구매조회 화면) 에 무조건 주입 → 취소된 전표가 엑셀·기존 조회화면·INBOUND 목록에 활성전표와 구분 없이 노출. **fix**: 두 native 쿼리에 `includeDeleted` 플래그(기본 false=활성전용) 추가 + `SlipController` 는 **OUTBOUND & includeDeleted=true** 일 때만 opt-in. `searchIncludingDeleted`(판매/구매조회 전용)는 무조건 활성전용. Excel(1406 오버로드)·INBOUND 자동 활성전용. IT: `/slips/query`·`/slips` 기본 삭제행 미노출 회귀가드 2건 신설 + E2 목록은 `includeDeleted=true` opt-in.
- **🟠 HIGH (BE)**: `SlipRestoreService.restore()` 에 slipType OUTBOUND 가드 추가 (`deleteForSales` 대칭) — sales.slip.list RESTORE 권한만으로 INBOUND 전표를 UUID 로 복원하는 최소권한 우회 차단.
- **🟠 HIGH (FE)**: slipNo 취소선이 `SlipNumberDisplay`(inline-flex atomic) 조상 span 에 걸려 **전혀 렌더되지 않던 회귀** → 컴포넌트 자신에 `style` 직접 전달(HTMLAttributes 상속·`{...rest}` 확인). mock DELETE 핸들러 pagecode `sales.slip.list`→`sales.slip.edit`(BE/FE 게이트 정합).
- **🟠 HIGH (Design)**: 실시간 인디케이터 neutral-500(무여유·다크 FAIL)→neutral-600. 삭제행 status 컬럼이 원래 배지(초록 "확정")를 유지하던 것을 **"삭제됨" neutral 배지 오버라이드**(원래 상태 aria 보존).

## 검증 (genuine)

- BE `compileJava`/`compileTestJava` green. FE `typecheck` green.
- real-PG IT (`--rerun-tasks --no-build-cache`): `SlipListE2RealtimeRestoreIT` 8·`SlipQueryPurchaseIT` 21·`SlipQueryRedesignSpecIT` 5·`SlipServiceListSpecTest` 9 — **전부 0 failure**. 누출차단 회귀가드(`/slips/query`·`/slips` 기본 활성전용) 실행 확인.

## 백로그 (후속)

- SSE 구독권한: `SlipListRealtimeController` 가 `sales.slip.list` VIEW 단일 게이트 → WAREHOUSE(구매전용) 사용자가 INBOUND 목록에서 403+재시도. FE 에서 OUTBOUND 만 SSE 구독하도록 조건화 예정(MED, 폴링 폴백으로 기능은 유지).
- mock `GET /slips` includeDeleted parity(mock 전용). `searchIncludingDeleted` 명칭 rename(활성전용화됨). auth 크로스트랙 머지순 C(V83)→D(V84)→E(V85) 수동 게이트.

## STEP4 (Opus 5-agent 적대검증 — Codex 한도 대체, 개발책임자 승인) + fix

적대적 refute 관점 5-agent(BE·FE·Design·DevOps·QA라이브)가 R1-fix를 공격:
- **🔴 누출 fix = 견고 확정(5-agent 전원)**: BE(native 쿼리 3개만 우회표면·전부 방어)·FE(취소선 Chromium 픽셀 실측·includeDeleted 이중방어)·Design(neutral-600 AAA·다크 AA)·DevOps(CI genuine·마이그·라우트)·**QA 라이브**(판매조회·Excel바이너리·INBOUND·파라미터퍼징[type=INBOUND&includeDeleted=true·system-master 전부 ABSENT] 실증, 스샷 03/04). **누출 결함 0.**
- **🟠 HIGH(BE+DevOps 수렴) fix**: `SlipRestoreService.restore()` 가 삭제 라인 미복원 → 복원=빈 껍데기(totalQuantity=0). `SlipLineRepository.restoreDeletedLinesBySlipId`(native bulk) + `entityManager.refresh` 로 라인 대칭복원. IT 라인생존 assert(`totalQuantity=1`) 신설 → **8 tests 0 fail genuine 실증**.
- **🟡 LOW(Design F-1) fix**: 삭제행 status 배지 aria-label 이 영문 enum(`CONFIRMED`) 노출 → `SLIP_STATUS_KO` 한국어 맵 경유(스크린리더 정합).

### 백로그 (문서화·비차단)
- **F1(선존재·#758 무관, MEDIUM)**: 판매조회 담당자명에 raw requesterId UUID 노출(`SlipResponse.salesPersonName`) — prod 재현·#758 diff 미변경. requesterId→표시명 resolve 또는 "—" 가드 후속.
- INBOUND restore→404·`slipType=INBOUND&includeDeleted=true`→미노출 IT(코드+QA 라이브 검증됨, IT 추가 권장)·regionGroup+includeDeleted 취소선·`searchIncludingDeleted` rename·SSE FE 조건화·mock GET parity·액센트바 대비.

## 머지게이트 감사 fix — 🔴 HIGH: 복원 라인 무차별 전량복원 → 시각한정 대칭복원 (2026-07-07, Opus 라운드모델 직접)

STEP4 fix(위 "🟠 HIGH(BE+DevOps 수렴) fix")가 도입한 `restoreDeletedLinesBySlipId`(native bulk, `WHERE slip_id=:slipId AND is_deleted=TRUE` 무조건)가 **머지게이트 감사**에서 🔴 HIGH 로 재적발: "라인은 헤더 cascade 외 개별 soft-delete 없음" 전제가 거짓 — OUTBOUND 판매전표는 `removeLine`(라인 제거) / `replaceSalesLines`(매출 direct PUT 편집) / `restoreFromSnapshot`(리비전 복원) 3경로로 라인을 개별 soft-delete 한다(`orphanRemoval=false`). 재현: DRAFT 전표 라인 A(10,000) → 매출 PUT 편집(A 개별삭제·신규 B 20,000 생성) → 목록 삭제 → 복원 → **A·B 동시 부활 = 합계 30,000 중복**(판매조회/Excel/회계 감사자료 오염). 리비전 복원 이력 전표는 전 세대 라인 동시부활로 더 심각.

**fix 방향 — 주문(C) `PartnerOrderDeleteService#restoreDeleted`(#757 R2) 패턴 정밀 이식**: 헤더 삭제(`deleteForSales`)가 cascade 라인에 헤더와 **동일한 단일 시각**을 각인하도록 하고, 복원은 그 시각과 **정확히 일치**하는 라인만 대상으로 삼는다.

- **`Slip#deleteForSales(actorId, actorName)`**: `LocalDateTime now = LocalDateTime.now()` 를 메서드 내 **한 번만** 캡처 → 헤더 `this.markDeleted(deleter, now)` + cascade 라인 전부 `line.markDeleted(deleter, now)` 동일 시각 각인. `removeLine`/`replaceLines`/`replaceSalesLines`/`restoreFromSnapshot` 의 편집용 `markDeleted(deleter)`(1-arg, 각자 `now()`) 는 의도적으로 변경하지 않음(편집 라인이 복원 대상에서 배제되어야 함).
- **`BaseEntity#markDeleted(String, LocalDateTime)` 단일시각 오버로드**: 이미 존재(#757 주문 롤아웃에서 선도입, `DispatchVehicleGroupSlip#markDeletedWithName(userId, actorName, deletedAt)` 선례와 동일 컨벤션) — 신규 추가 불요, 그대로 재사용.
- **`SlipLineRepository`**: `restoreDeletedLinesBySlipId(UUID)`(무조건) 제거 → `restoreDeletedLinesBySlipIdAndDeletedAt(UUID slipId, LocalDateTime deletedAt)` 신설 (`WHERE slip_id=:slipId AND is_deleted=TRUE AND deleted_at=:deletedAt`). grep 확인 결과 구 메서드의 유일 소비처는 `SlipRestoreService` 였음(안전 제거).
- **`SlipRestoreService#restore()`**: `markRestoredWithNameCleared()`(deletedAt→null) **이전**에 `LocalDateTime headerDeletedAt = slip.getDeletedAt()` 캡처 → 신 쿼리에 전달.

### 검증 (genuine — Testcontainers 실 PG, `--rerun-tasks --no-build-cache`)

- `compileJava`/`compileTestJava` green.
- 회귀 IT 3건 신설(`SlipListE2RealtimeRestoreIT`, 편집경로별 1건씩) — 각각 "편집으로 제거된 라인은 부활하지 않는다"를 HTTP e2e 로 고정:
  - `restoreDoesNotResurrectLineRemovedViaRemoveLineEndpoint` — `DELETE /slips/{id}/lines/{lineId}` 로 라인 A 제거 후 헤더삭제→복원. 라인 B(2,000)만 부활, A 는 영구 삭제 유지.
  - `restoreDoesNotResurrectLineRemovedViaSalesPutEdit` — `PUT /slips/{id}/sales` 로 라인 A→B(20,000) 교체 후 헤더삭제→복원. B 만 부활.
  - `restoreDoesNotResurrectLinesOrphanedByRevisionRestore` — `addLine` 으로 B 추가(rev2) 후 `POST /revisions/1/restore` 로 rev1(A 만) 복원 — 구세대 A·B 개별삭제 + 신규 A' 생성 → 헤더삭제→복원. A' 1건(1,000)만 부활, 구세대 A·B 는 영구 삭제 유지.
- `./gradlew :services:slip-service:test --tests "*SlipRestore*" --tests "*SlipListE2*" --rerun-tasks --no-build-cache` → XML 직접 집계: **`SlipRestoreTest` 7 + `SlipListE2RealtimeRestoreIT` 11 = 18 tests, 0 failures, 0 errors, 0 skipped**(기존 무편집 복원 IT `restoreClearsMetadataAndPublishesListChanged` 포함 전체 통과 — 회귀 없음).
- 전체 slip-service 모듈 test suite(`./gradlew :services:slip-service:test --rerun-tasks --no-build-cache`, 174 test 파일, canon `feedback_changed_module_full_test_before_push`) → XML 직접 집계: **1200 tests, 0 failures, 0 errors, 0 skipped** — `SlipSalesDeleteIT`(9, `deleteForSales` 가드/권한/audit) · `SlipRevisionRestoreIT`(8)·`SlipSalesUpdateIT`(11, `replaceSalesLines`) · `SlipDeleteIT`(10, `deleteForPurchase`/INBOUND — 본 fix 비대상, 미변경 확인) 등 인접 회귀가드 전부 통과, 전체 모듈 회귀 없음.
