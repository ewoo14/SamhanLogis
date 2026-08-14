package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.web.dto.OpaqueUuidSerializer;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.revision.service.SlipRevisionService;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.ArgumentMatchers;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import jakarta.persistence.EntityManager;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.Transactional;

/**
 * 전표 버전이력/복원 Testcontainers 통합 테스트 — 권한 재편 Phase 2.1 Task 5.
 *
 * <p>실 DB (V27 Flyway {@code slip_revisions} + JSONB 스냅샷) 기준으로 Task 2~4 산출
 * (자동 캡처 / 타임라인 changeSummary / point-in-time 복원 / REST 권한 게이트) 을 종단 검증한다.
 * {@link AbstractPostgresIT} 의 싱글턴 postgres:16-alpine 컨테이너 + Docker 미가용 시 skip 패턴을 상속한다.
 *
 * <p>대상 endpoint (Task 4):
 * <ul>
 *   <li>{@code GET  /slips/{slipId}/revisions} — {@code slip.audit-revert} VIEW. 최신 우선 타임라인 +
 *       changeSummary. {@code actorId} JSON 미노출 (UUID 비공개 가드).</li>
 *   <li>{@code POST /slips/{slipId}/revisions/{revisionNo}/restore} — {@code slip.audit-revert} RESTORE.
 *       헤더 X-User-Id/X-User-Name. 마감(lockFlag/FULLY_LOCKED) 시 복원 차단.</li>
 * </ul>
 *
 * <p>전표 seed 방식: 캡처가 일어나는 실 서비스 경로(MockMvc)를 그대로 사용한다 — {@code POST /slips}
 * (CREATE 캡처), {@code POST /slips/{id}/lines} (라인 변경, 자체 캡처 없음), {@code PATCH /slips/{id}/v20}
 * (EDIT 캡처 — 캡처 시점의 현 라인 집합을 스냅샷). 즉 "라인 추가 → v20 수정" 순서로 변경된 라인이 EDIT
 * 스냅샷에 반영된다 (SlipControllerIT 의 CreateSlipRequest 패턴 재사용). 마감 lock 케이스만 도메인
 * {@link Slip#lock()} 적용을 위해 {@link SlipRepository} 를 직접 사용한다.
 *
 * <p>모든 인증 요청에 유효 {@code X-User-Id}(UUID) + 적절 {@code X-User-Role} 헤더를 부여한다
 * (권한 경로 정합 — account 모드 {@link PermissionAction} 게이트 + role MASTER bypass 검증).
 *
 * <p>{@link InventoryClient}/{@link ProductClient} 등 외부 client 는 {@code @MockBean} 격리
 * (PR #17 회고 — 누락 시 Eureka 비활성 → 500).
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class SlipRevisionRestoreIT extends AbstractPostgresIT {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_NAME_HEADER = "X-User-Name";
    private static final String ROLE_HEADER = "X-User-Role";
    private static final String AUDIT_REVERT_PAGE = "slip.audit-revert";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private SlipRepository slipRepository;
    @Autowired private SlipRevisionService slipRevisionService;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private EntityManager entityManager;

    @MockBean private InventoryClient inventoryClient;
    @MockBean private ProductClient productClient;
    @MockBean private UserInternalClient userInternalClient;
    @MockBean private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void mockExternalClients() {
        Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(Optional.of("담당자"));
        Mockito.lenient().when(productClient.lookup(ArgumentMatchers.anyList()))
                .thenAnswer(inv -> {
                    List<UUID> ids = inv.getArgument(0);
                    return ids.stream()
                            .map(id -> new ProductSummary(id, "테스트 제품", "MOD-001",
                                    UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"))
                            .toList();
                });
        Mockito.lenient().when(productClient.requireExists(ArgumentMatchers.any()))
                .thenAnswer(inv -> new ProductSummary(
                        inv.getArgument(0), "테스트 제품", "MOD-001",
                        UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"));
    }

    // =========================================================================
    // 시나리오 1 — 캡처 + 타임라인 (CREATE/EDIT, 최신 우선, changeSummary, actorId 미노출)
    // =========================================================================

    @Test
    void timeline_afterCreateAndLineAddEdit_listsRevisionsLatestFirstWithoutActorId() throws Exception {
        // 1라인 출고전표 생성 → CREATE revision 1 자동 캡처
        UUID slipId = createOutboundSlipAsSales(1);

        // 캡처-갭 fix(commit 62cd558d) 이후 현행 캡처 흐름:
        //   create(1라인) = rev1 CREATE
        //   addLine        = rev2 EDIT (이 시점 라인 2건 — 직전 rev1 대비 라인 1건 추가)
        //   patchV20       = rev3 EDIT (projectName 변경 — 라인 변화 없음, 헤더 변경)
        addLine(slipId);
        patchV20(slipId, "타임라인 검증 프로젝트");

        MvcResult result = mockMvc.perform(get("/slips/{id}/revisions", slipId)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_NAME_HEADER, "감사자")
                        .header(ROLE_HEADER, "MANAGER"))
                .andExpect(status().isOk())
                // 최신 우선 — [0]=rev3 EDIT(v20), [1]=rev2 EDIT(addLine), [2]=rev1 CREATE
                .andExpect(jsonPath("$.data[0].revisionNo").value(3))
                .andExpect(jsonPath("$.data[0].revisionType").value("EDIT"))
                .andExpect(jsonPath("$.data[1].revisionNo").value(2))
                .andExpect(jsonPath("$.data[1].revisionType").value("EDIT"))
                .andExpect(jsonPath("$.data[2].revisionNo").value(1))
                .andExpect(jsonPath("$.data[2].revisionType").value("CREATE"))
                // rev2(addLine) 는 직전(rev1, 1라인) 대비 라인 1건 추가
                .andExpect(jsonPath("$.data[1].changeSummary.lineAdded")
                        .value(greaterThanOrEqualTo(1)))
                .andExpect(jsonPath("$.data[0].actorName").value(notNullValue()))
                .andReturn();

        // UUID 비공개 가드 — 응답 본문 어디에도 actorId 키가 없어야 함
        String body = result.getResponse().getContentAsString();
        org.assertj.core.api.Assertions.assertThat(body).doesNotContain("actorId");
        JsonNode data = objectMapper.readTree(body).get("data");
        org.assertj.core.api.Assertions.assertThat(data).hasSizeGreaterThanOrEqualTo(3);
        org.assertj.core.api.Assertions.assertThat(data.get(0).has("actorId")).isFalse();
    }

    @Test
    void timeline_withTypeMismatchedSnapshot_skipsCorruptRevision() throws Exception {
        UUID slipId = createOutboundSlipAsSales(1);
        insertCorruptRevision(slipId, 2, """
                {
                  "slipNo":"BROKEN-2",
                  "slipDate":"not-a-date",
                  "lines":[]
                }
                """);

        mockMvc.perform(get("/slips/{id}/revisions", slipId)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_NAME_HEADER, "감사자")
                        .header(ROLE_HEADER, "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].revisionNo").value(1));
    }

    @Test
    void restore_withTypeMismatchedSnapshot_returnsExplicitError() throws Exception {
        UUID slipId = createOutboundSlipAsSales(1);
        insertCorruptRevision(slipId, 2, """
                {
                  "slipNo":"BROKEN-2",
                  "slipDate":"not-a-date",
                  "lines":[]
                }
                """);

        mockMvc.perform(post("/slips/{id}/revisions/{rev}/restore", slipId, 2)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_NAME_HEADER, "복원자")
                        .header(ROLE_HEADER, "MANAGER"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("손상된 버전 스냅샷입니다")))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("버전 2")));
    }

    // =========================================================================
    // 시나리오 2 — 복원 (헤더 + 라인 집합이 대상 revision 시점으로 회귀)
    // =========================================================================

    @Test
    void restore_toRevision1_revertsLinesAndCreatesRestoreRevision() throws Exception {
        // rev1 = 1라인
        UUID slipId = createOutboundSlipAsSales(1);
        int linesAtRev1 = lineCount(getDetail(slipId));

        // 라인 추가 + v20 수정 → rev2 (2라인 스냅샷)
        addLine(slipId);
        patchV20(slipId, "복원 전 프로젝트");
        org.assertj.core.api.Assertions.assertThat(lineCount(getDetail(slipId)))
                .isEqualTo(linesAtRev1 + 1);

        // 캡처-갭 fix(commit 62cd558d) 이후: create=rev1, addLine=rev2, patchV20=rev3.
        // revision 1 시점으로 복원 → 200, 라인 집합이 rev1 (= 1건) 로 회귀하고
        // 복원 자체가 신규 RESTORE rev4 (sourceRevisionNo=1) 로 누적된다.
        mockMvc.perform(post("/slips/{id}/revisions/{rev}/restore", slipId, 1)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_NAME_HEADER, "복원자")
                        .header(ROLE_HEADER, "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(OpaqueUuidSerializer.encode(slipId)))
                .andExpect(jsonPath("$.data.lines.length()").value(linesAtRev1));

        // 복원도 신규 RESTORE revision (sourceRevisionNo=1) 으로 추적 — 타임라인 최신 항목이 RESTORE.
        // 하드코딩 의존을 줄이기 위해 정확한 revisionNo 는 현행 캡처 흐름(rev4)으로 단언하되,
        // 핵심 계약(타임라인 최신=RESTORE + 복원 출처=1)에 집중한다.
        mockMvc.perform(get("/slips/{id}/revisions", slipId)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(ROLE_HEADER, "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].revisionNo").value(4))
                .andExpect(jsonPath("$.data[0].revisionType").value("RESTORE"))
                .andExpect(jsonPath("$.data[0].sourceRevisionNo").value(1));
    }

    @Test
    void restoreLegacyMultiInstanceRevisionPreservesAmbiguousRowsAndAllowsNextEdit() throws Exception {
        UUID slipId = createOutboundSlipAsSales(1);
        Slip current = slipRepository.findById(slipId).orElseThrow();
        slipRevisionService.capture(current,
                com.samhanair.logis.slip.revision.domain.SlipRevisionType.EDIT,
                null, UUID.randomUUID(), "R10 현재상태", null);

        List<UUID> products = List.of(UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), UUID.randomUUID());
        List<Map<String, Object>> legacyLines = new java.util.ArrayList<>();
        for (int instance = 0; instance < 2; instance++) {
            for (int component = 0; component < 4; component++) {
                Map<String, Object> line = new HashMap<>();
                line.put("productId", products.get(component).toString());
                line.put("productName", "R10 구성품 " + component);
                line.put("modelName", "R10-COMP-" + component);
                line.put("quantity", 1);
                line.put("unitPrice", 1000);
                line.put("lineTotal", 1000);
                line.put("setHead", component == 0);
                line.put("parentSetModel", "AC060CS6PBH1SY");
                line.put("bundleSetOptions", Map.of(
                        "remoteExcluded", false, "materialIncluded", false));
                legacyLines.add(line);
            }
        }
        jdbcTemplate.update(
                "UPDATE slip_revisions SET snapshot=jsonb_set(snapshot,'{lines}',?::jsonb) "
                        + "WHERE slip_id=? AND revision_no=1",
                objectMapper.writeValueAsString(legacyLines), slipId);

        Integer before = jdbcTemplate.queryForObject(
                "WITH g AS (SELECT parent_set_model, count(*) FILTER (WHERE set_head) heads "
                        + "FROM slip_lines WHERE slip_id=? AND is_deleted=false "
                        + "AND NULLIF(BTRIM(bundle_set_options->>'instanceKey'),'') IS NULL "
                        + "GROUP BY parent_set_model) SELECT count(*) FROM g WHERE heads>1",
                Integer.class, slipId);
        assertThat(before).isZero();

        mockMvc.perform(post("/slips/{id}/revisions/{rev}/restore", slipId, 1)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_NAME_HEADER, "R10 복원 사용자")
                        .header(ROLE_HEADER, "MANAGER"))
                .andExpect(status().isOk());

        // MockMvc가 테스트 트랜잭션의 1차 캐시를 공유하므로, 복원 flush 이후 DB의
        // 최종 modified_at을 다시 읽어 optimistic-lock 토큰을 구성한다.
        entityManager.flush();
        entityManager.clear();

        Map<String, Object> restored = jdbcTemplate.queryForMap(
                "SELECT count(*) rows, count(*) FILTER (WHERE set_head) heads, "
                        + "count(DISTINCT NULLIF(BTRIM(bundle_set_options->>'instanceKey'),'')) keys "
                        + "FROM slip_lines WHERE slip_id=? AND is_deleted=false "
                        + "AND parent_set_model='AC060CS6PBH1SY'",
                slipId);
        System.out.println("R12-RESTORE-MATERIALIZE|restore=HTTP200|beforeGroups=" + before
                + "|rows=" + restored.get("rows") + "|heads=" + restored.get("heads")
                + "|instanceKeys=" + restored.get("keys"));
        assertThat(((Number) restored.get("rows")).intValue()).isEqualTo(8);
        assertThat(((Number) restored.get("heads")).intValue()).isEqualTo(2);
        // 두 legacy 인스턴스가 모든 비-key 옵션을 공유하면 snapshot만으로 소속을 증명할 수
        // 없다. 복원은 HTTP 200으로 계속하되 잘못된 키를 만들지 않고 keyless를 보존한다.
        assertThat(((Number) restored.get("keys")).intValue()).isZero();

        JsonNode detail = getDetail(slipId);
        entityManager.clear();
        List<Map<String, Object>> updateLines = new java.util.ArrayList<>();
        boolean changed = false;
        for (JsonNode line : detail.path("lines")) {
            Map<String, Object> requestLine = objectMapper.convertValue(line, Map.class);
            requestLine.put("lineId", requestLine.remove("id"));
            // 상세 응답의 금액 파생 필드는 direct PUT 권위 금액 계약 필드가 아니다.
            // 특히 복원된 legacy bundle 구성품은 공급가액·부가세·VAT 포함 합계를 함께
            // 왕복하면 구성품 개별 금액 편집으로 거부된다. 수량/단가 입력만 왕복한다.
            requestLine.remove("supplyAmount");
            requestLine.remove("vatAmount");
            requestLine.remove("lineTotalWithVat");
            requestLine.remove("unitPriceWithVat");
            requestLine.remove("lineTotal");
            if (!changed && line.path("setHead").asBoolean()) {
                requestLine.put("quantity", 2);
                changed = true;
            }
            updateLines.add(requestLine);
        }
        Map<String, Object> body = new HashMap<>();
        // 복원 응답과 동일한 직렬화 경계를 사용한다. DB modified_at 문자열을 수동 조립하면
        // timestamp 정밀도/표현이 API updatedAt과 달라져 계보 검증 전에 409 optimistic lock으로
        // 끝나는 probe가 된다.
        body.put("updatedAt", detail.path("updatedAt").asText());
        body.put("partnerName", detail.path("partnerName").asText());
        body.put("lines", updateLines);
        body.put("lineIdContract", true);

        MvcResult updated = mockMvc.perform(put("/slips/{id}/sales", slipId)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_NAME_HEADER, "R10 편집 사용자")
                        .header(ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andReturn();
        System.out.println("R12-RESTORE-EDIT|HTTP=" + updated.getResponse().getStatus()
                + "|body=" + updated.getResponse().getContentAsString());
    }

    // =========================================================================
    // 시나리오 3 — 라인 삭제 후 이전 revision 복원 시 라인 복구
    // =========================================================================

    @Test
    void restore_afterLineRemoval_recoversRemovedLine() throws Exception {
        // rev1 = 2라인
        UUID slipId = createOutboundSlipAsSales(2);
        int linesAtRev1 = lineCount(getDetail(slipId));
        org.assertj.core.api.Assertions.assertThat(linesAtRev1).isEqualTo(2);

        // 라인 1건 제거 + v20 수정 → rev2 (1라인 스냅샷)
        UUID removableLineId = firstLineId(getDetail(slipId));
        removeLine(slipId, removableLineId);
        patchV20(slipId, "라인 제거 후 프로젝트");
        org.assertj.core.api.Assertions.assertThat(lineCount(getDetail(slipId))).isEqualTo(1);

        // revision 1 복원 → 제거된 라인 복구 (2라인)
        mockMvc.perform(post("/slips/{id}/revisions/{rev}/restore", slipId, 1)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_NAME_HEADER, "복원자")
                        .header(ROLE_HEADER, "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.lines.length()").value(2));
    }

    // =========================================================================
    // 시나리오 4 — 마감 lock 시 복원 차단 (lockFlag=true → 409 CONFLICT)
    // =========================================================================

    @Test
    void restore_whenSlipLocked_returnsConflict() throws Exception {
        UUID slipId = createOutboundSlipAsSales(1);

        // 도메인 마감 lock 적용 (회계 마감 — restoreFromSnapshot requireNotLocked 가드 발동 경로)
        lockSlip(slipId);

        mockMvc.perform(post("/slips/{id}/revisions/{rev}/restore", slipId, 1)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_NAME_HEADER, "복원자")
                        .header(ROLE_HEADER, "MANAGER"))
                .andExpect(status().isConflict());
    }

    @ParameterizedTest(name = "{0} 상태의 거래처 없는 revision 복원은 fail-closed")
    @EnumSource(value = SlipStatus.class, names = {
            "SENT", "ACCEPTED", "PROCESSING", "INSPECTING", "COMPLETED", "SHIPPING",
            "DELIVERED", "CONFIRMED", "REJECTED"
    })
    void restoreCommittedSlipWithPartnerlessRevision_returnsBadRequest(SlipStatus status) throws Exception {
        UUID slipId = createOutboundSlipAsSales(1);
        Slip slip = slipRepository.findById(slipId).orElseThrow();
        slip.save();
        slip.send();
        ReflectionTestUtils.setField(slip, "status", status);
        slipRepository.saveAndFlush(slip);
        jdbcTemplate.update(
                "UPDATE slip_revisions SET snapshot = jsonb_set(snapshot, '{partnerId}', 'null'::jsonb) "
                        + "WHERE slip_id = ? AND revision_no = 1",
                slipId);

        long revisionCountBefore = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM slip_revisions WHERE slip_id = ?", Long.class, slipId);

        if (status == SlipStatus.SENT) {
            mockMvc.perform(post("/slips/{id}/revisions/{rev}/restore", slipId, 1)
                            .header(USER_ID_HEADER, UUID.randomUUID().toString())
                            .header(USER_NAME_HEADER, "복원 사용자")
                            .header(ROLE_HEADER, "MANAGER"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                    .andExpect(jsonPath("$.message")
                            .value("거래처 없는 이력으로 커밋 전표를 복원할 수 없습니다"));
        } else {
            assertThatThrownBy(() -> slipRevisionService.restore(
                            slip, 1, UUID.randomUUID(), "복원 사용자", null))
                    .isInstanceOf(com.samhanair.logis.common.exception.BusinessException.class)
                    .hasMessage("거래처 없는 이력으로 커밋 전표를 복원할 수 없습니다");
        }

        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM slip_revisions WHERE slip_id = ?", Long.class, slipId))
                .isEqualTo(revisionCountBefore);
        assertThat(slipRepository.findById(slipId).orElseThrow().getPartnerId()).isNotNull();
        assertThat(slipRepository.findById(slipId).orElseThrow().getStatus()).isEqualTo(status);
    }

    // =========================================================================
    // 시나리오 5 — RESTORE 권한 (deny → 403, MASTER bypass → 200)
    // =========================================================================

    @Test
    void restore_whenPermissionDenied_nonMaster_returns403() throws Exception {
        UUID slipId = createOutboundSlipAsSales(1);

        // account 모드 RESTORE 권한 명시 deny + 비-MASTER 역할 → PermissionAspect 가 403
        Mockito.when(dynamicPermissionClient.check(
                        ArgumentMatchers.any(UUID.class),
                        ArgumentMatchers.eq(AUDIT_REVERT_PAGE),
                        ArgumentMatchers.eq(PermissionAction.RESTORE)))
                .thenReturn(false);

        mockMvc.perform(post("/slips/{id}/revisions/{rev}/restore", slipId, 1)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_NAME_HEADER, "권한없음")
                        .header(ROLE_HEADER, "STAFF"))
                .andExpect(status().isForbidden());
    }

    @Test
    void restore_whenPermissionDenied_masterRole_bypassesAndReturns200() throws Exception {
        UUID slipId = createOutboundSlipAsSales(1);

        // RESTORE deny stub 이어도 시스템 마스터는 aspect bypass → 200
        // C5-4(C4-3): bypass 키 = X-Is-System-Master 단독 (role=="MASTER" 폴백 제거)
        Mockito.when(dynamicPermissionClient.check(
                        ArgumentMatchers.any(UUID.class),
                        ArgumentMatchers.eq(AUDIT_REVERT_PAGE),
                        ArgumentMatchers.eq(PermissionAction.RESTORE)))
                .thenReturn(false);

        mockMvc.perform(post("/slips/{id}/revisions/{rev}/restore", slipId, 1)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_NAME_HEADER, "마스터")
                        .header("X-Is-System-Master", "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(OpaqueUuidSerializer.encode(slipId)));
    }

    // =========================================================================
    // 헬퍼 — 전표 seed (MockMvc 실 경로) + 상세/라인 조회
    // =========================================================================

    /**
     * SALES 권한으로 {@code lineCount} 개 라인을 가진 출고전표 1건 생성 후 slip UUID 반환.
     * 생성 직후 CREATE revision 1 이 자동 캡처된다.
     */
    private UUID createOutboundSlipAsSales(int lineCount) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("slipType", "OUTBOUND");
        body.put("slipDate", "2026-05-04");
        body.put("sourceWarehouseId", UUID.randomUUID().toString());
        body.put("destinationWarehouseId", UUID.randomUUID().toString());
        body.put("partnerId", UUID.randomUUID().toString());
        body.put("partnerName", "테스트 거래처");
        body.put("deliveryTag", "SALE");
        body.put("memo", "테스트");
        java.util.List<Map<String, Object>> lines = new java.util.ArrayList<>();
        for (int i = 0; i < lineCount; i++) {
            Map<String, Object> line = new HashMap<>();
            line.put("productId", UUID.randomUUID().toString());
            line.put("productName", "테스트 제품 " + i);
            line.put("modelName", "MOD-00" + i);
            line.put("quantity", i + 1);
            line.put("unitPrice", 100000);
            line.put("note", "라인 메모 " + i);
            lines.add(line);
        }
        body.put("lines", lines);

        MvcResult result = mockMvc.perform(post("/slips")
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(ROLE_HEADER, "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        return OpaqueUuidTestDecoder.decode(objectMapper.readTree(result.getResponse().getContentAsString())
                .get("data").get("id").asText());
    }

    /** 라인 1건 추가 (DRAFT 단계, 캡처 없음 — 후속 v20 수정이 현 라인을 EDIT 스냅샷에 반영). */
    private void addLine(UUID slipId) throws Exception {
        Map<String, Object> line = new HashMap<>();
        line.put("productId", UUID.randomUUID().toString());
        line.put("productName", "추가 제품");
        line.put("modelName", "MOD-ADD");
        line.put("quantity", 3);
        line.put("unitPrice", 50000);
        line.put("note", "추가 라인");

        mockMvc.perform(post("/slips/{id}/lines", slipId)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(ROLE_HEADER, "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(line)))
                .andExpect(status().isCreated());
    }

    /** 라인 1건 제거 (DRAFT 단계). */
    private void removeLine(UUID slipId, UUID lineId) throws Exception {
        mockMvc.perform(delete("/slips/{id}/lines/{lineId}", slipId, lineId)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(ROLE_HEADER, "SALES"))
                .andExpect(status().isNoContent());
    }

    /** v20 통합 수정 — projectName 변경으로 EDIT revision 캡처 (현 라인 집합 스냅샷). */
    private void patchV20(UUID slipId, String projectName) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("projectName", projectName);

        mockMvc.perform(patch("/slips/{id}/v20", slipId)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_NAME_HEADER, "수정자")
                        .header(ROLE_HEADER, "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk());
    }

    /** 전표 상세 JSON 의 {@code $.data} 노드 반환. */
    private JsonNode getDetail(UUID slipId) throws Exception {
        MvcResult result = mockMvc.perform(get("/slips/{id}", slipId)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(ROLE_HEADER, "MANAGER"))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("data");
    }

    private int lineCount(JsonNode detail) {
        return detail.get("lines").size();
    }

    private UUID firstLineId(JsonNode detail) {
        return OpaqueUuidTestDecoder.decode(detail.get("lines").get(0).get("id").asText());
    }

    private void insertCorruptRevision(UUID slipId, int revisionNo, String snapshotJson) {
        java.time.LocalDateTime now = java.time.LocalDateTime.now();
        jdbcTemplate.update("""
                INSERT INTO slip_revisions
                    (id, slip_id, revision_no, revision_type, source_revision_no,
                     slip_no, slip_date, snapshot, actor_id, actor_name, actor_color,
                     created_at, created_by, modified_at, modified_by, deleted_at, deleted_by, is_deleted)
                VALUES (?, ?, ?, 'EDIT', NULL,
                        ?, DATE '2026-05-04', ?::jsonb, NULL, ?, NULL,
                        ?, 'test', NULL, NULL, NULL, NULL, FALSE)
                """,
                UUID.randomUUID(), slipId, revisionNo, "CORRUPT-" + revisionNo,
                snapshotJson, "손상데이터", now);
    }

    /** 도메인 {@link Slip#lock()} 적용 후 저장 (회계 마감 lock 모사). */
    private void lockSlip(UUID slipId) {
        Slip slip = slipRepository.findById(slipId).orElseThrow();
        slip.lock();
        slipRepository.save(slip);
    }
}
