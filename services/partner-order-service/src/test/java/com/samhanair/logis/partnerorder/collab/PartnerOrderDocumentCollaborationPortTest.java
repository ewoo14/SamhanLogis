package com.samhanair.logis.partnerorder.collab;

import static org.mockito.Mockito.verify;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.revision.domain.PartnerOrderRevision;
import com.samhanair.logis.partnerorder.revision.domain.PartnerOrderRevisionType;
import com.samhanair.logis.partnerorder.revision.repository.PartnerOrderRevisionRepository;
import com.samhanair.logis.partnerorder.service.PartnerOrderUpdateService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * 주문 협업 포트 테스트.
 *
 * <p>snapshot, changeSet 파싱, 핵심 필드 불변 가드, 무효 actor 차단, 알림 기여자 수집 계약을
 * 고정한다.
 */
class PartnerOrderDocumentCollaborationPortTest {

    @Test
    void loadSnapshotSerializesOrderNoMemoDueDateStatusAndLines() {
        PartnerOrderRepository orderRepository = org.mockito.Mockito.mock(PartnerOrderRepository.class);
        PartnerOrderUpdateService updateService = org.mockito.Mockito.mock(PartnerOrderUpdateService.class);
        PartnerOrderRevisionRepository revisionRepository =
                org.mockito.Mockito.mock(PartnerOrderRevisionRepository.class);
        UUID orderId = UUID.randomUUID();
        PartnerOrder order = confirmedOrder("2099/06/13-1", "초기 메모", LocalDate.of(2099, 6, 20));
        ReflectionTestUtils.setField(order, "id", orderId);
        org.mockito.Mockito.when(orderRepository.findById(orderId)).thenReturn(Optional.of(order));

        PartnerOrderDocumentCollaborationPort port = new PartnerOrderDocumentCollaborationPort(
                orderRepository, updateService, new ObjectMapper(), null, null, revisionRepository);

        String json = port.loadSnapshot(orderId);

        org.assertj.core.api.Assertions.assertThat(json)
                .contains("\"orderNo\":\"2099/06/13-1\"")
                .contains("\"memo\":\"초기 메모\"")
                .contains("\"dueDate\":\"2099-06-20\"")
                .contains("\"lineKey\":1")
                .contains("\"remark\":\"초기 비고\"");
    }

    @Test
    void applyChangeSetAppliesOnlyMemoDueDateAndLineRemarkInSingleBatch() {
        PartnerOrderRepository orderRepository = org.mockito.Mockito.mock(PartnerOrderRepository.class);
        PartnerOrderUpdateService updateService = org.mockito.Mockito.mock(PartnerOrderUpdateService.class);
        PartnerOrderRevisionRepository revisionRepository =
                org.mockito.Mockito.mock(PartnerOrderRevisionRepository.class);
        UUID orderId = UUID.randomUUID();
        UUID editorId = UUID.fromString("20000000-0000-0000-0000-000000000001");

        PartnerOrderDocumentCollaborationPort port = new PartnerOrderDocumentCollaborationPort(
                orderRepository, updateService, new ObjectMapper(), null, null, revisionRepository);

        port.applyOverlayPatchBatch(orderId, """
                {
                  "memo": {"before": "old", "after": "new"},
                  "/dueDate": {"after": "2099-06-25"},
                  "/line.1.remark": {"after": "라인 비고"}
                }
                """, editorId, "영업담당자");

        java.util.Map<String, Object> expected = new java.util.LinkedHashMap<>();
        expected.put("memo", "new");
        expected.put("dueDate", "2099-06-25");
        expected.put("line.1.remark", "라인 비고");
        verify(updateService).applyOverlayPatchBatch(orderId, expected, editorId.toString());
    }

    @Test
    void validateChangeSetRejectsCoreHeaderAndLineFields() {
        PartnerOrderDocumentCollaborationPort port = new PartnerOrderDocumentCollaborationPort(
                org.mockito.Mockito.mock(PartnerOrderRepository.class),
                org.mockito.Mockito.mock(PartnerOrderUpdateService.class),
                new ObjectMapper(), null, null,
                org.mockito.Mockito.mock(PartnerOrderRevisionRepository.class));

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> port.validateChangeSet("""
                {"partnerCode":{"after":"P-OTHER"}}
                """))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("핵심");

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> port.validateChangeSet("""
                {"line.1.quantity":{"after":"99"}}
                """))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("핵심");
    }

    @Test
    void enrichChangeSetWithBeforeReadsCurrentMemoDueDateAndLineRemark() {
        PartnerOrderRepository orderRepository = org.mockito.Mockito.mock(PartnerOrderRepository.class);
        PartnerOrderUpdateService updateService = org.mockito.Mockito.mock(PartnerOrderUpdateService.class);
        PartnerOrderRevisionRepository revisionRepository =
                org.mockito.Mockito.mock(PartnerOrderRevisionRepository.class);
        UUID orderId = UUID.randomUUID();
        PartnerOrder order = confirmedOrder("2099/06/13-2", "기존 메모", LocalDate.of(2099, 6, 20));
        org.mockito.Mockito.when(orderRepository.findById(orderId)).thenReturn(Optional.of(order));

        PartnerOrderDocumentCollaborationPort port = new PartnerOrderDocumentCollaborationPort(
                orderRepository, updateService, new ObjectMapper(), null, null, revisionRepository);

        String json = port.enrichChangeSetWithBefore(orderId, """
                {"memo":{"after":"새 메모"},"dueDate":{"after":"2099-06-25"},"line.1.remark":{"after":"새 비고"}}
                """);

        org.assertj.core.api.Assertions.assertThat(json)
                .contains("\"before\":\"기존 메모\"")
                .contains("\"before\":\"2099-06-20\"")
                .contains("\"before\":\"초기 비고\"");
    }

    @Test
    void canProposeRejectsNullAndZeroUuidActor() {
        PartnerOrderDocumentCollaborationPort port = new PartnerOrderDocumentCollaborationPort(
                org.mockito.Mockito.mock(PartnerOrderRepository.class),
                org.mockito.Mockito.mock(PartnerOrderUpdateService.class),
                new ObjectMapper(), null, null,
                org.mockito.Mockito.mock(PartnerOrderRevisionRepository.class));
        UUID orderId = UUID.randomUUID();

        org.assertj.core.api.Assertions.assertThat(port.canPropose(null, orderId)).isFalse();
        org.assertj.core.api.Assertions.assertThat(port.canPropose(new UUID(0L, 0L), orderId)).isFalse();
        org.assertj.core.api.Assertions.assertThat(port.canDecide(UUID.randomUUID(), orderId)).isTrue();
    }

    @Test
    void resolveNotificationRecipientsCollectsContributorsAndSkipsCurrentEditor() {
        PartnerOrderRepository orderRepository = org.mockito.Mockito.mock(PartnerOrderRepository.class);
        PartnerOrderCollabSuggestionRepository suggestionRepository =
                org.mockito.Mockito.mock(PartnerOrderCollabSuggestionRepository.class);
        PartnerOrderCollabCommentRepository commentRepository =
                org.mockito.Mockito.mock(PartnerOrderCollabCommentRepository.class);
        PartnerOrderRevisionRepository revisionRepository =
                org.mockito.Mockito.mock(PartnerOrderRevisionRepository.class);
        UUID orderId = UUID.randomUUID();
        UUID editorId = UUID.fromString("20000000-0000-0000-0000-000000000001");
        UUID proposerId = UUID.fromString("20000000-0000-0000-0000-000000000002");
        UUID deciderId = UUID.fromString("20000000-0000-0000-0000-000000000003");
        UUID commentAuthorId = UUID.fromString("20000000-0000-0000-0000-000000000004");
        UUID revisionActorId = UUID.fromString("20000000-0000-0000-0000-000000000005");
        PartnerOrder order = confirmedOrder("2099/06/13-3", "알림 메모", null);
        ReflectionTestUtils.setField(order, "createdBy", "created_login");
        org.mockito.Mockito.when(orderRepository.findById(orderId)).thenReturn(Optional.of(order));
        PartnerOrderCollabSuggestion suggestion = PartnerOrderCollabSuggestion.create(
                com.samhanair.logis.collab.CollabDocumentType.PARTNER_ORDER, orderId,
                proposerId, "제안자", "{\"memo\":{\"after\":\"x\"}}", null);
        suggestion.accept(deciderId, "결정자");
        org.mockito.Mockito.when(suggestionRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(
                        com.samhanair.logis.collab.CollabDocumentType.PARTNER_ORDER, orderId))
                .thenReturn(List.of(suggestion));
        org.mockito.Mockito.when(commentRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(
                        com.samhanair.logis.collab.CollabDocumentType.PARTNER_ORDER, orderId))
                .thenReturn(List.of(PartnerOrderCollabComment.create(
                        com.samhanair.logis.collab.CollabDocumentType.PARTNER_ORDER, orderId,
                        "memo", commentAuthorId, "댓글작성자", "확인", null)));
        org.mockito.Mockito.when(revisionRepository.findByPartnerOrderIdOrderByRevisionNoDesc(orderId))
                .thenReturn(List.of(PartnerOrderRevision.of(
                        orderId, 1, PartnerOrderRevisionType.EDIT, null,
                        "2099/06/13-3", "{\"memo\":\"x\"}",
                        revisionActorId, "수정자", null)));

        PartnerOrderDocumentCollaborationPort port = new PartnerOrderDocumentCollaborationPort(
                orderRepository, org.mockito.Mockito.mock(PartnerOrderUpdateService.class), new ObjectMapper(),
                suggestionRepository, commentRepository, revisionRepository);

        Set<String> recipients = port.resolveNotificationRecipients(orderId, editorId);

        org.assertj.core.api.Assertions.assertThat(recipients)
                .containsExactlyInAnyOrder(
                        "created_login",
                        proposerId.toString(),
                        deciderId.toString(),
                        commentAuthorId.toString(),
                        revisionActorId.toString())
                .doesNotContain(editorId.toString());
    }

    private static PartnerOrder confirmedOrder(String orderNo, String memo, LocalDate dueDate) {
        PartnerOrder order = PartnerOrder.createFromEstimate(
                "P-COLLAB",
                "1010101010",
                orderNo,
                "IT-COLLAB-" + orderNo,
                BigDecimal.ZERO,
                UUID.randomUUID(),
                dueDate,
                memo);
        order.addLine(PartnerOrderLine.create(
                UUID.randomUUID(),
                "AJ040RXH4BC1",
                "실외기",
                "homemulti",
                2,
                BigDecimal.valueOf(120000),
                "초기 비고"));
        order.markSlipPublished("S-" + orderNo.replace("/", "").replace("-", ""));
        return order;
    }
}
