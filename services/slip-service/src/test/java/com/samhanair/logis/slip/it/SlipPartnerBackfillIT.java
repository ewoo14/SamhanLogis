package com.samhanair.logis.slip.it;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.hamcrest.Matchers.hasItem;

import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.repository.SlipPartnerQuarantineRepository;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 커밋 전표 거래처 동적 보정 endpoint 의 실제 DB/HTTP 경계 검증.
 *
 * <p>실운영 partner-service 는 {@link PartnerInternalClient} 경계를 통해 호출되며, IT 에서는
 * 그 cross-service client 만 대체해 FOUND/미해소 응답과 멱등·dry-run 계약을 검증한다.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
class SlipPartnerBackfillIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private SlipRepository slipRepository;

    @Autowired
    private SlipPartnerQuarantineRepository quarantineRepository;

    @MockBean
    private PartnerInternalClient partnerInternalClient;

    @MockBean
    private UserInternalClient userInternalClient;

    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void isolateLegacyCandidates() {
        var legacyCandidates = slipRepository.findAll().stream()
                .filter(slip -> Slip.requiredPartnerStatuses().contains(slip.getStatus()))
                .filter(slip -> slip.getPartnerId() == null)
                .toList();
        legacyCandidates.forEach(slip -> slip.markDeleted("backfill-it-cleanup"));
        if (!legacyCandidates.isEmpty()) {
            slipRepository.saveAllAndFlush(legacyCandidates);
        }
    }

    /**
     * 시딩한 커밋 전표(BF prefix)를 테스트 후 소프트삭제한다. persistCommittedPartnerless 는
     * 비-@Transactional 로 SENT(partner null) 전표를 영속하므로, 정리하지 않으면 공유 Testcontainers
     * DB 에 잔류해 타 IT(예: SlipQueryRedesignIT 전역 조회 content[0])를 오염시킨다(테스트 격리).
     */
    @AfterEach
    void cleanupSeededSlips() {
        var seeded = slipRepository.findAll().stream()
                .filter(slip -> slip.getSlipNo() != null
                        && (slip.getSlipNo().startsWith("2026/07/19-BF-")
                        || slip.getSlipNo().startsWith("2026/08/09-2")))
                .toList();
        seeded.forEach(slip -> slip.markDeleted("backfill-it-cleanup"));
        if (!seeded.isEmpty()) {
            slipRepository.saveAllAndFlush(seeded);
        }
    }

    @Test
    void backfill_resolvesPartnerCode_updatesDatabase_andSecondRunIsIdempotent() throws Exception {
        UUID partnerId = UUID.randomUUID();
        long baselineCandidates = candidateCount();
        long baselineRemaining = remainingCount();
        Slip violation = persistCommittedPartnerless("P-BACKFILL-FOUND");
        when(partnerInternalClient.verifyPartnerCode("P-BACKFILL-FOUND"))
                .thenReturn(PartnerInternalClient.PartnerVerifyResult.found(Optional.of(partnerId)));

        mockMvc.perform(post("/internal/slips/backfill-committed-partners")
                        .header("X-Internal-Token", "test-internal-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.processedCount").value(1))
                .andExpect(jsonPath("$.data.candidateCount").value((int) baselineCandidates + 1))
                .andExpect(jsonPath("$.data.unresolvedCount").value((int) baselineCandidates))
                .andExpect(jsonPath("$.data.remainingCount").value((int) baselineRemaining))
                .andExpect(jsonPath("$.data.dryRun").value(false));

        Slip updated = slipRepository.findById(violation.getId()).orElseThrow();
        org.assertj.core.api.Assertions.assertThat(updated.getPartnerId()).isEqualTo(partnerId);
        org.assertj.core.api.Assertions.assertThat(updated.getModifiedBy()).isEqualTo("system-internal");

        mockMvc.perform(post("/internal/slips/backfill-committed-partners")
                        .header("X-Internal-Token", "test-internal-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.processedCount").value(0))
                .andExpect(jsonPath("$.data.candidateCount").value((int) baselineCandidates))
                .andExpect(jsonPath("$.data.unresolvedCount").value((int) baselineCandidates))
                .andExpect(jsonPath("$.data.remainingCount").value((int) baselineRemaining));

        verify(partnerInternalClient, times(1)).verifyPartnerCode(eq("P-BACKFILL-FOUND"));
    }

    @Test
    void backfill_dryRun_doesNotModify_and_reportsPartnerlessCodeMissingRow() throws Exception {
        long baselineCandidates = candidateCount();
        long baselineRemaining = remainingCount();
        Slip violation = persistCommittedPartnerless(null);

        mockMvc.perform(post("/internal/slips/backfill-committed-partners")
                        .param("dryRun", "true")
                        .header("X-Internal-Token", "test-internal-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.processedCount").value(0))
                .andExpect(jsonPath("$.data.candidateCount").value((int) baselineCandidates + 1))
                .andExpect(jsonPath("$.data.unresolvedCount").value((int) baselineCandidates + 1))
                .andExpect(jsonPath("$.data.remainingCount").value((int) baselineRemaining + 1))
                .andExpect(jsonPath("$.data.dryRun").value(true))
                .andExpect(jsonPath("$.data.unresolved[*].slipNo", hasItem(violation.getSlipNo())));

        Slip unchanged = slipRepository.findById(violation.getId()).orElseThrow();
        org.assertj.core.api.Assertions.assertThat(unchanged.getPartnerId()).isNull();
        verify(partnerInternalClient, times(0)).verifyPartnerCode(eq(""));
    }

    @Test
    void backfill_resolvesPartnerIdToCode_withoutChangingPartnerId() throws Exception {
        UUID partnerId = UUID.randomUUID();
        long baselineCandidates = candidateCount();
        long baselineRemaining = remainingCount();
        Slip violation = persistCommittedWithPartnerId(partnerId);
        when(partnerInternalClient.resolvePartnerCode(partnerId))
                .thenReturn(Optional.of("P-BACKFILL-CODE-FOUND"));

        mockMvc.perform(post("/internal/slips/backfill-committed-partners")
                        .header("X-Internal-Token", "test-internal-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.processedCount").value(1))
                .andExpect(jsonPath("$.data.candidateCount").value((int) baselineCandidates + 1))
                .andExpect(jsonPath("$.data.unresolvedCount").value((int) baselineCandidates))
                .andExpect(jsonPath("$.data.remainingCount").value((int) baselineRemaining));

        Slip updated = slipRepository.findById(violation.getId()).orElseThrow();
        org.assertj.core.api.Assertions.assertThat(updated.getPartnerId()).isEqualTo(partnerId);
        org.assertj.core.api.Assertions.assertThat(updated.getPartnerCode()).isEqualTo("P-BACKFILL-CODE-FOUND");
        verify(partnerInternalClient, times(1)).resolvePartnerCode(partnerId);
    }

    @Test
    void backfillActivePartnerCodes_repairsDraftWithoutBlockingNormalDraftLifecycle() throws Exception {
        UUID partnerId = UUID.randomUUID();
        long baseline = activeCodeMissingCount();
        Slip violation = persistDraftWithPartnerId(partnerId);
        when(partnerInternalClient.resolvePartnerCode(partnerId))
                .thenReturn(Optional.of("P-BACKFILL-DRAFT-001"));

        mockMvc.perform(post("/internal/slips/backfill-active-partner-codes")
                        .header("X-Internal-Token", "test-internal-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.candidateCount").value((int) baseline + 1))
                .andExpect(jsonPath("$.data.processedCount").value(1))
                .andExpect(jsonPath("$.data.remainingCount").value((int) baseline));

        Slip updated = slipRepository.findById(violation.getId()).orElseThrow();
        org.assertj.core.api.Assertions.assertThat(updated.getPartnerCode())
                .isEqualTo("P-BACKFILL-DRAFT-001");
        org.assertj.core.api.Assertions.assertThat(updated.getStatus()).isEqualTo(SlipStatus.DRAFT);
    }

    @Test
    void unresolvedSlip_isExcludedFromActiveList_andRetainsEvidence() throws Exception {
        UUID partnerId = UUID.randomUUID();
        Slip unresolved = persistUnresolvedSlip(partnerId, "2026/08/09-2");
        when(partnerInternalClient.resolvePartnerCode(partnerId)).thenReturn(Optional.empty());

        mockMvc.perform(post("/internal/slips/backfill-active-partner-codes")
                        .header("X-Internal-Token", "test-internal-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.unresolved[*].slipNo", hasItem("2026/08/09-2")));

        mockMvc.perform(post("/internal/slips/quarantine-unresolved-partner-slips")
                        .contentType(APPLICATION_JSON)
                        .content("{\"slipNos\":[\"2026/08/09-2\"],\"reason\":\"활성 partner 원본 없음\"}")
                        .header("X-Internal-Token", "test-internal-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.quarantinedCount").value(1));

        org.assertj.core.api.Assertions.assertThat(slipRepository.findBySlipNo("2026/08/09-2")).isEmpty();
        Slip deleted = slipRepository.findBySlipTypeAndSlipNoIncludingDeleted(
                unresolved.getSlipType().name(), unresolved.getSlipNo()).orElseThrow();
        org.assertj.core.api.Assertions.assertThat(deleted.getIsDeleted()).isTrue();
        org.assertj.core.api.Assertions.assertThat(quarantineRepository.findBySlipId(unresolved.getId()))
                .get().extracting(q -> q.getReason()).isEqualTo("활성 partner 원본 없음");
    }

    @Test
    void quarantinedSlip_canBeRestoredWithResolvedPartnerCode() throws Exception {
        UUID partnerId = UUID.randomUUID();
        Slip unresolved = persistUnresolvedSlip(partnerId, "2026/08/09-2");
        when(partnerInternalClient.resolvePartnerCode(partnerId)).thenReturn(Optional.empty());

        mockMvc.perform(post("/internal/slips/quarantine-unresolved-partner-slips")
                        .contentType(APPLICATION_JSON)
                        .content("{\"slipNos\":[\"2026/08/09-2\"],\"reason\":\"활성 partner 원본 없음\"}")
                        .header("X-Internal-Token", "test-internal-token"))
                .andExpect(status().isOk());

        when(partnerInternalClient.resolvePartnerCode(partnerId)).thenReturn(Optional.of("P-RESTORED-001"));
        mockMvc.perform(post("/internal/slips/restore-quarantined-partner-slips")
                        .contentType(APPLICATION_JSON)
                        .content("{\"slipNos\":[\"2026/08/09-2\"]}")
                        .header("X-Internal-Token", "test-internal-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.restoredCount").value(1));

        Slip restored = slipRepository.findBySlipNo("2026/08/09-2").orElseThrow();
        org.assertj.core.api.Assertions.assertThat(restored.getPartnerCode()).isEqualTo("P-RESTORED-001");
        org.assertj.core.api.Assertions.assertThat(quarantineRepository.findBySlipId(unresolved.getId()))
                .get().extracting(q -> q.getRestoredAt()).isNotNull();
    }

    @Test
    void eightResolvableRows_areNotConsumedByQuarantineInput() throws Exception {
        for (int i = 0; i < 8; i++) {
            UUID partnerId = UUID.randomUUID();
            persistUnresolvedSlip(partnerId, "2026/08/09-2-RESTORABLE-" + i);
            when(partnerInternalClient.resolvePartnerCode(partnerId))
                    .thenReturn(Optional.of("P-RESTORABLE-" + i));
        }

        mockMvc.perform(post("/internal/slips/backfill-active-partner-codes")
                        .header("X-Internal-Token", "test-internal-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.processedCount").value(8));

        org.assertj.core.api.Assertions.assertThat(slipRepository.findAll()).hasSizeGreaterThanOrEqualTo(8);
        org.assertj.core.api.Assertions.assertThat(quarantineRepository.findBySlipId(
                slipRepository.findAll().stream()
                        .filter(slip -> slip.getSlipNo().startsWith("2026/08/09-2-RESTORABLE-0"))
                        .findFirst().orElseThrow().getId())).isEmpty();
    }

    private long candidateCount() {
        return slipRepository.findAllByStatusInAndPartnerIdIsNullAndIsDeletedFalse(
                        Slip.requiredPartnerStatuses()).size()
                + slipRepository.findAllByStatusInAndPartnerIdIsNotNullAndPartnerCodeMissingAndIsDeletedFalse(
                        Slip.requiredPartnerStatuses()).size();
    }

    private long remainingCount() {
        return slipRepository.countByStatusInAndEitherPartnerColumnMissing(Slip.requiredPartnerStatuses());
    }

    private long activeCodeMissingCount() {
        return slipRepository.findAllActiveWithPartnerIdAndPartnerCodeMissing().size();
    }

    private Slip persistCommittedPartnerless(String partnerCode) {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        Slip slip = Slip.createOutbound(
                "2026/07/19-BF-" + suffix,
                LocalDate.of(2026, 7, 19),
                Math.abs(suffix.hashCode()),
                UUID.randomUUID(), UUID.randomUUID(),
                null, null, DeliveryTag.SALE, "backfill test", "backfill-test");
        slip.setPartnerCode(partnerCode);
        ReflectionTestUtils.setField(slip, "status", SlipStatus.SENT);
        return slipRepository.saveAndFlush(slip);
    }

    private Slip persistCommittedWithPartnerId(UUID partnerId) {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        Slip slip = Slip.createInbound(
                "2026/07/19-BF-CODE-" + suffix,
                LocalDate.of(2026, 7, 19),
                Math.abs(suffix.hashCode()),
                UUID.randomUUID(), partnerId, "backfill code test", null,
                "backfill code test", "backfill-test");
        ReflectionTestUtils.setField(slip, "status", SlipStatus.SENT);
        return slipRepository.saveAndFlush(slip);
    }

    private Slip persistDraftWithPartnerId(UUID partnerId) {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        Slip slip = Slip.createInbound(
                "2026/07/19-BF-DRAFT-" + suffix, LocalDate.of(2026, 7, 19),
                Math.abs(suffix.hashCode()), UUID.randomUUID(), partnerId,
                "backfill draft test", null, "backfill draft test", "backfill-test");
        return slipRepository.saveAndFlush(slip);
    }

    private Slip persistUnresolvedSlip(UUID partnerId, String slipNo) {
        Slip slip = Slip.createInbound(slipNo, LocalDate.of(2026, 8, 9),
                Math.abs(slipNo.hashCode()), UUID.randomUUID(), partnerId,
                "복원 불가 거래처", null, "격리 테스트", "quarantine-test");
        ReflectionTestUtils.setField(slip, "status", SlipStatus.CONFIRMED);
        return slipRepository.saveAndFlush(slip);
    }
}
