package com.samhanair.logis.slip.collab;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
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
 * 전표 협업 bean 설정 테스트.
 *
 * <p>shared/collab-core 의 댓글/제안 generic service 를 전표 concrete entity 로 실배선하고,
 * 이벤트 publish 와 제안 수락 시 DocumentCollaborationPort 위임이 유지되는지 검증한다.
 */
class SlipCollabConfigTest {

    @Test
    void commentService_addSlipComment_persistsOutboundDocumentTypeAndPublishes() {
        SlipCollabCommentRepository repository =
                org.mockito.Mockito.mock(SlipCollabCommentRepository.class);
        RealtimeBroker broker = org.mockito.Mockito.mock(RealtimeBroker.class);
        CollabRealtimePublisher publisher = new CollabRealtimePublisher(broker);
        CollabCommentService<SlipCollabComment> service =
                new SlipCollabConfig().slipCollabCommentService(repository, publisher);
        UUID slipId = UUID.randomUUID();
        UUID authorId = UUID.randomUUID();

        when(repository.save(any(SlipCollabComment.class))).thenAnswer(inv -> {
            SlipCollabComment comment = inv.getArgument(0);
            ReflectionTestUtils.setField(comment, "id", UUID.randomUUID());
            return comment;
        });

        SlipCollabComment saved = service.add(
                CollabDocumentType.SLIP_OUTBOUND,
                slipId,
                "memo",
                authorId,
                "오병승",
                "배송 메모 확인",
                null);

        assertThat(saved.getDocumentType()).isEqualTo(CollabDocumentType.SLIP_OUTBOUND);
        assertThat(saved.getDocumentId()).isEqualTo(slipId);
        assertThat(saved.getAuthorName()).isEqualTo("오병승");
        verify(repository, times(1)).save(any(SlipCollabComment.class));
        verify(broker, times(1))
                .publish(eq(slipId), eq(CollabCommentService.EVENT_COMMENT_CREATED), any());
    }

    @Test
    void suggestionService_acceptDelegatesChangeSetToSlipDocumentPort() {
        SlipCollabSuggestionRepository repository =
                org.mockito.Mockito.mock(SlipCollabSuggestionRepository.class);
        RealtimeBroker broker = org.mockito.Mockito.mock(RealtimeBroker.class);
        CollabRealtimePublisher publisher = new CollabRealtimePublisher(broker);
        CollabSuggestionService<SlipCollabSuggestion> service =
                new SlipCollabConfig().slipCollabSuggestionService(repository, publisher);
        DocumentCollaborationPort port = org.mockito.Mockito.mock(DocumentCollaborationPort.class);
        UUID slipId = UUID.randomUUID();
        UUID suggestionId = UUID.randomUUID();
        String changeSet = "{\"memo\":{\"before\":\"old\",\"after\":\"new\"}}";
        SlipCollabSuggestion suggestion = SlipCollabSuggestion.create(
                CollabDocumentType.SLIP_OUTBOUND,
                slipId,
                UUID.randomUUID(),
                "오병승",
                changeSet,
                "메모 정정");
        ReflectionTestUtils.setField(suggestion, "id", suggestionId);

        when(port.documentType()).thenReturn(CollabDocumentType.SLIP_OUTBOUND);
        when(port.canDecide(any(UUID.class), eq(slipId))).thenReturn(true);
        when(repository.findById(suggestionId)).thenReturn(Optional.of(suggestion));
        when(repository.save(any(SlipCollabSuggestion.class))).thenAnswer(inv -> inv.getArgument(0));

        SlipCollabSuggestion accepted = service.accept(
                suggestionId, port, UUID.randomUUID(), "관리자");

        assertThat(accepted.getStatus().name()).isEqualTo("ACCEPTED");
        verify(port).applyChangeSet(slipId, changeSet);
        verify(broker).publish(
                eq(slipId), eq(CollabSuggestionService.EVENT_SUGGESTION_ACCEPTED), any());
    }
}
