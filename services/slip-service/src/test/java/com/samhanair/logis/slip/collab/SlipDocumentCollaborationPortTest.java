package com.samhanair.logis.slip.collab;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.revision.domain.SlipRevisionType;
import com.samhanair.logis.slip.revision.domain.SlipSnapshot;
import com.samhanair.logis.slip.revision.service.SlipRevisionService;
import com.samhanair.logis.slip.service.SlipService;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * 전표 협업 포트 테스트.
 *
 * <p>변경 제안 수락 시 collab-core 가 전달한 changeSet 을 기존 overlay patch 경로로 적용하고,
 * 권한 판정은 기존 slip.audit-overlay page-code 를 재사용하는 계약을 고정한다.
 */
class SlipDocumentCollaborationPortTest {

    @Test
    void loadSnapshotSerializesCurrentSlipSnapshot() {
        SlipRepository slipRepository = org.mockito.Mockito.mock(SlipRepository.class);
        SlipService slipService = org.mockito.Mockito.mock(SlipService.class);
        SlipRevisionService revisionService = org.mockito.Mockito.mock(SlipRevisionService.class);
        DynamicPermissionClient permissionClient =
                org.mockito.Mockito.mock(DynamicPermissionClient.class);
        Slip slip = org.mockito.Mockito.mock(Slip.class);
        UUID slipId = UUID.randomUUID();
        SlipSnapshot snapshot = snapshot("2026/06/13-1", "메모");

        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(slip.toSnapshot()).thenReturn(snapshot);

        SlipDocumentCollaborationPort port = new SlipDocumentCollaborationPort(
                slipRepository, slipService, revisionService, permissionClient, new ObjectMapper());

        String json = port.loadSnapshot(slipId);

        org.assertj.core.api.Assertions.assertThat(json).contains("\"slipNo\":\"2026/06/13-1\"");
    }

    @Test
    void applyChangeSetUsesExistingOverlayPatchPathForEachAfterValue() {
        SlipRepository slipRepository = org.mockito.Mockito.mock(SlipRepository.class);
        SlipService slipService = org.mockito.Mockito.mock(SlipService.class);
        SlipRevisionService revisionService = org.mockito.Mockito.mock(SlipRevisionService.class);
        DynamicPermissionClient permissionClient =
                org.mockito.Mockito.mock(DynamicPermissionClient.class);
        UUID slipId = UUID.randomUUID();

        SlipDocumentCollaborationPort port = new SlipDocumentCollaborationPort(
                slipRepository, slipService, revisionService, permissionClient, new ObjectMapper());

        port.applyChangeSet(slipId, """
                {
                  "memo": {"before": "old", "after": "new"},
                  "/shippingAddress": {"after": "서울시 강남구"}
                }
                """);

        verify(slipService).applyOverlayPatch(slipId, "memo", "new", "collab-core", "협업 제안");
        verify(slipService).applyOverlayPatch(
                slipId, "shippingAddress", "서울시 강남구", "collab-core", "협업 제안");
    }

    @Test
    void restoreSnapshotRestoresDomainSnapshotAndCapturesRestoreRevision() throws Exception {
        SlipRepository slipRepository = org.mockito.Mockito.mock(SlipRepository.class);
        SlipService slipService = org.mockito.Mockito.mock(SlipService.class);
        SlipRevisionService revisionService = org.mockito.Mockito.mock(SlipRevisionService.class);
        DynamicPermissionClient permissionClient =
                org.mockito.Mockito.mock(DynamicPermissionClient.class);
        Slip slip = org.mockito.Mockito.mock(Slip.class);
        UUID slipId = UUID.randomUUID();
        SlipSnapshot snapshot = snapshot("2026/06/13-2", "복원 메모");
        ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        SlipDocumentCollaborationPort port = new SlipDocumentCollaborationPort(
                slipRepository, slipService, revisionService, permissionClient, objectMapper);

        port.restoreSnapshot(slipId, objectMapper.writeValueAsString(snapshot));

        verify(slip).restoreFromSnapshot(any(SlipSnapshot.class));
        verify(slipRepository).save(slip);
        verify(revisionService).capture(
                eq(slip), eq(SlipRevisionType.RESTORE), eq(null),
                any(UUID.class), eq("협업 복원"), eq(null));
    }

    @Test
    void canProposeUsesSlipAuditOverlayUpdatePermission() {
        SlipRepository slipRepository = org.mockito.Mockito.mock(SlipRepository.class);
        SlipService slipService = org.mockito.Mockito.mock(SlipService.class);
        SlipRevisionService revisionService = org.mockito.Mockito.mock(SlipRevisionService.class);
        DynamicPermissionClient permissionClient =
                org.mockito.Mockito.mock(DynamicPermissionClient.class);
        UUID userId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();
        when(permissionClient.check(userId, "slip.audit-overlay", PermissionAction.UPDATE))
                .thenReturn(true);

        SlipDocumentCollaborationPort port = new SlipDocumentCollaborationPort(
                slipRepository, slipService, revisionService, permissionClient, new ObjectMapper());

        org.assertj.core.api.Assertions.assertThat(port.canPropose(userId, slipId)).isTrue();
        org.assertj.core.api.Assertions.assertThat(port.canDecide(userId, slipId)).isTrue();
    }

    private static SlipSnapshot snapshot(String slipNo, String memo) {
        return new SlipSnapshot(
                slipNo,
                LocalDate.of(2026, 6, 13),
                null,
                "거래처",
                "P-001",
                null,
                memo,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                List.of());
    }
}
