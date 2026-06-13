package com.samhanair.logis.partnerorder.collab;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.collab.CollabCommentService;
import com.samhanair.logis.collab.CollabDocumentType;
import com.samhanair.logis.collab.CollabRealtimePublisher;
import com.samhanair.logis.collab.CollabSuggestionService;
import com.samhanair.logis.collab.DocumentCollaborationPort;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * 주문 협업 bean 설정 테스트.
 *
 * <p>shared/collab-core generic service 가 주문 concrete entity/repository 와 연결되고,
 * PARTNER_ORDER 문서 타입 및 SSE 이벤트 계약을 유지하는지 검증한다.
 */
class PartnerOrderCollabConfigTest {

    @Test
    void commentService_addPartnerOrderComment_persistsPartnerOrderTypeAndPublishes() {
        PartnerOrderCollabCommentRepository repository =
                org.mockito.Mockito.mock(PartnerOrderCollabCommentRepository.class);
        RealtimeBroker broker = org.mockito.Mockito.mock(RealtimeBroker.class);
        CollabRealtimePublisher publisher = new CollabRealtimePublisher(broker);
        CollabCommentService<PartnerOrderCollabComment> service =
                new PartnerOrderCollabConfig().partnerOrderCollabCommentService(repository, publisher);
        UUID orderId = UUID.randomUUID();
        UUID authorId = UUID.randomUUID();

        when(repository.save(any(PartnerOrderCollabComment.class))).thenAnswer(inv -> {
            PartnerOrderCollabComment comment = inv.getArgument(0);
            ReflectionTestUtils.setField(comment, "id", UUID.randomUUID());
            return comment;
        });

        PartnerOrderCollabComment saved = service.add(
                CollabDocumentType.PARTNER_ORDER,
                orderId,
                "memo",
                authorId,
                "영업담당자",
                "납기 확인",
                null);

        assertThat(saved.getDocumentType()).isEqualTo(CollabDocumentType.PARTNER_ORDER);
        assertThat(saved.getDocumentId()).isEqualTo(orderId);
        assertThat(saved.getAuthorName()).isEqualTo("영업담당자");
        verify(repository).save(any(PartnerOrderCollabComment.class));
        verify(broker).publish(eq(orderId), eq(CollabCommentService.EVENT_COMMENT_CREATED), any());
    }

    @Test
    void suggestionService_acceptDelegatesChangeSetToPartnerOrderDocumentPort() {
        PartnerOrderCollabSuggestionRepository repository =
                org.mockito.Mockito.mock(PartnerOrderCollabSuggestionRepository.class);
        RealtimeBroker broker = org.mockito.Mockito.mock(RealtimeBroker.class);
        CollabRealtimePublisher publisher = new CollabRealtimePublisher(broker);
        CollabSuggestionService<PartnerOrderCollabSuggestion> service =
                new PartnerOrderCollabConfig().partnerOrderCollabSuggestionService(repository, publisher);
        DocumentCollaborationPort port = org.mockito.Mockito.mock(DocumentCollaborationPort.class);
        UUID orderId = UUID.randomUUID();
        UUID suggestionId = UUID.randomUUID();
        String changeSet = "{\"memo\":{\"before\":\"old\",\"after\":\"new\"}}";
        PartnerOrderCollabSuggestion suggestion = PartnerOrderCollabSuggestion.create(
                CollabDocumentType.PARTNER_ORDER,
                orderId,
                UUID.randomUUID(),
                "영업담당자",
                changeSet,
                "요청사항 정정");
        ReflectionTestUtils.setField(suggestion, "id", suggestionId);

        when(port.documentType()).thenReturn(CollabDocumentType.PARTNER_ORDER);
        when(port.canDecide(any(UUID.class), eq(orderId))).thenReturn(true);
        when(repository.findById(suggestionId)).thenReturn(Optional.of(suggestion));
        when(repository.save(any(PartnerOrderCollabSuggestion.class))).thenAnswer(inv -> inv.getArgument(0));

        PartnerOrderCollabSuggestion accepted = service.accept(
                suggestionId, port, UUID.randomUUID(), "관리자");

        assertThat(accepted.getStatus().name()).isEqualTo("ACCEPTED");
        verify(port).applyChangeSet(orderId, changeSet);
        verify(broker).publish(eq(orderId), eq(CollabSuggestionService.EVENT_SUGGESTION_ACCEPTED), any());
    }
}
