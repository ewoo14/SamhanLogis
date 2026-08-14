package com.samhanair.logis.auth.claude;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ClaudeConversationServiceTest {

    @Test
    void listingSessionsReadsStoredSummaryWithoutCallingModel() {
        UUID accountId = UUID.randomUUID();
        ClaudeConversationSession session = ClaudeConversationSession.create(accountId, "CLD-20260814-000001");
        session.recordSummary("미배차 차량 처리 순서 요약", "미배차 차량을 어떻게 처리하나요?", true);

        ClaudeModelClient modelClient = mock(ClaudeModelClient.class);
        ClaudeConversationSessionRepository sessions = mock(ClaudeConversationSessionRepository.class);
        ClaudeConversationAuditRepository audits = mock(ClaudeConversationAuditRepository.class);
        when(sessions.findAllByAccountIdAndIsDeletedFalseOrderByCreatedAtDesc(accountId))
                .thenReturn(List.of(session));
        when(audits.countBySessionCode("CLD-20260814-000001")).thenReturn(1L);

        ClaudeConversationService service = new ClaudeConversationService(
                new ClaudeCredentialProperties("", "", ""),
                modelClient,
                mock(ClaudeConversationAuditRecorder.class),
                sessions,
                audits);

        var listed = service.listSessions(accountId);

        assertThat(listed).singleElement().satisfies(item -> {
            assertThat(item.title()).isEqualTo("미배차 차량 처리 순서 요약");
            assertThat(item.title()).isNotEqualTo(item.lastMessage());
        });
        verify(sessions).findAllByAccountIdAndIsDeletedFalseOrderByCreatedAtDesc(accountId);
        verify(audits).countBySessionCode("CLD-20260814-000001");
        verifyNoInteractions(modelClient);
    }
}
