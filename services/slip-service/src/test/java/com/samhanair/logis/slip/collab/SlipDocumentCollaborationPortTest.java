package com.samhanair.logis.slip.collab;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.revision.domain.SlipRevision;
import com.samhanair.logis.slip.revision.domain.SlipRevisionType;
import com.samhanair.logis.slip.revision.domain.SlipSnapshot;
import com.samhanair.logis.slip.revision.repository.SlipRevisionRepository;
import com.samhanair.logis.slip.revision.service.SlipRevisionService;
import com.samhanair.logis.slip.service.SlipService;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * 전표 협업 포트 테스트.
 *
 * <p>기존 DocumentCollaborationPort 호환 경로와 수정완료 실사용 경로가 모두 overlay batch 를 사용하고,
 * 권한 판정은 기존 slip.audit-overlay page-code 를 재사용하는 계약을 고정한다.
 */
class SlipDocumentCollaborationPortTest {

    @Test
    void loadSnapshotSerializesCurrentSlipSnapshot() {
        SlipRepository slipRepository = org.mockito.Mockito.mock(SlipRepository.class);
        SlipService slipService = org.mockito.Mockito.mock(SlipService.class);
        SlipRevisionService revisionService = org.mockito.Mockito.mock(SlipRevisionService.class);
        Slip slip = org.mockito.Mockito.mock(Slip.class);
        UUID slipId = UUID.randomUUID();
        SlipSnapshot snapshot = snapshot("2026/06/13-1", "메모");

        org.mockito.Mockito.when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        org.mockito.Mockito.when(slip.toSnapshot()).thenReturn(snapshot);

        SlipDocumentCollaborationPort port = new SlipDocumentCollaborationPort(
                slipRepository, slipService, revisionService, new ObjectMapper());

        String json = port.loadSnapshot(slipId);

        org.assertj.core.api.Assertions.assertThat(json).contains("\"slipNo\":\"2026/06/13-1\"");
    }

    @Test
    void applyChangeSetAppliesAllFieldsInSingleBatch() {
        SlipRepository slipRepository = org.mockito.Mockito.mock(SlipRepository.class);
        SlipService slipService = org.mockito.Mockito.mock(SlipService.class);
        SlipRevisionService revisionService = org.mockito.Mockito.mock(SlipRevisionService.class);
        UUID slipId = UUID.randomUUID();

        SlipDocumentCollaborationPort port = new SlipDocumentCollaborationPort(
                slipRepository, slipService, revisionService, new ObjectMapper());

        port.applyChangeSet(slipId, """
                {
                  "memo": {"before": "old", "after": "new"},
                  "/shippingAddress": {"before": null, "after": "서울시 강남구"}
                }
                """);

        // 제안 1건 = 잠금 가드 1회 + revision 1건. 필드별 applyOverlayPatch 가 아니라 단일 배치 호출이어야 한다
        // (필드마다 호출하면 잠금 전표 APPROVED 가 첫 필드에서 소진되어 둘째 필드 CONFLICT + revision 오염).
        java.util.Map<String, String> expected = new java.util.LinkedHashMap<>();
        expected.put("memo", "new");
        expected.put("shippingAddress", "서울시 강남구");
        java.util.Map<String, String> expectedBefore = new java.util.LinkedHashMap<>();
        expectedBefore.put("memo", "old");
        expectedBefore.put("shippingAddress", null);
        verify(slipService).applyOverlayPatchBatch(
                slipId, expected, expectedBefore,
                "00000000-0000-0000-0000-000000000000", "협업 제안");
        org.mockito.Mockito.verify(slipService, org.mockito.Mockito.never())
                .applyOverlayPatch(any(), any(), any(), any(), any());
    }

    @Test
    void applyOverlayPatchBatchUsesEditorActorForDirectEdit() {
        SlipRepository slipRepository = org.mockito.Mockito.mock(SlipRepository.class);
        SlipService slipService = org.mockito.Mockito.mock(SlipService.class);
        SlipRevisionService revisionService = org.mockito.Mockito.mock(SlipRevisionService.class);
        UUID slipId = UUID.randomUUID();
        UUID editorId = UUID.fromString("20000000-0000-0000-0000-000000000001");

        SlipDocumentCollaborationPort port = new SlipDocumentCollaborationPort(
                slipRepository, slipService, revisionService, new ObjectMapper());

        port.applyOverlayPatchBatch(slipId, """
                {
                  "memo": {"before": null, "after": "수정 메모"}
                }
                """, editorId, "수정자김대리");

        java.util.Map<String, String> expected = new java.util.LinkedHashMap<>();
        expected.put("memo", "수정 메모");
        java.util.Map<String, String> expectedBefore = new java.util.LinkedHashMap<>();
        expectedBefore.put("memo", null);
        verify(slipService).applyOverlayPatchBatch(
                slipId, expected, expectedBefore, editorId.toString(), "수정자김대리");
    }

    @Test
    void applyChangeSetRejectsEntryWithoutBeforeField() {
        SlipRepository slipRepository = org.mockito.Mockito.mock(SlipRepository.class);
        SlipService slipService = org.mockito.Mockito.mock(SlipService.class);
        SlipRevisionService revisionService = org.mockito.Mockito.mock(SlipRevisionService.class);
        UUID slipId = UUID.randomUUID();

        SlipDocumentCollaborationPort port = new SlipDocumentCollaborationPort(
                slipRepository, slipService, revisionService, new ObjectMapper());

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> port.applyChangeSet(slipId, """
                {
                  "memo": {"after": "new"}
                }
                """))
                .isInstanceOf(com.samhanair.logis.common.exception.BusinessException.class)
                .hasMessageContaining("before/after");
        org.mockito.Mockito.verifyNoInteractions(slipService);
    }

    @Test
    void applyChangeSetRejectsScalarEntryInsteadOfTreatingItAsNullPatch() {
        SlipRepository slipRepository = org.mockito.Mockito.mock(SlipRepository.class);
        SlipService slipService = org.mockito.Mockito.mock(SlipService.class);
        SlipRevisionService revisionService = org.mockito.Mockito.mock(SlipRevisionService.class);
        UUID slipId = UUID.randomUUID();

        SlipDocumentCollaborationPort port = new SlipDocumentCollaborationPort(
                slipRepository, slipService, revisionService, new ObjectMapper());

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> port.applyChangeSet(slipId, """
                {
                  "memo": null
                }
                """))
                .isInstanceOf(com.samhanair.logis.common.exception.BusinessException.class)
                .hasMessageContaining("before/after");
        org.mockito.Mockito.verifyNoInteractions(slipService);
    }

    /**
     * propose 시점 changeSet 조기 검증 — 비JSON/구조불량은 거부하고, 정상 구조는 도메인 호출 없이 통과한다.
     *
     * <p>검증만 수행하므로 어떤 입력에서도 {@code slipService} (mutation 경로) 와는 상호작용하지
     * 않아야 한다 — accept 측 {@code applyChangeSet} 과 동일 파싱 규칙 재사용 계약 (Round C P2).
     */
    @Test
    void validateChangeSetRejectsMalformedInputWithoutTouchingDomain() {
        SlipRepository slipRepository = org.mockito.Mockito.mock(SlipRepository.class);
        SlipService slipService = org.mockito.Mockito.mock(SlipService.class);
        SlipRevisionService revisionService = org.mockito.Mockito.mock(SlipRevisionService.class);

        SlipDocumentCollaborationPort port = new SlipDocumentCollaborationPort(
                slipRepository, slipService, revisionService, new ObjectMapper());

        // (a) 비JSON 문자열 — jsonb cast 500 대신 propose 시점 INVALID_INPUT
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> port.validateChangeSet("not-json"))
                .isInstanceOf(com.samhanair.logis.common.exception.BusinessException.class)
                .hasMessageContaining("JSON");

        // (b) 구조 불량 — entry 가 before/after object 가 아닌 scalar (poison suggestion 차단)
        org.assertj.core.api.Assertions.assertThatThrownBy(
                        () -> port.validateChangeSet("{\"memo\":\"x\"}"))
                .isInstanceOf(com.samhanair.logis.common.exception.BusinessException.class)
                .hasMessageContaining("after");

        // (c) 정상 구조 — 예외 없이 통과
        port.validateChangeSet("{\"memo\":{\"before\":null,\"after\":\"새 값\"}}");

        // 검증은 파싱만 — 도메인 mutation 경로 무접촉
        org.mockito.Mockito.verifyNoInteractions(slipService);
    }

    /**
     * null actor(헤더 부재) 와 zero-UUID actor(파싱 실패)는 권한 client 없이 즉시 거부된다.
     *
     * <p>포트는 무효 actor 가드만 수행하므로 {@code DynamicPermissionClient} 에 의존하지 않는다.
     * 정상 userId 의 권한 판정은 컨트롤러 {@code @RequirePermission} Aspect 가 담당한다.
     */
    @Test
    void canProposeRejectsNullAndZeroUuidActorWithoutPermissionCheck() {
        SlipRepository slipRepository = org.mockito.Mockito.mock(SlipRepository.class);
        SlipService slipService = org.mockito.Mockito.mock(SlipService.class);
        SlipRevisionService revisionService = org.mockito.Mockito.mock(SlipRevisionService.class);
        UUID slipId = UUID.randomUUID();

        SlipDocumentCollaborationPort port = new SlipDocumentCollaborationPort(
                slipRepository, slipService, revisionService, new ObjectMapper());

        // 헤더 부재(null) / 파싱 실패(zero-UUID) actor 는 즉시 거부
        org.assertj.core.api.Assertions.assertThat(port.canPropose(null, slipId)).isFalse();
        org.assertj.core.api.Assertions.assertThat(
                port.canPropose(new UUID(0L, 0L), slipId)).isFalse();
        org.assertj.core.api.Assertions.assertThat(
                port.canDecide(new UUID(0L, 0L), slipId)).isFalse();
    }

    @Test
    void restoreSnapshotRestoresDomainSnapshotAndCapturesRestoreRevision() throws Exception {
        SlipRepository slipRepository = org.mockito.Mockito.mock(SlipRepository.class);
        SlipService slipService = org.mockito.Mockito.mock(SlipService.class);
        SlipRevisionService revisionService = org.mockito.Mockito.mock(SlipRevisionService.class);
        Slip slip = org.mockito.Mockito.mock(Slip.class);
        UUID slipId = UUID.randomUUID();
        SlipSnapshot snapshot = snapshot("2026/06/13-2", "복원 메모");
        ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
        org.mockito.Mockito.when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        SlipDocumentCollaborationPort port = new SlipDocumentCollaborationPort(
                slipRepository, slipService, revisionService, objectMapper);

        port.restoreSnapshot(slipId, objectMapper.writeValueAsString(snapshot));

        verify(slip).restoreFromSnapshot(any(SlipSnapshot.class));
        verify(slipRepository).save(slip);
        verify(revisionService).capture(
                eq(slip), eq(SlipRevisionType.RESTORE), eq(null),
                any(UUID.class), eq("협업 복원"), eq(null));
    }

    /**
     * 유효 userId(non-null, non-zero-UUID) 에 대해 canPropose/canDecide 가 true 를 반환한다.
     *
     * <p>실서버 QA 회귀 락인 (2026-06-13): master/역할보유자가 컨트롤러 {@code @RequirePermission}
     * Aspect 를 통과한 뒤 포트의 계정단위 permissionClient.check 에서 오거부되지 않음을 보장한다.
     * 권한 판정은 Aspect 가 담당하므로 포트는 {@code DynamicPermissionClient} 에 의존하지 않는다.
     *
     * <p>([[enforcement-real-http-test]] 계열 — 실 HTTP 게이트에서 검증된 계약 박제)
     */
    @Test
    void canProposeAllowsValidActorAndDelegatesPermissionToEndpoint() {
        SlipRepository slipRepository = org.mockito.Mockito.mock(SlipRepository.class);
        SlipService slipService = org.mockito.Mockito.mock(SlipService.class);
        SlipRevisionService revisionService = org.mockito.Mockito.mock(SlipRevisionService.class);
        UUID userId = UUID.randomUUID(); // 유효 actor — non-null, non-zero-UUID
        UUID slipId = UUID.randomUUID();

        SlipDocumentCollaborationPort port = new SlipDocumentCollaborationPort(
                slipRepository, slipService, revisionService, new ObjectMapper());

        // 유효 actor 이면 permissionClient 호출 없이 true 반환 (권한 판정은 @RequirePermission Aspect 담당)
        org.assertj.core.api.Assertions.assertThat(port.canPropose(userId, slipId)).isTrue();
        org.assertj.core.api.Assertions.assertThat(port.canDecide(userId, slipId)).isTrue();
    }

    /**
     * 수정완료 알림 수신자는 전표 작성자/기여 이력/댓글/다음 결재자를 합산하고 현재 수정자는 제외한다.
     *
     * <p>입출고전표 레퍼런스 계약: requesterId 또는 createdBy, revision.actorId,
     * suggestion.proposerId/decidedById, comment.authorId, dispatcherUserId, inspectorUserId 를
     * distinct 문자열 set 으로 반환한다. UUID 가 아닌 과거 username 식별자는 slip-service
     * {@code UserIdResolver} 가 후단에서 auth-service by-login 으로 변환한다.
     */
    @Test
    void resolveNotificationRecipientsCollectsContributorsApproversAndSkipsCurrentEditor() {
        SlipRepository slipRepository = org.mockito.Mockito.mock(SlipRepository.class);
        SlipService slipService = org.mockito.Mockito.mock(SlipService.class);
        SlipRevisionService revisionService = org.mockito.Mockito.mock(SlipRevisionService.class);
        SlipRevisionRepository revisionRepository = org.mockito.Mockito.mock(SlipRevisionRepository.class);
        SlipCollabSuggestionRepository suggestionRepository =
                org.mockito.Mockito.mock(SlipCollabSuggestionRepository.class);
        SlipCollabCommentRepository commentRepository =
                org.mockito.Mockito.mock(SlipCollabCommentRepository.class);
        Slip slip = org.mockito.Mockito.mock(Slip.class);
        UUID slipId = UUID.randomUUID();
        UUID editorId = UUID.fromString("20000000-0000-0000-0000-000000000001");
        UUID revisionActorId = UUID.fromString("20000000-0000-0000-0000-000000000002");
        UUID proposerId = UUID.fromString("20000000-0000-0000-0000-000000000003");
        UUID deciderId = UUID.fromString("20000000-0000-0000-0000-000000000004");
        UUID commentAuthorId = UUID.fromString("20000000-0000-0000-0000-000000000005");
        UUID inspectorId = UUID.fromString("20000000-0000-0000-0000-000000000006");

        org.mockito.Mockito.when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        org.mockito.Mockito.when(slip.getRequesterId()).thenReturn("legacy_writer");
        org.mockito.Mockito.when(slip.getCreatedBy()).thenReturn("created_user");
        org.mockito.Mockito.when(slip.getDispatcherUserId()).thenReturn(editorId.toString());
        org.mockito.Mockito.when(slip.getInspectorUserId()).thenReturn(inspectorId.toString());
        org.mockito.Mockito.when(revisionRepository.findBySlipIdOrderByRevisionNoDesc(slipId))
                .thenReturn(List.of(SlipRevision.of(slipId, 1, SlipRevisionType.EDIT, null,
                        "2026/06/13-1", LocalDate.of(2026, 6, 13), snapshot("2026/06/13-1", "M"),
                        revisionActorId, "수정자", null)));
        SlipCollabSuggestion suggestion = SlipCollabSuggestion.create(
                com.samhanair.logis.collab.CollabDocumentType.SLIP_OUTBOUND, slipId,
                proposerId, "제안자", "{\"memo\":{\"after\":\"x\"}}", null);
        suggestion.accept(deciderId, "결정자");
        org.mockito.Mockito.when(suggestionRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(
                        com.samhanair.logis.collab.CollabDocumentType.SLIP_OUTBOUND, slipId))
                .thenReturn(List.of(suggestion));
        org.mockito.Mockito.when(commentRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(
                        com.samhanair.logis.collab.CollabDocumentType.SLIP_OUTBOUND, slipId))
                .thenReturn(List.of(SlipCollabComment.create(
                        com.samhanair.logis.collab.CollabDocumentType.SLIP_OUTBOUND, slipId,
                        "memo", commentAuthorId, "댓글작성자", "확인", null)));

        SlipDocumentCollaborationPort port = new SlipDocumentCollaborationPort(
                slipRepository, slipService, revisionService, new ObjectMapper(),
                revisionRepository, suggestionRepository, commentRepository);

        Set<String> recipients = port.resolveNotificationRecipients(slipId, editorId);

        // LinkedHashSet 내부 순서는 구현 세부사항이므로 순서 독립 단언 사용
        // self-skip(editorId 제외) 과 distinct 계약만 검증한다
        org.assertj.core.api.Assertions.assertThat(recipients)
                .containsExactlyInAnyOrder(
                        "legacy_writer",
                        "created_user",
                        revisionActorId.toString(),
                        proposerId.toString(),
                        deciderId.toString(),
                        commentAuthorId.toString(),
                        inspectorId.toString())
                .doesNotContain(editorId.toString());
    }

    @Test
    void restoreSnapshotCommittedSlipWithPartnerlessHistoryIsRejectedBeforePersistence() throws Exception {
        SlipRepository slipRepository = org.mockito.Mockito.mock(SlipRepository.class);
        SlipService slipService = org.mockito.Mockito.mock(SlipService.class);
        SlipRevisionService revisionService = org.mockito.Mockito.mock(SlipRevisionService.class);
        UUID slipId = UUID.randomUUID();
        Slip slip = Slip.createOutbound(
                "2026/06/13-3", LocalDate.of(2026, 6, 13), 3,
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "거래처",
                null, "메모", "user-1");
        slip.save();
        slip.send();
        SlipSnapshot partnerlessSnapshot = snapshot("2026/06/13-3", "거래처 없는 이력");
        org.mockito.Mockito.when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

        SlipDocumentCollaborationPort port = new SlipDocumentCollaborationPort(
                slipRepository, slipService, revisionService, objectMapper);

        org.assertj.core.api.Assertions.assertThatThrownBy(
                        () -> port.restoreSnapshot(
                                slipId, objectMapper.writeValueAsString(partnerlessSnapshot)))
                .isInstanceOf(com.samhanair.logis.common.exception.BusinessException.class)
                .hasMessage("거래처 없는 이력으로 커밋 전표를 복원할 수 없습니다");
        org.mockito.Mockito.verify(slipRepository, org.mockito.Mockito.never()).save(slip);
        org.mockito.Mockito.verifyNoInteractions(revisionService);
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
