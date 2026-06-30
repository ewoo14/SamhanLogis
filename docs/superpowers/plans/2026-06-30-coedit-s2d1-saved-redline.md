# 코-에디팅 S2d-1 저장 revision 기반 셀 인라인 레드라인 — 구현계획

> **For agentic workers:** 표준 워크플로우(Codex 구현 → Opus/Codex 순차 듀얼리뷰 **각 라운드 즉시 게시** 0수렴 → 라이브 QA → 머지)로 실행. 체크박스는 추적용.

**Goal:** 임계 통과 전표 조회 시 각 셀에 anchor 後 누적 레드라인(track-changes)을 인라인 표시.

**Architecture:** 임계 전이 시점 `max(slip_revisions.revision_no)`를 `slips.redline_anchor_revision_no`(V54)로 고정. `SlipRedlineService`가 anchor 後 `slip_revisions` 인접 스냅샷 diff(S2b 로직 재사용)를 필드별 layers로 누적. `GET /slips/{id}/redline` 응답을 FE `RedlineCell`이 셀에 재귀 스택 렌더. revisionCount/baseline 불변.

**Tech Stack:** Spring Boot 3 / Java 17, Flyway(slip_db 다음 V54), JPA, Testcontainers IT, React desktop.

## Global Constraints (verbatim)
- 적용된 V*.sql 불변 — 신규 V54만. fresh Postgres probe 검증([[feedback_migration_fresh_postgres_probe]]).
- UUID 사용자 비노출 — actorId/partnerId/productId/warehouseId 응답·화면 제외, actorName UUID-패턴 null 가드(S2b 동일).
- 컬럼: `slips.redline_anchor_revision_no INTEGER NULL`. S2c `revision_count_baseline` = 임계통과 마커(재사용).
- 도메인 전이: `Slip.send()`(SAVED→SENT) / `Slip.inspect()`(INSPECTING→COMPLETED). 서비스: `SlipService.send()`(line 812) / `SlipService.inspect()`(line 884) — slipRevisionService/Repository 보유.
- S2b 재사용: `SlipRevisionService` 의 fieldChanges/HEADER_FIELDS/LINE_FIELDS/lineQueuesByProductId/formatValue, `SlipRevisionRepository.maxRevisionNo`/`findBySlipIdOrderByRevisionNoDesc`.
- 비목표(S2d-2): 라이브 Yjs·편집모드 레드라인·accept/reject.

---

## Task 1: Flyway V54 — redline_anchor_revision_no 컬럼 + backfill

**Files:**
- Create: `services/slip-service/src/main/resources/db/migration/V54__slip_redline_anchor.sql`

**Interfaces:**
- Produces: `slips.redline_anchor_revision_no`(INTEGER NULL) — Task 2 도메인 매핑.

- [ ] **Step 1: 마이그레이션 작성**
```sql
-- V54: S2d-1 셀 인라인 레드라인 anchor — 임계 전이 시점 max(slip_revisions.revision_no).
-- 레드라인 = anchor 後 편집 체인(드래프트 편집 제외). NULL = 임계 미통과.
ALTER TABLE slips ADD COLUMN redline_anchor_revision_no INTEGER NULL;

COMMENT ON COLUMN slips.redline_anchor_revision_no IS
  'S2d-1 레드라인 anchor — 임계 전이(OUTBOUND COMPLETED/비-OUTBOUND SENT) 시점 max(slip_revisions.revision_no). 이후 편집만 레드라인. NULL=미통과.';

-- 기존 임계통과 전표 backfill: 현 시점 max revision_no 를 anchor 로(향후 편집부터 레드라인).
UPDATE slips s SET redline_anchor_revision_no = COALESCE(
        (SELECT max(r.revision_no) FROM slip_revisions r
          WHERE r.slip_id = s.id AND r.is_deleted = false), 0)
WHERE s.redline_anchor_revision_no IS NULL
  AND s.revision_count_baseline IS NOT NULL;
```

- [ ] **Step 2: fresh Postgres probe** — 새 DB V1~V54 적용(`ON_ERROR_STOP`), slips/slip_revisions seed 후 backfill 결과 확인(임계통과만 anchor 세팅).
- [ ] **Step 3: Commit**(Claude 대행).

---

## Task 2: Slip 도메인 anchor 필드 + SlipService 임계 전이 세팅

**Files:**
- Modify: `services/slip-service/.../domain/Slip.java`(revisionCountBaseline 필드 인근 + 신규 메서드)
- Modify: `services/slip-service/.../service/SlipService.java`(send() line 812 / inspect() line 884)
- Test: `services/slip-service/.../domain/SlipDomainTest.java`, `services/slip-service/.../it/SlipRedlineIT.java`(신규, anchor 세팅 IT)

**Interfaces:**
- Produces: `Slip.getRedlineAnchorRevisionNo(): Integer`, `Slip.captureRedlineAnchorIfAbsent(int maxRevisionNo): void`.

- [ ] **Step 1: 도메인 실패 테스트**(SlipDomainTest) — captureRedlineAnchorIfAbsent idempotent(null→세팅, 이미 set→보존).
- [ ] **Step 2: 도메인 구현**
```java
// revisionCountBaseline 필드 인근
@Column(name = "redline_anchor_revision_no")
private Integer redlineAnchorRevisionNo;

/** S2d-1 — 임계 전이 시점 max slip_revisions.revision_no 를 레드라인 anchor 로 1회 기록(idempotent). */
public void captureRedlineAnchorIfAbsent(int maxRevisionNo) {
    if (this.redlineAnchorRevisionNo == null) {
        this.redlineAnchorRevisionNo = maxRevisionNo;
    }
}
```
- [ ] **Step 3: SlipService 세팅** — `send()`(비-OUTBOUND baseline 세팅 직후)·`inspect()`(OUTBOUND) 에서:
```java
// 도메인 전이(slip.send()/slip.inspect()) 직후, slip 저장 전:
Integer maxRev = slipRevisionRepository.maxRevisionNo(slip.getId());
slip.captureRedlineAnchorIfAbsent(maxRev == null ? 0 : maxRev);
```
  (SlipService 에 `slipRevisionRepository` 주입 — 없으면 추가. baseline 세팅과 동일 타입 가드 조건 아래에서만 호출: 비-OUTBOUND는 send(), OUTBOUND는 inspect().)
- [ ] **Step 4: 실 DB IT**(SlipRedlineIT) — 전표 생성→(편집 N회)→임계 전이(send/inspect)→`redline_anchor_revision_no = 전이 시점 max revision_no` 단언. 임계 前은 null.
- [ ] **Step 5: 통과 확인 + Commit**.

---

## Task 3: SlipRedlineService — anchor 後 필드별 layers 재구성 + DTO

**Files:**
- Create: `services/slip-service/.../revision/service/SlipRedlineService.java`
- Create: `services/slip-service/.../revision/web/dto/SlipRedlineResponse.java`
- Test: `services/slip-service/.../revision/service/SlipRedlineServiceTest.java`

**Interfaces:**
- Consumes: `SlipRevisionRepository`(findBySlipIdOrderByRevisionNoDesc), `SlipRevisionService` 의 per-pair fieldChanges 로직(필요 시 package-private 노출 또는 헬퍼 재사용), `Slip.getRedlineAnchorRevisionNo`.
- Produces: `SlipRedlineResponse computeRedline(UUID slipId)`.

**DTO (record):**
```java
public record SlipRedlineResponse(boolean anchored, List<FieldRedline> fields) {
  public record FieldRedline(String fieldPath, String label, List<Layer> layers) {}
  // layers: 오래된→최신. 첫 = anchor 시점 값(base), 마지막 = 현재값. i>0 의 actor* = 그 값을 만든 주체.
  public record Layer(String value, String actorName, String actorColor, java.time.LocalDateTime changedAt) {}
}
```

**알고리즘(computeRedline):**
1. `anchor = slip.getRedlineAnchorRevisionNo()`. null → `new SlipRedlineResponse(false, List.of())`.
2. `revs = repository.findBySlipIdOrderByRevisionNoDesc(slipId)` 중 `revision_no >= anchor` 만, **revision_no 오름차순** 정렬(anchor 가 첫).
3. revs.size() <= 1 → `new SlipRedlineResponse(true, List.of())`(변경 없음).
4. 인접쌍 (revs[i-1], revs[i]) for i in 1..n: `SlipRevisionService` 의 fieldChanges(prevSnapshot, curSnapshot, actorName_of_revs[i], actorColor_of_revs[i], createdAt_of_revs[i]) 로 그 전이의 필드 변경 목록 산출(S2b 동일 로직·productId 매칭·UUID 제외·formatValue).
5. 누적: `Map<String fieldPath, FieldRedlineBuilder>` — 각 변경에 대해, 그 fieldPath 의 layers 가 비었으면 **base layer = change.beforeValue**(anchor 시점 값, actor=null) 추가 후 **change.afterValue** layer(actor=revs[i]) 추가; 이미 있으면 afterValue layer 만 추가.
6. label = 그 change.label(S2b). layers.size() >= 2 인 필드만 결과 포함. fieldPath 안정 순서(HEADER_FIELDS 순 → lines).
7. `new SlipRedlineResponse(true, fields)`.

- [ ] **Step 1: 실패 단위 테스트**(SlipRedlineServiceTest) — anchor 後 1필드 2회 편집 → layers 3개(base+2), actor 정확. 미변경 필드 제외. anchor null → anchored=false. 라인 productId 매칭(추가/삭제/재정렬). UUID 비노출.
- [ ] **Step 2: 구현**(위 알고리즘). SlipRevisionService 의 fieldChanges 가 private 면 package-private 또는 공용 헬퍼로 추출(중복 금지, DRY).
- [ ] **Step 3: 통과 확인 + Commit**.

---

## Task 4: SlipRedlineController + 실 DB IT(end-to-end)

**Files:**
- Create: `services/slip-service/.../revision/web/SlipRedlineController.java`
- Test: `services/slip-service/.../it/SlipRedlineIT.java`(Task 2 IT 확장)

**Interfaces:**
- Consumes: `SlipRedlineService.computeRedline`.
- Endpoint: `GET /slips/{slipId}/redline` → `ApiResponse<SlipRedlineResponse>`. 권한 = 기존 slip 조회 권한(SlipController 패턴). 게이트웨이 `/api/v1/slips/{id}/redline`.

- [ ] **Step 1: 실패 IT** — 전표 생성→임계 전이→필드 2회 편집(PUT/overlay)→`GET /slips/{id}/redline` → anchored=true, 해당 필드 layers=[base,v1,v2], actorName 정확, UUID 미포함. 임계 前 전표→anchored=false. (기존 slip IT 픽스처·실 HTTP.)
- [ ] **Step 2: 컨트롤러 구현**(SlipController @RequestMapping("/slips") 패턴 동일, @GetMapping("/{id}/redline"), caller 권한 헤더).
- [ ] **Step 3: 통과 확인(Docker 가용 시)+ Commit**.

---

## Task 5: FE — slipRedline API + RedlineCell + SlipDetailPage 통합 + mock

**Files:**
- Create: `clients/desktop/src/renderer/api/slipRedline.ts`
- Create: `clients/desktop/src/renderer/components/audit/RedlineCell.tsx`
- Modify: `clients/desktop/src/renderer/routes/SlipDetailPage.tsx`(조회 셀에 RedlineCell 배선)
- Modify: `clients/desktop/src/renderer/api/mock.ts`
- Test: `clients/desktop/src/renderer/components/audit/RedlineCell.test.tsx`, `clients/desktop/src/renderer/api/mock.test.ts`

**Interfaces:**
- `slipRedline.ts`: `interface SlipRedline { anchored: boolean; fields: FieldRedline[] }`(BE 1:1), `getRedline(slipId): Promise<SlipRedline>` (`GET /api/v1/slips/{id}/redline`, `res.data.data`). UUID 비노출.
- `RedlineCell`: props `{ layers: Layer[] }`. layers.length<=1 → 현재값만(일반). >=2 → 세로 스택: 현재값(최상단, 최신 actorColor, 라벨) + 직전 layers 취소선(neutral/각 actorColor), base 최하단.

- [ ] **Step 1: RedlineCell vitest**(실패) — layers 3개 → 현재값 1 + 취소선 2(line-through), actorName/색 라벨, layers 1개 → 일반(취소선 없음).
- [ ] **Step 2: RedlineCell 구현** — `SlipVersionHistoryPanel.renderFieldChange` 의 취소선(textDecoration line-through)+actorColor 스타일 재사용(공용화 가능 시 추출). 재귀 스택 = layers.slice().reverse() 매핑(최신 위).
- [ ] **Step 3: SlipDetailPage 배선** — 임계통과(anchored) 전표 조회 셀에 해당 fieldPath 의 layers 있으면 RedlineCell 로 렌더(없으면 기존 값). getRedline useQuery(`['slipRedline', slipId]`). 드래프트(anchored=false)는 기존 셀.
- [ ] **Step 4: mock** — 임계통과 전표 redline mock(anchor 後 다층 fields), 드래프트 anchored=false. mock.test.ts 계약(anchored 게이트·layers 구조).
- [ ] **Step 5: typecheck + vitest + Commit**.

---

## Self-Review (작성자 점검)
**Spec coverage:** §4.1 anchor→T1+T2. §4.2 redline 조회→T3+T4. §5 FE→T5. §6 테스트→T2/3/4/5. 누락 0.
**Placeholder scan:** 알고리즘·SQL·DTO 실코드 제시. SlipService 픽스처/권한 헤더는 "SlipController 패턴 동일" 명시(Codex 가 실제 바인딩).
**Type consistency:** `redlineAnchorRevisionNo`(Integer)·`captureRedlineAnchorIfAbsent(int)`·`computeRedline(UUID):SlipRedlineResponse`·`Layer{value,actorName,actorColor,changedAt}` T2/3/4/5 일관. 컬럼 `redline_anchor_revision_no` T1=T2 일치.
