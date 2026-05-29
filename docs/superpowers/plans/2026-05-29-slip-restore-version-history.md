# slip RESTORE 버전이력 + point-in-time 복원 (Phase 2.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Codex 다운(크레딧, 6/1) 동안 **Claude 에이전트가 구현**.

**Goal:** slip(전표)의 헤더+라인 전체를 revision별 full-snapshot으로 보관하고, 특정 시점(revision)으로 point-in-time 복원하는 버전이력 기능을 구축한다.

**Architecture:** 신규 `slip_revisions`(JSONB 스냅샷) 테이블 + `SlipRevisionService`(capture/restore/list). 전표 내용 mutation 커밋 시 스냅샷 캡처, 복원은 스냅샷 통째 적용(라인 전량 교체). 기존 협업 overlay(`slip_audit_logs`)는 공존. 접근법 B(spec §1).

**Tech Stack:** Spring Boot 3.3 / Java 17 / JPA(Hibernate 6) / PostgreSQL(JSONB `@JdbcTypeCode(SqlTypes.JSON)`) / Flyway / Testcontainers / React(clients/desktop).

**Spec:** `docs/superpowers/specs/2026-05-29-slip-restore-version-history-design.md`
**브랜치:** `feat/phase-2-1-slip-restore-version-history`
**검증 환경:** `$env:GRADLE_USER_HOME='C:\dev\SamhanLogis\.gradle\codex-home'`, `--no-daemon --no-parallel`. 로컬 Docker 미가용 시 IT 는 Linux CI 위임([[qa-docker-real-test]]).

---

## File Structure

**BE (slip-service)**
- Create `.../resources/db/migration/V27__add_slip_revisions.sql` — slip_revisions 테이블.
- Create `.../slip/revision/domain/SlipRevision.java` — 엔티티(JSONB snapshot).
- Create `.../slip/revision/domain/SlipSnapshot.java` — 스냅샷 직렬화 DTO(헤더+라인). record.
- Create `.../slip/revision/repository/SlipRevisionRepository.java`.
- Create `.../slip/revision/service/SlipRevisionService.java` — capture/restore/list + changeSummary.
- Create `.../slip/revision/web/SlipRevisionController.java` — GET revisions / POST restore.
- Create `.../slip/revision/web/dto/SlipRevisionResponse.java`, `SlipRevisionDetailResponse.java`.
- Modify `.../slip/service/SlipService.java` — create/updateSlip/applyOverlayPatch 후 capture 훅 + restore 위임.
- Modify `.../slip/domain/Slip.java` — 스냅샷에서 헤더 일괄 적용 `restoreFromSnapshot(SlipSnapshot)` + 라인 교체 helper.

**FE (clients/desktop)**
- Create `.../renderer/api/slipRevision.ts` — listRevisions/restoreRevision.
- Create `.../renderer/components/audit/SlipVersionHistoryPanel.tsx` — 버전이력 패널.
- Modify `.../renderer/routes/SlipDetailPage.tsx` — 패널 통합.
- Modify `.../renderer/realtime/SlipRealtimeClient.ts` — `slip:restored` 수신 invalidate.

**Tests**
- Create `.../test/.../slip/revision/service/SlipRevisionServiceTest.java` — capture/restore 단위.
- Create `.../test/.../slip/it/SlipRevisionRestoreIT.java` — Testcontainers 실 DB revert(헤더+라인 add/remove) + 권한 + 마감 lock.
- Create `clients/desktop/playwright/.../slip-version-history.spec.ts`.

**Docs**: dev-report `docs/dev-reports/phase-2-1-slip-restore-version-history.md`, DECISIONS D-RST-01~, overview/README 동기화.

---

## Task 1: slip_revisions 데이터 계층 (migration + 엔티티 + DTO + repo)

**Files:**
- Create: `services/slip-service/src/main/resources/db/migration/V27__add_slip_revisions.sql`
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/revision/domain/SlipSnapshot.java`
- Create: `.../slip/revision/domain/SlipRevision.java`
- Create: `.../slip/revision/repository/SlipRevisionRepository.java`

- [ ] **Step 1: V27 마이그레이션 작성**

```sql
-- V27__add_slip_revisions.sql
-- 전표 full-snapshot 버전이력 (Phase 2.1 RESTORE). slip_audit_logs(overlay)와 공존.
CREATE TABLE IF NOT EXISTS slip_revisions (
    id                 UUID PRIMARY KEY,
    slip_id            UUID        NOT NULL,           -- FK 미강제(soft-delete 후 이력 보존)
    revision_no        INTEGER     NOT NULL,
    revision_type      VARCHAR(16) NOT NULL,           -- CREATE / EDIT / RESTORE
    source_revision_no INTEGER,                        -- RESTORE 출처
    slip_no            VARCHAR(40),                    -- YYYY/MM/DD-{seqNo} 표시 스냅샷
    slip_date          DATE,
    snapshot           JSONB       NOT NULL,           -- 헤더+라인 SlipSnapshot 직렬화
    actor_id           UUID,
    actor_name         VARCHAR(50),
    actor_color        VARCHAR(20),
    created_at         TIMESTAMP   NOT NULL DEFAULT now(),
    created_by         VARCHAR(100),
    modified_at        TIMESTAMP,
    modified_by        VARCHAR(100),
    deleted_at         TIMESTAMP,
    deleted_by         VARCHAR(100),
    is_deleted         BOOLEAN     NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_slip_revisions_active
    ON slip_revisions (slip_id, revision_no) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS ix_slip_revisions_slip
    ON slip_revisions (slip_id, revision_no DESC) WHERE is_deleted = FALSE;
COMMENT ON TABLE slip_revisions IS '전표 full-snapshot 버전이력 (Phase 2.1)';
```

- [ ] **Step 2: SlipSnapshot DTO(헤더+라인) 작성** — Jackson 직렬화 대상. 헤더는 복원에 필요한 필드(memo/주소/거래처/라인 등 사용자 편집 대상)만 포함. Slip.java 의 헤더 필드를 참조해 정의.

```java
package com.samhanair.logis.slip.revision.domain;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
/** 전표 헤더+라인 스냅샷(JSONB 직렬화). 복원 시 이 값으로 전표를 통째 덮어쓴다. */
public record SlipSnapshot(
        String partnerName, String partnerCode, UUID partnerId,
        String memo, String deliveryTag,
        String businessNumber, String deliveryAddress, String supervisionAddress,
        String projectName, String recipientPhone, LocalDate paymentDueDate,
        UUID destinationWarehouseId, String destinationWarehouseName,
        List<Line> lines) {
    public record Line(UUID productId, String productName, String modelName,
                       String specification, int quantity, BigDecimal unitPrice,
                       BigDecimal lineTotal, String note) {}
}
```

- [ ] **Step 3: SlipRevision 엔티티 작성** — JSONB 매핑은 slip-service 선례(SlipCleanupSaveHistory) 패턴.

```java
package com.samhanair.logis.slip.revision.domain;
import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.*;
import java.time.LocalDate;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;
@Entity
@Table(name = "slip_revisions")
@org.hibernate.annotations.SQLRestriction("is_deleted = false")
public class SlipRevision extends BaseEntity {
    @Id @GeneratedValue @UuidGenerator
    private UUID id;
    @Column(name = "slip_id", nullable = false) private UUID slipId;
    @Column(name = "revision_no", nullable = false) private int revisionNo;
    @Column(name = "revision_type", nullable = false, length = 16) private String revisionType;
    @Column(name = "source_revision_no") private Integer sourceRevisionNo;
    @Column(name = "slip_no", length = 40) private String slipNo;
    @Column(name = "slip_date") private LocalDate slipDate;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "snapshot", columnDefinition = "jsonb", nullable = false)
    private SlipSnapshot snapshot;
    @Column(name = "actor_id") private UUID actorId;
    @Column(name = "actor_name", length = 50) private String actorName;
    @Column(name = "actor_color", length = 20) private String actorColor;
    protected SlipRevision() {}
    public static SlipRevision of(UUID slipId, int revisionNo, String revisionType,
            Integer sourceRevisionNo, String slipNo, LocalDate slipDate, SlipSnapshot snapshot,
            UUID actorId, String actorName, String actorColor) {
        SlipRevision r = new SlipRevision();
        r.slipId = slipId; r.revisionNo = revisionNo; r.revisionType = revisionType;
        r.sourceRevisionNo = sourceRevisionNo; r.slipNo = slipNo; r.slipDate = slipDate;
        r.snapshot = snapshot; r.actorId = actorId; r.actorName = actorName; r.actorColor = actorColor;
        return r;
    }
    // getters: id, slipId, revisionNo, revisionType, sourceRevisionNo, slipNo, slipDate, snapshot, actorId, actorName, actorColor
}
```

- [ ] **Step 4: SlipRevisionRepository 작성**

```java
package com.samhanair.logis.slip.revision.repository;
import com.samhanair.logis.slip.revision.domain.SlipRevision;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
public interface SlipRevisionRepository extends JpaRepository<SlipRevision, UUID> {
    List<SlipRevision> findBySlipIdOrderByRevisionNoDesc(UUID slipId);
    Optional<SlipRevision> findBySlipIdAndRevisionNo(UUID slipId, int revisionNo);
    /** 다음 revision_no 채번용 현 최대값. */
    @org.springframework.data.jpa.repository.Query(
        "select coalesce(max(r.revisionNo),0) from SlipRevision r where r.slipId = :slipId")
    int maxRevisionNo(UUID slipId);
}
```

- [ ] **Step 5: 컴파일 검증**

Run: `$env:GRADLE_USER_HOME='C:\dev\SamhanLogis\.gradle\codex-home'; .\gradlew.bat :services:slip-service:compileJava --no-daemon --no-parallel`
Expected: BUILD SUCCESSFUL

- [ ] **Step 6: Commit**

```bash
git add services/slip-service/src/main/resources/db/migration/V27__add_slip_revisions.sql services/slip-service/src/main/java/com/samhanair/logis/slip/revision/
git commit -m "feat(slip-restore): slip_revisions 데이터 계층 (V27 + 엔티티/DTO/repo)"
```

---

## Task 2: 스냅샷 캡처 (SlipRevisionService.capture + Slip 직렬화 + mutation 훅)

**Files:**
- Create: `.../slip/revision/service/SlipRevisionService.java`
- Modify: `.../slip/domain/Slip.java` (snapshot 추출 helper `toSnapshot()`)
- Modify: `.../slip/service/SlipService.java` (create/updateSlip/applyOverlayPatch 후 capture)
- Test: `.../test/.../slip/revision/service/SlipRevisionServiceTest.java`

- [ ] **Step 1: 실패 테스트 — capture 가 revision_no 증가 + 스냅샷 저장**

```java
// SlipRevisionServiceTest: capture 2회 → revisionNo 1,2 / snapshot.lines 정합 (repository mock 또는 @DataJpaTest)
@Test void capture_increments_revisionNo_and_stores_snapshot() {
    // given slip(헤더+라인2) → service.capture(slip, "CREATE", actor)
    // then saved.revisionNo == maxRevisionNo+1, saved.snapshot.lines().size()==2, slipNo/slipDate 정합
}
```

- [ ] **Step 2: 테스트 실패 확인** — Run `:services:slip-service:test --tests *SlipRevisionServiceTest`. Expected: FAIL(컴파일/미구현).

- [ ] **Step 3: Slip.toSnapshot() 추가** — Slip.java 에 헤더 필드 + lines(미삭제분)를 SlipSnapshot 으로 변환하는 메서드. lines 는 `getLines().stream().filter(not deleted)`. SlipLine getter 사용(productId/productName/modelName/specification/quantity/unitPrice/lineTotal/note).

- [ ] **Step 4: SlipRevisionService.capture/list 구현**

```java
@Service @Transactional
public class SlipRevisionService {
    private final SlipRevisionRepository repo;
    public SlipRevisionService(SlipRevisionRepository repo) { this.repo = repo; }
    /** 전표 mutation 후 현 상태 스냅샷 1건 기록. 편집과 동일 tx. */
    public SlipRevision capture(Slip slip, String revisionType, Integer sourceRevisionNo,
            UUID actorId, String actorName, String actorColor) {
        int next = repo.maxRevisionNo(slip.getId()) + 1;
        return repo.save(SlipRevision.of(slip.getId(), next, revisionType, sourceRevisionNo,
                slip.getSlipNo(), slip.getSlipDate(), slip.toSnapshot(),
                actorId, actorName, actorColor));
    }
    public List<SlipRevision> list(UUID slipId) { return repo.findBySlipIdOrderByRevisionNoDesc(slipId); }
}
```

- [ ] **Step 5: SlipService mutation 훅** — `create`(L101) 성공 후 `capture(slip,"CREATE",null,actor...)`, `updateSlip`(L244)·`applyOverlayPatch`(L286) 후 `capture(slip,"EDIT",null,actor...)`. actor 는 callerId/callerName(컨트롤러에서 전달받는 기존 파라미터 재사용). SlipService 에 SlipRevisionService 주입.

- [ ] **Step 6: 테스트 통과 확인** — Run 동일. Expected: PASS.

- [ ] **Step 7: Commit** — `git commit -m "feat(slip-restore): 스냅샷 캡처 (capture + mutation 훅)"`

---

## Task 3: point-in-time 복원 (SlipRevisionService.restore + 마감 가드 + SSE)

**Files:**
- Modify: `.../slip/revision/service/SlipRevisionService.java`
- Modify: `.../slip/domain/Slip.java` (`restoreFromSnapshot(SlipSnapshot)` — 헤더 적용 + 라인 전량 교체)
- Modify: `.../slip/service/SlipService.java` (`restoreToRevision` 위임 + SSE)
- Test: `SlipRevisionServiceTest` (restore 케이스 추가)

- [ ] **Step 1: 실패 테스트 — restore 가 헤더+라인 복원 + 신규 RESTORE revision 기록**

```java
@Test void restore_applies_snapshot_and_records_restore_revision() {
    // given rev1(라인2) → 편집 rev2(라인3, 헤더 memo 변경)
    // when restore(slipId, 1, actor)
    // then slip.memo == rev1.memo, slip.lines == rev1 라인2건(추가분 제거), 신규 revisionNo==3 type=RESTORE source=1
}
```

- [ ] **Step 2: 실패 확인**

- [ ] **Step 3: Slip.restoreFromSnapshot(SlipSnapshot) 구현** — 헤더 필드 set(snapshot 값) + 라인 전량 교체(기존 `replaceLines`/`replaceSalesLines` 패턴 재사용: 현 라인 markDeleted → lines.clear() → snapshot.lines() 로 SlipLine.create 후 addAll). slipType(OUTBOUND/INBOUND)에 따라 적절한 교체 경로. `requireNotLocked()` 먼저 호출.

- [ ] **Step 4: SlipRevisionService.restore + SlipService.restoreToRevision 구현**

```java
// SlipRevisionService
public SlipRevision restore(Slip slip, int targetRevisionNo, UUID actorId, String actorName, String actorColor) {
    SlipRevision target = repo.findBySlipIdAndRevisionNo(slip.getId(), targetRevisionNo)
        .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "복원 대상 revision 없음"));
    slip.restoreFromSnapshot(target.getSnapshot());           // 도메인이 requireNotLocked + 라인 교체
    return capture(slip, "RESTORE", targetRevisionNo, actorId, actorName, actorColor);
}
```
SlipService.restoreToRevision(slipId, revNo, callerId, callerName): slip 조회(없으면 404) → `guardLockPolicy(slip, callerId)`(PR-H3 마감 정책) → `revisionService.restore(...)` → SSE `broker.publish(slipId, "slip:restored", payload)` → SlipDetailResponse 반환.

- [ ] **Step 5: 테스트 통과 확인** (라인 add/remove/수정 각 케이스 포함)

- [ ] **Step 6: Commit** — `git commit -m "feat(slip-restore): point-in-time 복원 (snapshot 적용 + 마감 가드 + SSE)"`

---

## Task 4: REST API (SlipRevisionController + DTO + changeSummary)

**Files:**
- Create: `.../slip/revision/web/SlipRevisionController.java`
- Create: `.../slip/revision/web/dto/SlipRevisionResponse.java` (목록), `SlipRevisionDetailResponse.java`(복원 응답=SlipDetailResponse 재사용 가능)
- Modify: `.../slip/revision/service/SlipRevisionService.java` (changeSummary)
- Test: `SlipRevisionServiceTest` (changeSummary)

- [ ] **Step 1: changeSummary 실패 테스트** — 인접 revision 스냅샷 비교 → 헤더 변경 필드 수 + 라인 +n/-n/~n.

- [ ] **Step 2~3: changeSummary 구현** — `SlipRevisionService.summarize(prev, cur)` → record `ChangeSummary(int headerChanged, int lineAdded, int lineRemoved, int lineModified)`. 라인 비교는 productId 기준 매칭(추가/삭제/수량·단가 변경).

- [ ] **Step 4: SlipRevisionController 작성**

```java
@RestController
@RequestMapping("/slips/{slipId}")
public class SlipRevisionController {
    private final SlipService slipService;
    @GetMapping("/revisions")
    @RequirePermission(page = "slip.audit-revert", action = PermissionAction.VIEW)
    public ApiResponse<List<SlipRevisionResponse>> list(@PathVariable UUID slipId) { ... }
    @PostMapping("/revisions/{revisionNo}/restore")
    @RequirePermission(page = "slip.audit-revert", action = PermissionAction.RESTORE)
    public ApiResponse<SlipDetailResponse> restore(
            @PathVariable UUID slipId, @PathVariable int revisionNo,
            @RequestHeader(value = "X-User-Id", required = false) String callerId,
            @RequestHeader(value = "X-User-Name", required = false) String callerName) {
        return ApiResponse.ok(slipService.restoreToRevision(slipId, revisionNo, callerId, callerName));
    }
}
```
> 주의: GET /revisions 는 VIEW, restore 는 RESTORE. actor 추출은 SlipAuditLogController L114-132 패턴(parseActorId → UUID(0,0) fallback, actorName ?? callerId ?? "system", actorColor=null).

- [ ] **Step 5: SlipRevisionResponse DTO** — `revisionNo, revisionType, sourceRevisionNo, slipNo, slipDate, actorName, createdAt, changeSummary`. UUID(actorId) 미노출.

- [ ] **Step 6: 컴파일 + 단위테스트 PASS + Commit** — `git commit -m "feat(slip-restore): 버전이력/복원 REST API + changeSummary"`

---

## Task 5: BE 통합 테스트 (Testcontainers 실 DB)

**Files:**
- Create: `.../test/.../slip/it/SlipRevisionRestoreIT.java`

- [ ] **Step 1: IT 작성** — `extends AbstractPostgresIT`, `@AutoConfigureMockMvc`. 시나리오(각 @Test):
  1. 전표 생성→수정(라인 추가)→`GET /slips/{id}/revisions` 2건(rev1 CREATE, rev2 EDIT) + changeSummary 라인+1.
  2. `POST /slips/{id}/revisions/1/restore` → 200, 응답 lines == rev1, 신규 rev3 RESTORE(source=1).
  3. 라인 삭제 케이스 복원: rev에서 라인 제거 후 복원 시 라인 복구.
  4. 마감 lock(slip.lockFlag=true 또는 FULLY_LOCKED) → restore 409/CONFLICT.
  5. RESTORE 권한 deny: `dynamicPermissionClient.check(any, eq("slip.audit-revert"), eq(RESTORE))=false` → 403. MASTER 헤더 → bypass 200.
  6. 인증 요청 모두 `.header("X-User-Id", <uuid>).header("X-User-Role", <role>)`.
  - stub 패턴: SlipPermissionControllerIT 미러(`@MockBean DynamicPermissionClient`, lenient allow 기본 + deny override). [[feedback_enforcement_real_http_test]] — 권한 stub 은 check 시그니처.

- [ ] **Step 2: 컴파일 검증** — `:services:slip-service:compileTestJava`. (실 IT 실행은 Docker 가용 시 로컬, 아니면 Linux CI.)

- [ ] **Step 3: Commit** — `git commit -m "test(slip-restore): 버전이력/복원 Testcontainers IT"`

---

## Task 6: FE — 버전이력 패널 + 복원

**Files:**
- Create: `clients/desktop/src/renderer/api/slipRevision.ts`
- Create: `clients/desktop/src/renderer/components/audit/SlipVersionHistoryPanel.tsx`
- Modify: `clients/desktop/src/renderer/routes/SlipDetailPage.tsx`
- Modify: `clients/desktop/src/renderer/realtime/SlipRealtimeClient.ts`

- [ ] **Step 1: API 클라이언트** — `api/slipRevision.ts`: `listRevisions(slipId): Promise<SlipRevision[]>` → `GET /api/v1/slips/{id}/revisions`, `restoreRevision(slipId, revisionNo)` → `POST /api/v1/slips/{id}/revisions/{revisionNo}/restore`. interface `SlipRevision`(revisionNo/revisionType/slipNo/actorName/createdAt/changeSummary). (기존 `api/slipAudit.ts` 경로 패턴 따름. BE 경로 `/revisions/{n}/restore` 정확히.)

- [ ] **Step 2: SlipVersionHistoryPanel.tsx** — react-query `['slipRevisions', slipId]`. revision 목록(`{slipNo}` + 시각 + actorName + changeSummary "헤더 N · 라인 +a/-b/~c"). RESTORE 항목 배지. 각 항목 "이 시점으로 복원" 버튼 → confirm modal → `restoreRevision` mutation → 성공 시 `['slip', slipId]`+`['slipRevisions',slipId]` invalidate + 토스트. UUID 비노출(actorName만). 기존 AuditOverlaySection 스타일/토큰 재사용.

- [ ] **Step 3: SlipDetailPage 통합** — 상세 화면에 `<SlipVersionHistoryPanel slipId={id} />` 추가(기존 AuditOverlay 인접).

- [ ] **Step 4: SSE** — SlipRealtimeClient 에 `slip:restored` 수신 → `['slip', id]`+`['slipRevisions', id]` invalidate.

- [ ] **Step 5: typecheck** — `cd clients/desktop; npm.cmd run typecheck`. Expected: PASS.

- [ ] **Step 6: Commit** — `git commit -m "feat(slip-restore): FE 버전이력 패널 + 복원 + SSE"`

---

## Task 7: FE Playwright + 문서 동기화

**Files:**
- Create: `clients/desktop/playwright/.../slip-version-history.spec.ts`
- Create: `docs/dev-reports/phase-2-1-slip-restore-version-history.md`
- Modify: `migration/decisions/DECISIONS.md` (D-RST-01~), `docs/samhan-public-overview.html`(Phase 2 진행), README(해당 service).

- [ ] **Step 1: Playwright spec** — `/revisions` mock(2건) + restore mock → 패널 렌더 + 복원 confirm 흐름 + 토스트. (Vite:5174 + `PLAYWRIGHT_SKIP_WEB_SERVER=1` 패턴.)
- [ ] **Step 2: dev-report 작성** — 목적/데이터모델/캡처·복원 흐름/API/FE/검증/범위(spec 미러 + 함수 Javadoc 3-layer [[feedback_function_documentation]]).
- [ ] **Step 3: DECISIONS** — D-RST-01(snapshot 접근법) / D-RST-02(slip 첫 도메인 + 도메인별 분해) / D-RST-03(slip.audit-revert page 재사용, overlay 공존).
- [ ] **Step 4: overview.html + README 동기화** ([[feedback_samhan_public_overview_sync]] [[feedback_continuous_docs_sync]]).
- [ ] **Step 5: Commit** — `git commit -m "test(slip-restore): Playwright + docs(dev-report/DECISIONS/overview) 동기화"`

---

## Self-Review (spec 대조)

- spec §2 데이터모델 → Task 1 ✓ · §3 캡처 → Task 2 ✓ · §4 복원/가드 → Task 3 ✓ · §5 권한(RESTORE/마감/PARTNER deny/MASTER) → Task 3·4·5 ✓ · §6 API+FE → Task 4·6 ✓ · §7 테스트 → Task 5·7 ✓ · §8 범위(타도메인/un-delete OUT) → 본 plan slip 한정 ✓.
- placeholder: 코드 골격은 실제 시그니처(grounding) 기반. 일부 getter/DTO 필드 나열은 구현 시 Slip.java 실 필드 확인 필요(명시). type 일관: capture/restore/list/summarize 시그니처 Task 간 일치.
- 미해결 정합: FE `slipAudit.ts` 의 기존 revert 경로(`/revert` vs `/audit/revert`) 불일치는 본 plan 범위 밖(신규 `/revisions/{n}/restore` 사용). 기존 audit-revert(overlay)는 불변.

---

## Execution
Codex 다운 → **Claude 에이전트 subagent-driven-development**. Task 단위 fresh 에이전트 + 단계 간 검증. 완료 후 dual 리뷰(Claude 5-agent, Codex 측 회복 시 추가) → CI → PM 머지.
