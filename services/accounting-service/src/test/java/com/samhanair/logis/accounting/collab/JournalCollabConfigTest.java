package com.samhanair.logis.accounting.collab;

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
 * 회계전표 협업 bean 설정 테스트.
 *
 * <p>shared/collab-core generic service가 Journal concrete entity/repository와 연결되고,
 * ACCOUNTING_VOUCHER 문서 타입 및 SSE 이벤트 계약을 유지하는지 검증한다.
 */
class JournalCollabConfigTest {

    @Test
    void commentService_addJournalComment_persistsAccountingVoucherTypeAndPublishes() {
        JournalCollabCommentRepository repository =
                org.mockito.Mockito.mock(JournalCollabCommentRepository.class);
        RealtimeBroker broker = org.mockito.Mockito.mock(RealtimeBroker.class);
        CollabRealtimePublisher publisher = new CollabRealtimePublisher(broker);
        CollabCommentService<JournalCollabComment> service =
                new JournalCollabConfig().journalCollabCommentService(repository, publisher);
        UUID journalId = UUID.randomUUID();
        UUID authorId = UUID.randomUUID();

        when(repository.save(any(JournalCollabComment.class))).thenAnswer(inv -> {
            JournalCollabComment comment = inv.getArgument(0);
            ReflectionTestUtils.setField(comment, "id", UUID.randomUUID());
            return comment;
        });

        JournalCollabComment saved = service.add(
                CollabDocumentType.ACCOUNTING_VOUCHER,
                journalId,
                "description",
                authorId,
                "회계담당자",
                "적요 확인",
                null);

        assertThat(saved.getDocumentType()).isEqualTo(CollabDocumentType.ACCOUNTING_VOUCHER);
        assertThat(saved.getDocumentId()).isEqualTo(journalId);
        assertThat(saved.getAuthorName()).isEqualTo("회계담당자");
        verify(repository).save(any(JournalCollabComment.class));
        verify(broker).publish(eq(journalId), eq(CollabCommentService.EVENT_COMMENT_CREATED), any());
    }

    @Test
    void suggestionService_acceptDelegatesChangeSetToJournalDocumentPort() {
        JournalCollabSuggestionRepository repository =
                org.mockito.Mockito.mock(JournalCollabSuggestionRepository.class);
        RealtimeBroker broker = org.mockito.Mockito.mock(RealtimeBroker.class);
        CollabRealtimePublisher publisher = new CollabRealtimePublisher(broker);
        CollabSuggestionService<JournalCollabSuggestion> service =
                new JournalCollabConfig().journalCollabSuggestionService(repository, publisher);
        DocumentCollaborationPort port = org.mockito.Mockito.mock(DocumentCollaborationPort.class);
        UUID journalId = UUID.randomUUID();
        UUID suggestionId = UUID.randomUUID();
        String changeSet = "{\"description\":{\"before\":\"old\",\"after\":\"new\"}}";
        JournalCollabSuggestion suggestion = JournalCollabSuggestion.create(
                CollabDocumentType.ACCOUNTING_VOUCHER,
                journalId,
                UUID.randomUUID(),
                "회계담당자",
                changeSet,
                "적요 정정");
        ReflectionTestUtils.setField(suggestion, "id", suggestionId);

        when(port.documentType()).thenReturn(CollabDocumentType.ACCOUNTING_VOUCHER);
        when(port.canDecide(any(UUID.class), eq(journalId))).thenReturn(true);
        when(repository.findById(suggestionId)).thenReturn(Optional.of(suggestion));
        when(repository.save(any(JournalCollabSuggestion.class))).thenAnswer(inv -> inv.getArgument(0));

        JournalCollabSuggestion accepted = service.accept(
                suggestionId, port, UUID.randomUUID(), "관리자");

        assertThat(accepted.getStatus().name()).isEqualTo("ACCEPTED");
        verify(port).applyChangeSet(journalId, changeSet);
        verify(broker).publish(eq(journalId), eq(CollabSuggestionService.EVENT_SUGGESTION_ACCEPTED), any());
    }
}
