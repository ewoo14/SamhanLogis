# Samhan Public 배차 메뉴 (Phase A) — 구현 plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **5-team 디스패치 패턴** ([[feedback_multi_agent_team_pattern]]) — BE/FE/Designer/QA/DevOps 병렬, TM 통합, PM CI watch + 개발책임자 머지.

**Goal:** Samhan Public 의 출고전표 (slip-service) → 배차담당자 → 아로로지스 발송 흐름의 **배차 메뉴 UI + service-to-service 통신** 구현 (Phase A, Mock matcher 활용).

**Architecture:** slip-service 안 신규 3 entity (DispatchTask + DispatchVehicleGroup + DispatchVehicleGroupSlip) + Slip.dispatchStatus column + `@dnd-kit/core` drag-and-drop (desktop mouse + mobile touch) + REST + X-Internal-Token 통신 (Eureka 공유) + arologis Mock matcher 회신.

**Tech Stack:** Spring Boot 3 / Java 17 / PostgreSQL (Flyway) / Eureka / React 19 + `@dnd-kit/core` / Electron + Vite (desktop) / RN Expo (mobile-staff) / WebClient (BE outbound) / GitHub Actions.

**참조 spec:** `docs/superpowers/specs/2026-05-14-samhan-dispatch-board-design.md`

---

## 팀 디스패치 구조

| 팀 | scope | 핵심 산출 |
|---|---|---|
| **BE** | slip-service 신규 3 entity + 1 column + 5 service + 2 controller + 2 client + Flyway V16/V17. arologis ArologisInternalController 확장 + DispatchReceiveService + SlipDispatchTaskClient + VehicleTonnage 확장 (V10). 단위 ~36 + IT ~31. | `services/slip-service/**`, `services/arologis-service/**` |
| **FE** | desktop `/dispatch-board` 페이지 (DispatchBoardPage + VehicleGroupCard + AddVehicleModal + SlipDetailModal + DispatchCompleteDialog) + `@dnd-kit/core` 통합 + 사이드바 메뉴. mobile-staff `/dispatch-board` 화면 (tab 전환 + TouchSensor). | `clients/desktop/**`, `clients/mobile-staff/**` |
| **Designer** | 5 mock 파일 (`docs/uiux/samhan-dispatch-board/01~05.md`) — desktop 메인 / mobile tab / 차량 추가 modal / 출고전표 상세 / 상태 배지 | `docs/uiux/samhan-dispatch-board/**` |
| **QA** | 6 시나리오 + 검증 SQL + 회귀 ~98 절차 + 5단계 롤백 runbook + **Mock 캡처 PNG 6장** (PowerShell System.Drawing, UTF-8 BOM, [[feedback_pr_qa_screenshots]] 가드) | `docs/qa/samhan-dispatch-board/**` |
| **DevOps** | 환경변수 (`SAMHAN_AROLOGIS_DISPATCH_URL` + `SAMHAN_SLIP_DISPATCH_TASK_URL`) + `docker-compose.yml` + Eureka 등록 가드 | `infrastructure/**`, `.env.example` |

---

# Team 1: BE

## 파일 구조

```
services/slip-service/
├── src/main/java/com/samhanair/logis/slip/
│   ├── domain/dispatch/
│   │   ├── DispatchTask.java                       (NEW)
│   │   ├── DispatchTaskStatus.java                 (NEW — DRAFT/DISPATCHING/DISPATCHED/FAILED)
│   │   ├── DispatchVehicleGroup.java               (NEW)
│   │   ├── DispatchVehicleGroupSlip.java           (NEW)
│   │   ├── DispatchVehicleType.java                (NEW — 9 enum)
│   │   └── SlipDispatchStatus.java                 (NEW — UNDISPATCHED/DISPATCHING/DISPATCHED)
│   ├── domain/Slip.java                            (수정 — dispatchStatus 추가)
│   ├── repository/dispatch/
│   │   ├── DispatchTaskRepository.java             (NEW)
│   │   ├── DispatchVehicleGroupRepository.java     (NEW)
│   │   └── DispatchVehicleGroupSlipRepository.java (NEW)
│   ├── service/dispatch/
│   │   ├── DispatchTaskService.java                (NEW — DRAFT 생명주기)
│   │   ├── DispatchTaskCompletionService.java      (NEW — 배차 완료 → arologis 발송)
│   │   ├── DispatchTaskConfirmService.java         (NEW — arologis 회신 처리 DISPATCHED)
│   │   ├── DispatchTaskUnavailableService.java     (NEW — arologis 회신 처리 FAILED)
│   │   └── DispatchTaskBoardQueryService.java      (NEW — 미배차 50/회 페이지네이션)
│   ├── controller/
│   │   ├── DispatchBoardAdminController.java       (NEW — admin GET 페이지네이션 + 상세)
│   │   ├── DispatchTaskAdminController.java        (NEW — admin POST/PUT/DELETE DispatchTask + Group + Slip)
│   │   └── DispatchTaskInternalController.java     (NEW — arologis 회신 receive: confirm/unavailable)
│   ├── client/
│   │   └── ArologisDispatchClient.java             (NEW — outbound POST /internal/arologis/dispatches)
│   ├── dto/dispatch/
│   │   ├── DispatchTaskResponse.java               (NEW)
│   │   ├── DispatchVehicleGroupResponse.java       (NEW)
│   │   ├── DispatchVehicleGroupSlipResponse.java   (NEW)
│   │   ├── CreateDispatchTaskRequest.java          (NEW)
│   │   ├── AddVehicleGroupRequest.java             (NEW)
│   │   ├── AssignSlipToGroupRequest.java           (NEW)
│   │   ├── DispatchTaskConfirmRequest.java         (NEW — arologis → slip 회신 body)
│   │   ├── DispatchTaskUnavailableRequest.java     (NEW)
│   │   ├── ArologisDispatchRequest.java            (NEW — slip → arologis outbound)
│   │   └── ArologisDispatchResponse.java           (NEW — arologis ack)
│   └── …
└── src/main/resources/db/migration/
    ├── V16__add_dispatch_task_tables.sql           (NEW)
    └── V17__add_slip_dispatch_status.sql           (NEW)

services/arologis-service/
├── src/main/java/com/samhanair/logis/arologis/
│   ├── domain/VehicleTonnage.java                  (수정 — 11 값, legacy 2 deprecated)
│   ├── service/DispatchReceiveService.java         (NEW — Samhan Public 발송 receive + Vehicle 생성 + Mock matcher)
│   ├── controller/ArologisInternalController.java  (확장 — POST /dispatches 추가)
│   ├── client/SlipDispatchTaskClient.java          (NEW — async 회신 outbound)
│   ├── dto/                                        (slip-service 의 DTO mirror)
│   └── …
└── src/main/resources/db/migration/
    └── V10__expand_vehicle_tonnage.sql             (NEW)
```

---

## BE Task B1: slip-service VehicleType + DispatchTaskStatus enum + SlipDispatchStatus enum

**Files:**
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/dispatch/DispatchVehicleType.java`
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/dispatch/DispatchTaskStatus.java`
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/dispatch/SlipDispatchStatus.java`
- Test: `services/slip-service/src/test/java/com/samhanair/logis/slip/domain/dispatch/DispatchVehicleTypeTest.java`

- [ ] **B1.1 — 3 enum 작성**

```java
// DispatchVehicleType.java — 9 active (legacy arologis enum 2개 미포함)
public enum DispatchVehicleType {
    MOTORCYCLE("오토바이"),
    DAMAS("다마스"),
    TONNAGE_1("1톤"),
    TONNAGE_1_5("1.5톤"),
    TONNAGE_2_5("2.5톤"),
    TONNAGE_3("3톤"),
    TONNAGE_5("5톤"),
    TONNAGE_10("10톤"),
    TONNAGE_20("20톤");

    private final String displayName;
    DispatchVehicleType(String displayName) { this.displayName = displayName; }
    public String getDisplayName() { return displayName; }
}

// DispatchTaskStatus.java
public enum DispatchTaskStatus { DRAFT, DISPATCHING, DISPATCHED, FAILED }

// SlipDispatchStatus.java
public enum SlipDispatchStatus { UNDISPATCHED, DISPATCHING, DISPATCHED }
```

- [ ] **B1.2 — DispatchVehicleTypeTest (display name 검증, 2 case)**

- [ ] **B1.3 — commit**

```bash
git commit -m "feat(samhan-dispatch-board): VehicleType 9 + DispatchTaskStatus 4 + SlipDispatchStatus 3 enum"
```

---

## BE Task B2: Flyway V16 (3 dispatch 테이블)

**Files:**
- Create: `services/slip-service/src/main/resources/db/migration/V16__add_dispatch_task_tables.sql`

- [ ] **B2.1 — V16 작성**

```sql
-- V16__add_dispatch_task_tables.sql
CREATE TABLE dispatch_task (
    id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    task_code             VARCHAR(32)  NOT NULL,
    dispatch_date         DATE         NOT NULL,
    status                VARCHAR(32)  NOT NULL CHECK (status IN ('DRAFT','DISPATCHING','DISPATCHED','FAILED')),
    arologis_dispatch_id  UUID,
    failure_reason        VARCHAR(500),
    created_at            TIMESTAMPTZ  NOT NULL,
    created_by            VARCHAR(100) NOT NULL,
    updated_at            TIMESTAMPTZ  NOT NULL,
    updated_by            VARCHAR(100) NOT NULL,
    is_deleted            BOOLEAN      NOT NULL DEFAULT FALSE,
    deleted_at            TIMESTAMPTZ,
    deleted_by            VARCHAR(100)
);
CREATE UNIQUE INDEX uq_dispatch_task_code_active ON dispatch_task(task_code) WHERE is_deleted = FALSE;
CREATE INDEX idx_dispatch_task_date_status ON dispatch_task(dispatch_date, status) WHERE is_deleted = FALSE;

CREATE TABLE dispatch_vehicle_group (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_task_id   UUID         NOT NULL REFERENCES dispatch_task(id),
    sequence           INTEGER      NOT NULL,
    vehicle_type       VARCHAR(32)  NOT NULL CHECK (vehicle_type IN ('MOTORCYCLE','DAMAS','TONNAGE_1','TONNAGE_1_5','TONNAGE_2_5','TONNAGE_3','TONNAGE_5','TONNAGE_10','TONNAGE_20')),
    created_at         TIMESTAMPTZ  NOT NULL,
    created_by         VARCHAR(100) NOT NULL,
    updated_at         TIMESTAMPTZ  NOT NULL,
    updated_by         VARCHAR(100) NOT NULL,
    is_deleted         BOOLEAN      NOT NULL DEFAULT FALSE,
    deleted_at         TIMESTAMPTZ,
    deleted_by         VARCHAR(100)
);
CREATE UNIQUE INDEX uq_vehicle_group_task_seq_active ON dispatch_vehicle_group(dispatch_task_id, sequence) WHERE is_deleted = FALSE;

CREATE TABLE dispatch_vehicle_group_slip (
    id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_group_id      UUID         NOT NULL REFERENCES dispatch_vehicle_group(id),
    slip_id               UUID         NOT NULL,
    sequence              INTEGER      NOT NULL,
    created_at            TIMESTAMPTZ  NOT NULL,
    created_by            VARCHAR(100) NOT NULL,
    updated_at            TIMESTAMPTZ  NOT NULL,
    updated_by            VARCHAR(100) NOT NULL,
    is_deleted            BOOLEAN      NOT NULL DEFAULT FALSE,
    deleted_at            TIMESTAMPTZ,
    deleted_by            VARCHAR(100)
);
CREATE UNIQUE INDEX uq_vehicle_group_slip_active ON dispatch_vehicle_group_slip(vehicle_group_id, slip_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_vehicle_group_slip_slip ON dispatch_vehicle_group_slip(slip_id) WHERE is_deleted = FALSE;
```

- [ ] **B2.2 — commit**

```bash
git commit -m "feat(samhan-dispatch-board): Flyway V16 — dispatch_task + group + slip 3 테이블 + partial unique"
```

---

## BE Task B3: Flyway V17 (slip.dispatch_status column)

**Files:**
- Create: `services/slip-service/src/main/resources/db/migration/V17__add_slip_dispatch_status.sql`

- [ ] **B3.1 — V17 작성**

```sql
ALTER TABLE slip
  ADD COLUMN dispatch_status VARCHAR(32) NOT NULL DEFAULT 'UNDISPATCHED'
    CHECK (dispatch_status IN ('UNDISPATCHED','DISPATCHING','DISPATCHED'));
CREATE INDEX idx_slip_dispatch_status_active ON slip(dispatch_status) WHERE is_deleted = FALSE;
```

- [ ] **B3.2 — commit**

```bash
git commit -m "feat(samhan-dispatch-board): Flyway V17 — slip.dispatch_status column 추가"
```

---

## BE Task B4: DispatchTask + DispatchVehicleGroup + DispatchVehicleGroupSlip entity + repository

**Files:**
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/dispatch/DispatchTask.java`
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/dispatch/DispatchVehicleGroup.java`
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/dispatch/DispatchVehicleGroupSlip.java`
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/repository/dispatch/DispatchTaskRepository.java`
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/repository/dispatch/DispatchVehicleGroupRepository.java`
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/repository/dispatch/DispatchVehicleGroupSlipRepository.java`
- Test: `services/slip-service/src/test/java/com/samhanair/logis/slip/repository/dispatch/DispatchTaskRepositoryIT.java`

- [ ] **B4.1 — failing IT (DispatchTaskRepositoryIT)**

```java
@SpringBootTest
class DispatchTaskRepositoryIT extends AbstractPostgresIT {
    @Autowired DispatchTaskRepository repo;

    @Test void save_and_lookup_by_code_active() {
        DispatchTask t = DispatchTask.create("DT-20260514-001", LocalDate.now(), "ewoo");
        repo.save(t);
        assertThat(repo.findByTaskCodeAndIsDeletedFalse("DT-20260514-001")).isPresent();
    }

    @Test void soft_delete_excluded() {
        DispatchTask t = DispatchTask.create("DT-x", LocalDate.now(), "ewoo");
        t.softDelete("system");
        repo.save(t);
        assertThat(repo.findByTaskCodeAndIsDeletedFalse("DT-x")).isEmpty();
    }
}
```

- [ ] **B4.2 — DispatchTask entity**

```java
@Entity
@Table(name = "dispatch_task")
@SQLRestriction("is_deleted = false")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DispatchTask extends BaseEntity {
    @Id @GeneratedValue private UUID id;
    @Column(name = "task_code", nullable = false, length = 32) private String taskCode;
    @Column(name = "dispatch_date", nullable = false) private LocalDate dispatchDate;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 32) private DispatchTaskStatus status;
    @Column(name = "arologis_dispatch_id") private UUID arologisDispatchId;
    @Column(name = "failure_reason", length = 500) private String failureReason;

    public static DispatchTask create(String taskCode, LocalDate dispatchDate, String createdBy) {
        DispatchTask t = new DispatchTask();
        t.taskCode = taskCode; t.dispatchDate = dispatchDate; t.status = DispatchTaskStatus.DRAFT;
        return t;
    }

    public void markDispatching() { this.status = DispatchTaskStatus.DISPATCHING; }
    public void markDispatched(UUID arologisDispatchId) {
        this.status = DispatchTaskStatus.DISPATCHED;
        this.arologisDispatchId = arologisDispatchId;
    }
    public void markFailed(String reason) {
        this.status = DispatchTaskStatus.FAILED;
        this.failureReason = reason;
    }
}
```

- [ ] **B4.3 — DispatchVehicleGroup + DispatchVehicleGroupSlip entity (동일 패턴, 본 단계에서 작성)**

- [ ] **B4.4 — 3 repository interfaces (`JpaRepository<X, UUID>` 상속 + `findByXxxAndIsDeletedFalse`)**

```java
public interface DispatchTaskRepository extends JpaRepository<DispatchTask, UUID> {
    Optional<DispatchTask> findByTaskCodeAndIsDeletedFalse(String taskCode);
    Page<DispatchTask> findByDispatchDateBetweenAndStatusInAndIsDeletedFalse(
        LocalDate from, LocalDate to, Set<DispatchTaskStatus> statuses, Pageable pageable);
}

public interface DispatchVehicleGroupRepository extends JpaRepository<DispatchVehicleGroup, UUID> {
    List<DispatchVehicleGroup> findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(UUID taskId);
}

public interface DispatchVehicleGroupSlipRepository extends JpaRepository<DispatchVehicleGroupSlip, UUID> {
    List<DispatchVehicleGroupSlip> findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(UUID groupId);
    List<DispatchVehicleGroupSlip> findBySlipIdAndIsDeletedFalse(UUID slipId);
}
```

- [ ] **B4.5 — IT 실행 + 통과 + commit**

```bash
git commit -m "feat(samhan-dispatch-board): DispatchTask + VehicleGroup + Slip 매핑 entity/repository + IT"
```

---

## BE Task B5: Slip.dispatchStatus column 매핑

**Files:**
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/Slip.java`
- Test: 기존 `SlipRepositoryTest` 회귀

- [ ] **B5.1 — Slip entity 에 column 추가**

```java
@Enumerated(EnumType.STRING)
@Column(name = "dispatch_status", nullable = false, length = 32)
private SlipDispatchStatus dispatchStatus = SlipDispatchStatus.UNDISPATCHED;

public void markDispatching() { this.dispatchStatus = SlipDispatchStatus.DISPATCHING; }
public void markDispatched() { this.dispatchStatus = SlipDispatchStatus.DISPATCHED; }
public void markUndispatched() { this.dispatchStatus = SlipDispatchStatus.UNDISPATCHED; }
```

- [ ] **B5.2 — 기존 SlipRepositoryTest 회귀 PASS 확인 (default 값 검증)**

- [ ] **B5.3 — commit**

```bash
git commit -m "feat(samhan-dispatch-board): Slip.dispatchStatus 매핑 + 3 transition 메서드"
```

---

## BE Task B6: DispatchTaskService (DRAFT 생명주기 + 멱등성)

**Files:**
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/service/dispatch/DispatchTaskService.java`
- Test: `services/slip-service/src/test/java/com/samhanair/logis/slip/service/dispatch/DispatchTaskServiceTest.java`

- [ ] **B6.1 — failing test (~6 case)**

```java
@ExtendWith(MockitoExtension.class)
class DispatchTaskServiceTest {
    @Mock DispatchTaskRepository taskRepo;
    @Mock DispatchVehicleGroupRepository groupRepo;
    @Mock DispatchVehicleGroupSlipRepository slipMapRepo;
    @InjectMocks DispatchTaskService svc;

    @Test void create_assigns_unique_code() { /* ... */ }
    @Test void add_vehicle_group_increments_sequence() { /* ... */ }
    @Test void remove_vehicle_group_soft_deletes() { /* ... */ }
    @Test void assign_slip_to_group_appends_sequence() { /* ... */ }
    @Test void reorder_slips_in_group() { /* ... */ }
    @Test void remove_slip_from_group_soft_deletes() { /* ... */ }
}
```

- [ ] **B6.2 — Service 구현 (대체로 repo 위임 + 비즈니스 규칙)**

```java
@Service @RequiredArgsConstructor @Transactional
public class DispatchTaskService {
    private final DispatchTaskRepository taskRepo;
    private final DispatchVehicleGroupRepository groupRepo;
    private final DispatchVehicleGroupSlipRepository slipMapRepo;

    public DispatchTask createTask(LocalDate date, String actor) {
        String code = generateTaskCode(date);
        DispatchTask t = DispatchTask.create(code, date, actor);
        return taskRepo.save(t);
    }

    public DispatchVehicleGroup addVehicleGroup(UUID taskId, DispatchVehicleType type, String actor) {
        int nextSeq = groupRepo.findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(taskId).size() + 1;
        DispatchVehicleGroup g = DispatchVehicleGroup.create(taskId, nextSeq, type);
        return groupRepo.save(g);
    }

    public void removeVehicleGroup(UUID groupId, String actor) {
        groupRepo.findById(groupId).ifPresent(g -> { g.softDelete(actor); groupRepo.save(g); });
    }

    public DispatchVehicleGroupSlip assignSlip(UUID groupId, UUID slipId, String actor) {
        int nextSeq = slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(groupId).size() + 1;
        DispatchVehicleGroupSlip m = DispatchVehicleGroupSlip.create(groupId, slipId, nextSeq);
        return slipMapRepo.save(m);
    }

    public void reorderSlips(UUID groupId, List<UUID> orderedSlipIds, String actor) {
        var maps = slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(groupId);
        Map<UUID, DispatchVehicleGroupSlip> byId = maps.stream()
            .collect(Collectors.toMap(DispatchVehicleGroupSlip::getSlipId, m -> m));
        for (int i = 0; i < orderedSlipIds.size(); i++) {
            byId.get(orderedSlipIds.get(i)).updateSequence(i + 1);
        }
        slipMapRepo.saveAll(maps);
    }

    public void removeSlipFromGroup(UUID groupId, UUID slipId, String actor) {
        slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(groupId).stream()
            .filter(m -> m.getSlipId().equals(slipId))
            .findFirst()
            .ifPresent(m -> { m.softDelete(actor); slipMapRepo.save(m); });
    }

    private String generateTaskCode(LocalDate date) {
        String prefix = "DT-" + date.format(DateTimeFormatter.BASIC_ISO_DATE);
        for (int n = 1; n < 1000; n++) {
            String code = prefix + "-" + String.format("%03d", n);
            if (taskRepo.findByTaskCodeAndIsDeletedFalse(code).isEmpty()) return code;
        }
        throw new IllegalStateException("daily counter exceeded 999");
    }
}
```

- [ ] **B6.3 — 통과 + commit**

```bash
git commit -m "feat(samhan-dispatch-board): DispatchTaskService — DRAFT 생명주기 (create/group/slip) + daily counter"
```

---

## BE Task B7: DispatchTaskBoardQueryService (페이지네이션 + 필터)

**Files:**
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/service/dispatch/DispatchTaskBoardQueryService.java`
- Test: `services/slip-service/src/test/java/com/samhanair/logis/slip/service/dispatch/DispatchTaskBoardQueryServiceTest.java`

- [ ] **B7.1 — failing test (~4 case)**

페이지네이션 50/회 + 날짜 ±1일 default + 상태 multi-select 필터.

- [ ] **B7.2 — Service 구현**

```java
@Service @RequiredArgsConstructor @Transactional(readOnly = true)
public class DispatchTaskBoardQueryService {
    private final SlipRepository slipRepo;

    /**
     * 미배차 출고전표 페이지네이션 — default: Asia/Seoul today ±1일 + UNDISPATCHED.
     */
    public Page<Slip> findUnDispatchedSlips(
            LocalDate from, LocalDate to, Set<SlipDispatchStatus> statuses, int page, int size) {
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        return slipRepo.findByCreatedAtBetweenAndDispatchStatusInAndIsDeletedFalse(
            from.atStartOfDay().atZone(ZoneId.of("Asia/Seoul")).toInstant(),
            to.plusDays(1).atStartOfDay().atZone(ZoneId.of("Asia/Seoul")).toInstant(),
            statuses, pageable);
    }
}
```

- [ ] **B7.3 — SlipRepository 에 신규 메서드 추가**

```java
Page<Slip> findByCreatedAtBetweenAndDispatchStatusInAndIsDeletedFalse(
    Instant fromInstant, Instant toInstant, Set<SlipDispatchStatus> statuses, Pageable pageable);
```

- [ ] **B7.4 — commit**

```bash
git commit -m "feat(samhan-dispatch-board): DispatchTaskBoardQueryService — 50/회 페이지네이션 + 날짜 ±1일 + 상태 필터"
```

---

## BE Task B8: ArologisDispatchClient (outbound)

**Files:**
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/client/ArologisDispatchClient.java`
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/dto/dispatch/ArologisDispatchRequest.java`
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/dto/dispatch/ArologisDispatchResponse.java`
- Test: `services/slip-service/src/test/java/com/samhanair/logis/slip/client/ArologisDispatchClientTest.java`

- [ ] **B8.1 — DTO record 작성**

```java
public record ArologisDispatchRequest(
    UUID samhanDispatchTaskId,
    String taskCode,
    LocalDate dispatchDate,
    List<VehicleGroup> vehicles
) {
    public record VehicleGroup(int sequence, String vehicleType, List<SlipRef> slips) {}
    public record SlipRef(
        int sequence, UUID slipId, String slipNumber,
        String partnerCode, String partnerName, String address,
        String recipientPhoneNumber, String notes
    ) {}
}

public record ArologisDispatchResponse(
    UUID arologisDispatchId,
    UUID samhanDispatchTaskId,
    Instant acknowledgedAt,
    Instant matchingStartedAt
) {}
```

- [ ] **B8.2 — Client 구현 (WebClient + X-Internal-Token + Eureka)**

```java
@Component @RequiredArgsConstructor
public class ArologisDispatchClient {
    private final WebClient.Builder webClientBuilder;
    @Value("${samhan.arologis.dispatch.url:http://arologis-service:8097}")
    private String arologisBaseUrl;
    @Value("${samhan.internal.token}")
    private String internalToken;

    public ArologisDispatchResponse send(ArologisDispatchRequest req) {
        return webClientBuilder.build()
            .post()
            .uri(arologisBaseUrl + "/internal/arologis/dispatches")
            .header("X-Internal-Token", internalToken)
            .bodyValue(req)
            .retrieve()
            .bodyToMono(ArologisDispatchResponse.class)
            .timeout(Duration.ofSeconds(5))
            .block();
    }
}
```

- [ ] **B8.3 — Test (@MockBean WebClient)**

```java
@SpringBootTest
class ArologisDispatchClientTest {
    @Autowired ArologisDispatchClient client;
    @MockBean WebClient.Builder builder;
    @Test void send_with_internal_token() { /* exchangeMock ... */ }
}
```

- [ ] **B8.4 — commit**

```bash
git commit -m "feat(samhan-dispatch-board): ArologisDispatchClient — WebClient + X-Internal-Token + 5s timeout"
```

---

## BE Task B9: DispatchTaskCompletionService (배차 완료 → 발송)

**Files:**
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/service/dispatch/DispatchTaskCompletionService.java`
- Test: `services/slip-service/src/test/java/com/samhanair/logis/slip/service/dispatch/DispatchTaskCompletionServiceTest.java`

- [ ] **B9.1 — failing test (~4 case)**

DispatchTask DRAFT → ArologisDispatchClient 호출 → DispatchTask DISPATCHING + 매핑된 slip 의 dispatchStatus DISPATCHING.

- [ ] **B9.2 — Service 구현**

```java
@Service @RequiredArgsConstructor @Transactional
public class DispatchTaskCompletionService {
    private final DispatchTaskRepository taskRepo;
    private final DispatchVehicleGroupRepository groupRepo;
    private final DispatchVehicleGroupSlipRepository slipMapRepo;
    private final SlipRepository slipRepo;
    private final ArologisDispatchClient arologisClient;

    public DispatchTask dispatch(UUID taskId, String actor) {
        DispatchTask task = taskRepo.findById(taskId)
            .orElseThrow(() -> new EntityNotFoundException("DispatchTask " + taskId));
        if (task.getStatus() != DispatchTaskStatus.DRAFT) {
            throw new IllegalStateException("Only DRAFT can dispatch; current=" + task.getStatus());
        }

        // 1. payload 조립
        List<DispatchVehicleGroup> groups = groupRepo.findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(taskId);
        List<ArologisDispatchRequest.VehicleGroup> vehiclesPayload = groups.stream().map(g -> {
            List<DispatchVehicleGroupSlip> maps = slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(g.getId());
            List<ArologisDispatchRequest.SlipRef> slipsRefs = maps.stream().map(m -> {
                Slip slip = slipRepo.findById(m.getSlipId()).orElseThrow();
                return new ArologisDispatchRequest.SlipRef(
                    m.getSequence(), slip.getId(), slip.getSlipNumber(),
                    slip.getPartnerCode(), slip.getPartnerName(), slip.getAddress(),
                    slip.getRecipientPhoneNumber(), slip.getNotes());
            }).toList();
            return new ArologisDispatchRequest.VehicleGroup(g.getSequence(), g.getVehicleType().name(), slipsRefs);
        }).toList();

        ArologisDispatchRequest req = new ArologisDispatchRequest(
            task.getId(), task.getTaskCode(), task.getDispatchDate(), vehiclesPayload);

        // 2. 발송
        ArologisDispatchResponse res = arologisClient.send(req);

        // 3. 상태 갱신
        task.markDispatching();
        taskRepo.save(task);

        groups.forEach(g -> {
            slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(g.getId()).forEach(m -> {
                Slip s = slipRepo.findById(m.getSlipId()).orElseThrow();
                s.markDispatching();
                slipRepo.save(s);
            });
        });

        return task;
    }
}
```

- [ ] **B9.3 — 통과 + commit**

```bash
git commit -m "feat(samhan-dispatch-board): DispatchTaskCompletionService — DRAFT → DISPATCHING + arologis 발송"
```

---

## BE Task B10: DispatchTaskConfirmService + DispatchTaskUnavailableService (회신 처리)

**Files:**
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/service/dispatch/DispatchTaskConfirmService.java`
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/service/dispatch/DispatchTaskUnavailableService.java`
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/dispatch/MatchedDriver.java` (slip-service 안 신규)
- Test: 단위 test 2 service, ~5 + ~4 case

- [ ] **B10.1 — MatchedDriver entity 추가** (vehicle_group ↔ driver 매핑)

```java
@Entity
@Table(name = "dispatch_matched_driver")
@SQLRestriction("is_deleted = false")
@Getter @NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MatchedDriver extends BaseEntity {
    @Id @GeneratedValue private UUID id;
    @Column(name = "vehicle_group_id", nullable = false) private UUID vehicleGroupId;
    @Column(name = "driver_code", nullable = false, length = 32) private String driverCode;
    @Column(name = "driver_name", nullable = false, length = 100) private String driverName;
    @Column(name = "driver_phone_number", nullable = false, length = 20) private String driverPhoneNumber;
    @Column(name = "driver_source", nullable = false, length = 32) private String driverSource;
}
```

- [ ] **B10.2 — Flyway V16 에 `dispatch_matched_driver` 테이블 같이 추가** (B2 갱신)

- [ ] **B10.3 — DispatchTaskConfirmService 구현**

```java
@Service @RequiredArgsConstructor @Transactional
public class DispatchTaskConfirmService {
    private final DispatchTaskRepository taskRepo;
    private final DispatchVehicleGroupRepository groupRepo;
    private final DispatchVehicleGroupSlipRepository slipMapRepo;
    private final SlipRepository slipRepo;
    private final MatchedDriverRepository matchedRepo;
    private final NotificationClient notificationClient;

    public void confirm(UUID taskId, DispatchTaskConfirmRequest req, String actor) {
        DispatchTask task = taskRepo.findById(taskId).orElseThrow();
        task.markDispatched(req.arologisDispatchId());
        taskRepo.save(task);

        // matched driver 저장
        List<DispatchVehicleGroup> groups = groupRepo.findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(taskId);
        Map<Integer, DispatchVehicleGroup> bySeq = groups.stream()
            .collect(Collectors.toMap(DispatchVehicleGroup::getSequence, g -> g));

        req.matchedDrivers().forEach(md -> {
            DispatchVehicleGroup g = bySeq.get(md.vehicleGroupSequence());
            MatchedDriver matched = MatchedDriver.create(
                g.getId(), md.driverCode(), md.driverName(), md.driverPhoneNumber(), md.source());
            matchedRepo.save(matched);

            // 매핑된 slip 모두 DISPATCHED
            slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(g.getId()).forEach(m -> {
                Slip s = slipRepo.findById(m.getSlipId()).orElseThrow();
                s.markDispatched();
                slipRepo.save(s);
            });
        });

        // notification (배차담당자 알림)
        notificationClient.sendDispatchConfirmed(task.getTaskCode(), actor);
    }
}
```

- [ ] **B10.4 — DispatchTaskUnavailableService 구현**

```java
@Service @RequiredArgsConstructor @Transactional
public class DispatchTaskUnavailableService {
    /* taskRepo + groupRepo + slipMapRepo + slipRepo + notificationClient */

    public void unavailable(UUID taskId, DispatchTaskUnavailableRequest req, String actor) {
        DispatchTask task = taskRepo.findById(taskId).orElseThrow();
        task.markFailed(req.reason());
        taskRepo.save(task);

        // 실패한 vehicle group 의 slip UNDISPATCHED 복귀
        List<DispatchVehicleGroup> groups = groupRepo.findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(taskId);
        Map<Integer, DispatchVehicleGroup> bySeq = groups.stream()
            .collect(Collectors.toMap(DispatchVehicleGroup::getSequence, g -> g));

        req.failedVehicleGroups().forEach(seq -> {
            DispatchVehicleGroup g = bySeq.get(seq);
            slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(g.getId()).forEach(m -> {
                Slip s = slipRepo.findById(m.getSlipId()).orElseThrow();
                s.markUndispatched();
                slipRepo.save(s);
            });
        });

        notificationClient.sendDispatchFailed(task.getTaskCode(), req.reason(), actor);
    }
}
```

- [ ] **B10.5 — Test + commit**

```bash
git commit -m "feat(samhan-dispatch-board): DispatchTaskConfirm/Unavailable Service + MatchedDriver entity"
```

---

## BE Task B11: DispatchBoardAdminController + DispatchTaskAdminController + DispatchTaskInternalController

**Files:**
- Create 3 controller + 8 DTO record
- Test: IT 합 ~19 case

- [ ] **B11.1 — DispatchBoardAdminController (GET 페이지네이션)**

```java
@RestController
@RequestMapping("/admin/dispatch-board")
@RequiredArgsConstructor
@PreAuthorize("hasAnyAuthority('ROLE_MANAGER','ROLE_MASTER')")
public class DispatchBoardAdminController {
    private final DispatchTaskBoardQueryService queryService;

    @GetMapping("/undispatched-slips")
    public Page<SlipBoardResponse> listUnDispatchedSlips(
        @RequestParam(required = false) LocalDate from,
        @RequestParam(required = false) LocalDate to,
        @RequestParam(required = false, defaultValue = "UNDISPATCHED") Set<SlipDispatchStatus> statuses,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "50") int size
    ) {
        LocalDate seoulToday = LocalDate.now(ZoneId.of("Asia/Seoul"));
        LocalDate effectiveFrom = from != null ? from : seoulToday.minusDays(1);
        LocalDate effectiveTo = to != null ? to : seoulToday.plusDays(1);
        return queryService.findUnDispatchedSlips(effectiveFrom, effectiveTo, statuses, page, size)
            .map(SlipBoardResponse::from);
    }
}
```

- [ ] **B11.2 — DispatchTaskAdminController (DispatchTask CRUD + dispatch trigger)**

```java
@RestController
@RequestMapping("/admin/dispatch-tasks")
@RequiredArgsConstructor
@PreAuthorize("hasAnyAuthority('ROLE_MANAGER','ROLE_MASTER')")
public class DispatchTaskAdminController {
    private final DispatchTaskService taskService;
    private final DispatchTaskCompletionService completionService;

    @PostMapping
    public DispatchTaskResponse create(@RequestBody @Valid CreateDispatchTaskRequest req,
                                        @RequestHeader("X-User-Id") String actor) { /* ... */ }

    @PostMapping("/{taskId}/vehicle-groups")
    public DispatchVehicleGroupResponse addGroup(@PathVariable UUID taskId,
                                                  @RequestBody @Valid AddVehicleGroupRequest req,
                                                  @RequestHeader("X-User-Id") String actor) { /* ... */ }

    @DeleteMapping("/{taskId}/vehicle-groups/{groupId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeGroup(@PathVariable UUID taskId, @PathVariable UUID groupId,
                             @RequestHeader("X-User-Id") String actor) { /* ... */ }

    @PostMapping("/{taskId}/vehicle-groups/{groupId}/slips")
    public DispatchVehicleGroupSlipResponse assignSlip(@PathVariable UUID taskId,
                                                        @PathVariable UUID groupId,
                                                        @RequestBody @Valid AssignSlipToGroupRequest req,
                                                        @RequestHeader("X-User-Id") String actor) { /* ... */ }

    @PutMapping("/{taskId}/vehicle-groups/{groupId}/slips/order")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void reorderSlips(@PathVariable UUID taskId, @PathVariable UUID groupId,
                              @RequestBody @Valid ReorderSlipsRequest req,
                              @RequestHeader("X-User-Id") String actor) { /* ... */ }

    @DeleteMapping("/{taskId}/vehicle-groups/{groupId}/slips/{slipId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeSlip(@PathVariable UUID taskId, @PathVariable UUID groupId, @PathVariable UUID slipId,
                            @RequestHeader("X-User-Id") String actor) { /* ... */ }

    @PostMapping("/{taskId}/dispatch")
    public DispatchTaskResponse dispatch(@PathVariable UUID taskId,
                                          @RequestHeader("X-User-Id") String actor) {
        return DispatchTaskResponse.from(completionService.dispatch(taskId, actor));
    }
}
```

- [ ] **B11.3 — DispatchTaskInternalController (arologis 회신 receive)**

```java
@RestController
@RequestMapping("/internal/slip/dispatch-tasks")
@RequiredArgsConstructor
@PreAuthorize("hasAuthority('ROLE_MASTER')")  // X-Internal-Token + InternalTokenFilter
public class DispatchTaskInternalController {
    private final DispatchTaskConfirmService confirmService;
    private final DispatchTaskUnavailableService unavailableService;

    @PostMapping("/{taskId}/confirm")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void confirm(@PathVariable UUID taskId,
                         @RequestBody @Valid DispatchTaskConfirmRequest req) {
        confirmService.confirm(taskId, req, "arologis-service");
    }

    @PostMapping("/{taskId}/unavailable")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unavailable(@PathVariable UUID taskId,
                             @RequestBody @Valid DispatchTaskUnavailableRequest req) {
        unavailableService.unavailable(taskId, req, "arologis-service");
    }
}
```

- [ ] **B11.4 — IT (DispatchBoardAdminControllerIT + DispatchTaskAdminControllerIT + DispatchTaskInternalControllerIT, ~19 case)**

- [ ] **B11.5 — commit**

```bash
git commit -m "feat(samhan-dispatch-board): 3 Controller (BoardAdmin + TaskAdmin + Internal) + DTO + IT 19"
```

---

## BE Task B12: arologis VehicleTonnage 확장 + Flyway V10

**Files:**
- Modify: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/domain/VehicleTonnage.java`
- Create: `services/arologis-service/src/main/resources/db/migration/V10__expand_vehicle_tonnage.sql`

- [ ] **B12.1 — V10 작성**

```sql
ALTER TABLE vehicle DROP CONSTRAINT IF EXISTS vehicle_tonnage_check;
ALTER TABLE vehicle ADD CONSTRAINT vehicle_tonnage_check
  CHECK (tonnage IN ('MOTORCYCLE','DAMAS','TONNAGE_1','TONNAGE_1_4','TONNAGE_1_5','TONNAGE_2_5','TONNAGE_3','TONNAGE_5','TONNAGE_10','TONNAGE_20','TONNAGE_BIG'));
```

- [ ] **B12.2 — VehicleTonnage enum 확장** (spec § 4.3 그대로)

- [ ] **B12.3 — KakaoDispatchParser 회귀 test PASS 확인** (legacy 2 값 호환)

- [ ] **B12.4 — commit**

```bash
git commit -m "feat(samhan-dispatch-board): arologis VehicleTonnage 11 값 확장 + V10 + legacy 2 deprecated"
```

---

## BE Task B13: arologis DispatchReceiveService + ArologisInternalController 확장 + SlipDispatchTaskClient

**Files:**
- Create: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/DispatchReceiveService.java`
- Modify: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisInternalController.java`
- Create: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/client/SlipDispatchTaskClient.java`
- Create: 5 DTO record (mirror slip-service)
- Test: ~8 case

- [ ] **B13.1 — DispatchReceiveService 구현**

```java
@Service @RequiredArgsConstructor @Transactional
public class DispatchReceiveService {
    private final DispatchRepository dispatchRepo;
    private final VehicleRepository vehicleRepo;
    private final VehicleStopRepository stopRepo;
    private final DriverMatcher driverMatcher;
    private final SlipDispatchTaskClient slipClient;

    public ArologisDispatchResponse receive(ArologisDispatchRequest req) {
        Dispatch d = Dispatch.create(req.dispatchDate(), DispatchType.DAY, "");
        d = dispatchRepo.save(d);

        for (var vp : req.vehicles()) {
            Vehicle v = Vehicle.create(d.getId(), vp.sequence(), VehicleTonnage.valueOf(vp.vehicleType()));
            vehicleRepo.save(v);
            for (var sp : vp.slips()) {
                VehicleStop stop = VehicleStop.create(v.getId(), sp.sequence(), sp.partnerCode(),
                    sp.partnerName(), sp.address(), sp.notes());
                stopRepo.save(stop);
            }
        }

        // async 매칭
        CompletableFuture.runAsync(() -> matchAndNotify(d.getId(), req.samhanDispatchTaskId()));

        return new ArologisDispatchResponse(d.getId(), req.samhanDispatchTaskId(), Instant.now(), Instant.now());
    }

    private void matchAndNotify(UUID dispatchId, UUID samhanTaskId) {
        // ... Mock matcher 결과 → SlipDispatchTaskClient.confirm 또는 .unavailable
    }
}
```

- [ ] **B13.2 — ArologisInternalController 에 endpoint 추가**

```java
@PostMapping("/dispatches")
public ArologisDispatchResponse receiveDispatch(@RequestBody @Valid ArologisDispatchRequest req) {
    return dispatchReceiveService.receive(req);
}
```

- [ ] **B13.3 — SlipDispatchTaskClient 구현** (mirror of ArologisDispatchClient, retry 3x backoff 1/2/4s)

- [ ] **B13.4 — IT (ArologisDispatchReceiveIT, ~5 case)**

- [ ] **B13.5 — commit**

```bash
git commit -m "feat(samhan-dispatch-board): arologis DispatchReceiveService + Internal endpoint 확장 + SlipDispatchTaskClient"
```

---

## BE Task B14: DispatchEndToEndIT (Mock 매칭 e2e)

**Files:**
- Create: `services/slip-service/src/test/java/com/samhanair/logis/slip/it/dispatch/DispatchEndToEndIT.java`

- [ ] **B14.1 — e2e 시나리오 IT 3 case** (SUCCESS / FAILURE / 멱등성)

```java
@SpringBootTest
class DispatchEndToEndIT extends AbstractPostgresIT {
    @MockBean ArologisDispatchClient arologisClient;
    @Autowired DispatchTaskCompletionService completionSvc;
    @Autowired DispatchTaskConfirmService confirmSvc;
    @Autowired SlipRepository slipRepo;

    @Test void full_flow_dispatch_then_confirm_marks_slip_DISPATCHED() { /* ... */ }
    @Test void full_flow_dispatch_then_unavailable_returns_slip_UNDISPATCHED() { /* ... */ }
    @Test void duplicate_dispatch_throws() { /* ... */ }
}
```

- [ ] **B14.2 — commit**

```bash
git commit -m "test(samhan-dispatch-board): DispatchEndToEndIT — Mock e2e 3 시나리오"
```

---

# Team 2: FE

## 파일 구조

```
clients/desktop/src/renderer/
├── routes/
│   └── dispatch-board/
│       ├── DispatchBoardPage.tsx                (NEW — 메인 페이지)
│       ├── components/
│       │   ├── UnDispatchedSlipList.tsx         (NEW — 좌측 50개 페이지네이션 + drag source)
│       │   ├── VehicleGroupColumn.tsx           (NEW — 우측 그룹 영역 + drop target)
│       │   ├── VehicleGroupCard.tsx             (NEW — 단일 그룹)
│       │   ├── AddVehicleModal.tsx              (NEW — 9 종류 carousel)
│       │   ├── SlipDetailModal.tsx              (NEW — 출고전표 상세)
│       │   └── DispatchCompleteDialog.tsx       (NEW — 확인 dialog)
│       └── hooks/
│           ├── useDispatchBoard.ts              (NEW — state 관리 hook)
│           ├── useDragSensors.ts                (NEW — Pointer + Touch)
│           └── useUnDispatchedSlipsQuery.ts     (NEW — react-query, 50/회)
├── api/
│   ├── dispatchBoard.ts                         (NEW — GET /admin/dispatch-board/...)
│   └── dispatchTask.ts                          (NEW — POST/PUT/DELETE /admin/dispatch-tasks/...)
└── components/AppLayout.tsx                     (수정 — 사이드바 "배차 메뉴" 추가)

clients/mobile-staff/src/screens/
├── dispatch-board/
│   ├── DispatchBoardScreen.tsx                  (NEW — 메인 + tab 전환)
│   ├── UnDispatchedSlipTab.tsx                  (NEW — 미배차 list)
│   ├── VehicleGroupTab.tsx                      (NEW — 차량 그룹)
│   ├── AddVehicleSheet.tsx                      (NEW — 9 종류 bottom sheet)
│   ├── SlipDetailSheet.tsx                      (NEW)
│   └── DispatchCompleteSheet.tsx                (NEW)
└── api/dispatchBoard.ts                         (NEW)
```

---

## FE Task F1: desktop dispatch-board skeleton + 사이드바

**Files:**
- Create: `clients/desktop/src/renderer/routes/dispatch-board/DispatchBoardPage.tsx`
- Modify: `clients/desktop/src/renderer/components/AppLayout.tsx`

- [ ] **F1.1 — DispatchBoardPage skeleton (split left/right layout, placeholder)**

```tsx
export default function DispatchBoardPage() {
  return (
    <div className="grid grid-cols-2 gap-4 h-full p-4">
      <UnDispatchedSlipList />
      <VehicleGroupColumn />
    </div>
  );
}
```

- [ ] **F1.2 — AppLayout 사이드바에 "배차 메뉴" 추가**

```tsx
{ path: '/dispatch-board', label: '배차 메뉴', icon: <TruckIcon /> }
```

- [ ] **F1.3 — vite build 통과 + commit**

```bash
git commit -m "feat(samhan-dispatch-board): desktop dispatch-board skeleton + 사이드바 추가"
```

---

## FE Task F2: react-query + dispatch API

**Files:**
- Create: `clients/desktop/src/renderer/api/dispatchBoard.ts`
- Create: `clients/desktop/src/renderer/api/dispatchTask.ts`
- Create: `clients/desktop/src/renderer/routes/dispatch-board/hooks/useUnDispatchedSlipsQuery.ts`

- [ ] **F2.1 — API 함수 작성**

```ts
// dispatchBoard.ts
export interface SlipBoardResponse {
  id: string;
  slipNumber: string;
  partnerCode: string;
  partnerName: string;
  address: string;
  recipientPhoneNumber: string;
  notes: string;
  createdAt: string;
}

export async function listUnDispatchedSlips(params: {
  from?: string; to?: string; statuses?: string[]; page?: number; size?: number;
}): Promise<Page<SlipBoardResponse>> {
  return apiClient.get('/admin/dispatch-board/undispatched-slips', { params }).then(r => r.data);
}
```

- [ ] **F2.2 — react-query hook**

```ts
export function useUnDispatchedSlipsQuery(params) {
  return useQuery({
    queryKey: ['dispatchBoard', 'undispatchedSlips', params],
    queryFn: () => listUnDispatchedSlips(params),
    placeholderData: keepPreviousData,
  });
}
```

- [ ] **F2.3 — commit**

```bash
git commit -m "feat(samhan-dispatch-board): dispatch board API + react-query hook"
```

---

## FE Task F3: UnDispatchedSlipList (좌측 + drag source)

**Files:**
- Create: `clients/desktop/src/renderer/routes/dispatch-board/components/UnDispatchedSlipList.tsx`

- [ ] **F3.1 — 컴포넌트 구현** (날짜 picker + 상태 select + 페이지네이션 + `useDraggable`)

```tsx
import { useDraggable } from '@dnd-kit/core';

function DraggableSlipRow({ slip }: { slip: SlipBoardResponse }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: slip.id });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} style={style} className="...">
      ☰ {slip.slipNumber} {slip.partnerName}
    </div>
  );
}
```

- [ ] **F3.2 — 페이지네이션 + 필터 form**

- [ ] **F3.3 — commit**

```bash
git commit -m "feat(samhan-dispatch-board): UnDispatchedSlipList — 50/회 + filter + drag source"
```

---

## FE Task F4: VehicleGroupColumn + VehicleGroupCard (우측 + drop target)

**Files:**
- Create: `clients/desktop/src/renderer/routes/dispatch-board/components/VehicleGroupColumn.tsx`
- Create: `clients/desktop/src/renderer/routes/dispatch-board/components/VehicleGroupCard.tsx`

- [ ] **F4.1 — VehicleGroupColumn (그룹 list + [+ 차량 추가] 버튼 + [배차 완료] 버튼)**

```tsx
import { DndContext, useSensors, useSensor, PointerSensor, TouchSensor } from '@dnd-kit/core';

export function VehicleGroupColumn() {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );
  const handleDragEnd = (event) => {
    // assignSlip API 호출
  };
  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <button onClick={openAddVehicle}>+ 차량 추가</button>
      {groups.map(g => <VehicleGroupCard key={g.id} group={g} />)}
      <button onClick={openCompleteDialog}>✓ 배차 완료</button>
    </DndContext>
  );
}
```

- [ ] **F4.2 — VehicleGroupCard (drop target + slip row sortable + [×] 제거)**

```tsx
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable } from '@dnd-kit/sortable';

function VehicleGroupCard({ group }) {
  const { setNodeRef, isOver } = useDroppable({ id: group.id });
  return (
    <div ref={setNodeRef} className={isOver ? 'ring-2 ring-teal' : ''}>
      <header>{vehicleTypeDisplayName(group.vehicleType)} #{group.sequence} ({group.slips.length}건)</header>
      <SortableContext items={group.slips.map(s => s.id)}>
        {group.slips.map(s => <SortableSlipRow key={s.id} slip={s} groupId={group.id} />)}
      </SortableContext>
    </div>
  );
}
```

- [ ] **F4.3 — commit**

```bash
git commit -m "feat(samhan-dispatch-board): VehicleGroupColumn + Card — DnD drop target + sortable"
```

---

## FE Task F5: AddVehicleModal + SlipDetailModal + DispatchCompleteDialog

**Files:**
- Create: `clients/desktop/src/renderer/routes/dispatch-board/components/AddVehicleModal.tsx`
- Create: `clients/desktop/src/renderer/routes/dispatch-board/components/SlipDetailModal.tsx`
- Create: `clients/desktop/src/renderer/routes/dispatch-board/components/DispatchCompleteDialog.tsx`

- [ ] **F5.1 — AddVehicleModal (9 종류 carousel + 추가 버튼)**

```tsx
const TYPES = [
  { value: 'MOTORCYCLE', label: '오토바이' },
  { value: 'DAMAS', label: '다마스' },
  { value: 'TONNAGE_1', label: '1톤' },
  { value: 'TONNAGE_1_5', label: '1.5톤' },
  { value: 'TONNAGE_2_5', label: '2.5톤' },
  { value: 'TONNAGE_3', label: '3톤' },
  { value: 'TONNAGE_5', label: '5톤' },
  { value: 'TONNAGE_10', label: '10톤' },
  { value: 'TONNAGE_20', label: '20톤' },
];

function AddVehicleModal({ onClose, onAdd }) {
  const [selected, setSelected] = useState(null);
  return (
    <Modal>
      <h2>차량 추가</h2>
      <div className="grid grid-cols-3 gap-2">
        {TYPES.map(t => (
          <button key={t.value} onClick={() => setSelected(t.value)}
                  className={selected === t.value ? 'border-teal' : ''}>
            {t.label}
          </button>
        ))}
      </div>
      <button onClick={() => onAdd(selected)} disabled={!selected}>추가</button>
    </Modal>
  );
}
```

- [ ] **F5.2 — SlipDetailModal (slip-service GET /admin/slips/{id} 호출)**

- [ ] **F5.3 — DispatchCompleteDialog (확인 + POST + spinner)**

- [ ] **F5.4 — commit**

```bash
git commit -m "feat(samhan-dispatch-board): AddVehicle + SlipDetail + DispatchComplete modal/dialog"
```

---

## FE Task F6: mobile-staff DispatchBoardScreen (tab + TouchSensor)

**Files:**
- Create: `clients/mobile-staff/src/screens/dispatch-board/DispatchBoardScreen.tsx`
- Create: 4 sub-component (UnDispatchedSlipTab / VehicleGroupTab / AddVehicleSheet / SlipDetailSheet)
- Modify: mobile-staff routing 에 `/dispatch-board` 추가

- [ ] **F6.1 — DispatchBoardScreen (tab + TouchSensor)** (~3 commit)

- [ ] **F6.2 — commit**

```bash
git commit -m "feat(samhan-dispatch-board): mobile-staff DispatchBoardScreen — tab 전환 + TouchSensor long-press"
```

---

# Team 3: Designer

## Designer Task D1~D5

**Files (5 NEW):**
- `docs/uiux/samhan-dispatch-board/01-desktop-board.md`
- `docs/uiux/samhan-dispatch-board/02-mobile-board-tab.md`
- `docs/uiux/samhan-dispatch-board/03-add-vehicle-modal.md`
- `docs/uiux/samhan-dispatch-board/04-slip-detail-modal.md`
- `docs/uiux/samhan-dispatch-board/05-state-badges.md`

각 task = 1 mock md + ASCII layout + Tailwind/RN StyleSheet 토큰 + spacing + 색상 (Samhan Public design system 활용) + data-testid + 접근성.

- [ ] **D1~D5 각 task 1 commit (총 5 commit)**

```bash
git commit -m "docs(samhan-dispatch-board): Designer D1~D5 — 5 화면 mock"
```

---

# Team 4: QA

## QA Task Q1: 6 시나리오 + 검증 SQL

**Files:**
- Create: `docs/qa/samhan-dispatch-board/scenarios.md` (spec § 7.4 그대로 + 각 시나리오 step-by-step + 검증 SQL)

- [ ] **Q1.1 — 시나리오 작성**

```sql
-- 시나리오 5: 배차 완료 후 DispatchTask 상태 검증
SELECT task_code, status, arologis_dispatch_id
FROM dispatch_task
WHERE task_code = 'DT-20260514-001' AND is_deleted = FALSE;
-- Expected: status = DISPATCHED, arologis_dispatch_id NOT NULL
```

- [ ] **Q1.2 — commit**

---

## QA Task Q2: 회귀 + 롤백 runbook + Mock 캡처 PNG

**Files:**
- Create: `docs/qa/samhan-dispatch-board/regression.md`
- Create: `docs/qa/samhan-dispatch-board/rollback-dry-run.md`
- Create: `scripts/generate-samhan-dispatch-board-screenshots.ps1`
- Create: `docs/qa/samhan-dispatch-board/screenshots/01~06.png` (6장 mock)

- [ ] **Q2.1 — Mock PNG script (PowerShell System.Drawing + UTF-8 BOM, PR #185 패턴 일관)**

- [ ] **Q2.2 — 6 PNG 생성 (배차 메뉴 desktop / mobile / 차량 추가 / 상세 / 배차 완료 dialog / 결과 배지)**

- [ ] **Q2.3 — commit**

```bash
git commit -m "docs(samhan-dispatch-board): QA 6 시나리오 + 회귀/롤백 runbook + Mock PNG 6장"
```

---

# Team 5: DevOps

## DevOps Task DO1: 환경변수 + docker-compose

**Files:**
- Modify: `.env.example`
- Modify: `infrastructure/docker/docker-compose.yml`
- Create: `docs/migration/samhan-dispatch-board/01-deployment.md`

- [ ] **DO1.1 — 환경변수 추가**

```bash
# Samhan Public 측
SAMHAN_AROLOGIS_DISPATCH_URL=http://arologis-service:8097

# arologis 측
SAMHAN_SLIP_DISPATCH_TASK_URL=http://slip-service:8084
```

- [ ] **DO1.2 — docker-compose.yml 의 slip-service + arologis-service service block 에 환경변수 추가**

- [ ] **DO1.3 — commit**

```bash
git commit -m "ci(samhan-dispatch-board): 환경변수 + docker-compose + 배포 가이드"
```

---

# Team 6: TM (Integration)

## TM Task T1~T5

- [ ] **T1: BE + FE 컴파일 가드** (`gradlew :services:slip-service:assemble :services:arologis-service:assemble` + `npm run build` 양 client)
- [ ] **T2: 회귀 가드 (기존 IT/단위)**
- [ ] **T3: 문서 동기화** (README / ROADMAP / DECISIONS D-DB-00 entry / service README / CLAUDE.md / 메모리)
- [ ] **T4: 메모리 sync** (`.claude/memory/project_samhan_dispatch_board.md` 신규 + MEMORY.md index)
- [ ] **T5: 통합 PR 발행 (한국어 본문 + QA 6 스크린샷 인라인 의무)**

---

# Team 7: PM

- [ ] **P1: `gh pr checks --watch`** 자동 ([[feedback_pr_ci_monitoring]] + [[feedback_monitor_no_permission]])
- [ ] **P2: green + 0결함 → 개발책임자 머지 요청** (자율 권한 위임 예외 — 머지만 사용자 인터럽트)

---

# 실행 순서

```
[병렬 디스패치 — 5 worktree]
  ├── BE Team:        B1 → B14   (14 task, ~36 unit + ~31 IT)
  ├── FE Team:        F1 → F6    (6 task, ~24 컴포넌트 test)
  ├── Designer Team:  D1 → D5    (5 task, 5 mock)
  ├── QA Team:        Q1 → Q2    (2 task, 6 시나리오 + 6 PNG)
  └── DevOps Team:    DO1        (1 task)

[병렬 완료 후 sequential]
  └── TM:             T1 → T5
      └── PM:         P1 → P2
          └── 개발책임자 머지
```

---

# Self-review 결과

- [x] **Spec coverage**: spec § 4 (entity) = B1~B5 / § 5 (UI) = F1~F6 / § 6 (통신) = B8~B13 / § 7 (테스트) = B11~B14 + Q1~Q2 / § 8 (5-team) = 본 plan 전체
- [x] **Placeholder scan**: D1~D5 / F6 / Q1~Q2 / DO1 가 압축 명시이나 spec/scope 명확하므로 OK
- [x] **Type consistency**: `DispatchTask`/`DispatchVehicleGroup`/`DispatchVehicleGroupSlip`/`MatchedDriver` 일관, `DispatchTaskStatus` 4값 / `SlipDispatchStatus` 3값 / `DispatchVehicleType` 9값 = spec § 4 일관
