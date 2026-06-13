package com.samhanair.logis.accounting.collab;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.JournalLine;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.accounting.repository.JournalRepository;
import com.samhanair.logis.accounting.service.JournalService;
import com.samhanair.logis.common.exception.BusinessException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * 회계전표 협업 포트 테스트.
 *
 * <p>snapshot, changeSet 파싱, 원장 불변 가드, 무효 actor 차단, 알림 기여자 수집 계약을 고정한다.
 */
class JournalDocumentCollaborationPortTest {

    @Test
    void loadSnapshotSerializesJournalNoDescriptionStatusAndLines() {
        JournalRepository journalRepository = org.mockito.Mockito.mock(JournalRepository.class);
        JournalService journalService = org.mockito.Mockito.mock(JournalService.class);
        UUID journalId = UUID.randomUUID();
        Journal journal = postedJournal("20990613-1", "초기 적요");
        org.springframework.test.util.ReflectionTestUtils.setField(journal, "id", journalId);
        org.mockito.Mockito.when(journalRepository.findById(journalId)).thenReturn(Optional.of(journal));

        JournalDocumentCollaborationPort port = new JournalDocumentCollaborationPort(
                journalRepository, journalService, new ObjectMapper(), null, null);

        String json = port.loadSnapshot(journalId);

        org.assertj.core.api.Assertions.assertThat(json)
                .contains("\"journalNo\":\"20990613-1\"")
                .contains("\"description\":\"초기 적요\"")
                .contains("\"lineNo\":1")
                .contains("\"memo\":\"차변 메모\"");
    }

    @Test
    void applyChangeSetAppliesOnlyDescriptionAndLineMemoInSingleBatch() {
        JournalRepository journalRepository = org.mockito.Mockito.mock(JournalRepository.class);
        JournalService journalService = org.mockito.Mockito.mock(JournalService.class);
        UUID journalId = UUID.randomUUID();
        UUID editorId = UUID.fromString("20000000-0000-0000-0000-000000000001");

        JournalDocumentCollaborationPort port = new JournalDocumentCollaborationPort(
                journalRepository, journalService, new ObjectMapper(), null, null);

        port.applyOverlayPatchBatch(journalId, """
                {
                  "description": {"before": "old", "after": "new"},
                  "/line.1.memo": {"after": "라인 메모"}
                }
                """, editorId, "회계담당자");

        java.util.Map<String, Object> expected = new java.util.LinkedHashMap<>();
        expected.put("description", "new");
        expected.put("line.1.memo", "라인 메모");
        verify(journalService).applyOverlayPatchBatch(journalId, expected, editorId.toString());
    }

    @Test
    void validateChangeSetRejectsLedgerFields() {
        JournalDocumentCollaborationPort port = new JournalDocumentCollaborationPort(
                org.mockito.Mockito.mock(JournalRepository.class),
                org.mockito.Mockito.mock(JournalService.class),
                new ObjectMapper(), null, null);

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> port.validateChangeSet("""
                {"line.1.debitAmount":{"after":"1000"}}
                """))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("원장");

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> port.validateChangeSet("""
                {"journalDate":{"after":"2099-06-14"}}
                """))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("원장");
    }

    @Test
    void enrichChangeSetWithBeforeReadsCurrentDescriptionAndLineMemo() {
        JournalRepository journalRepository = org.mockito.Mockito.mock(JournalRepository.class);
        JournalService journalService = org.mockito.Mockito.mock(JournalService.class);
        UUID journalId = UUID.randomUUID();
        Journal journal = postedJournal("20990613-2", "기존 적요");
        org.mockito.Mockito.when(journalRepository.findById(journalId)).thenReturn(Optional.of(journal));

        JournalDocumentCollaborationPort port = new JournalDocumentCollaborationPort(
                journalRepository, journalService, new ObjectMapper(), null, null);

        String json = port.enrichChangeSetWithBefore(journalId, """
                {"description":{"after":"새 적요"},"line.1.memo":{"after":"새 라인 메모"}}
                """);

        org.assertj.core.api.Assertions.assertThat(json)
                .contains("\"before\":\"기존 적요\"")
                .contains("\"before\":\"차변 메모\"");
    }

    @Test
    void canProposeRejectsNullAndZeroUuidActor() {
        JournalDocumentCollaborationPort port = new JournalDocumentCollaborationPort(
                org.mockito.Mockito.mock(JournalRepository.class),
                org.mockito.Mockito.mock(JournalService.class),
                new ObjectMapper(), null, null);
        UUID journalId = UUID.randomUUID();

        org.assertj.core.api.Assertions.assertThat(port.canPropose(null, journalId)).isFalse();
        org.assertj.core.api.Assertions.assertThat(port.canPropose(new UUID(0L, 0L), journalId)).isFalse();
        org.assertj.core.api.Assertions.assertThat(port.canDecide(UUID.randomUUID(), journalId)).isTrue();
    }

    @Test
    void resolveNotificationRecipientsCollectsContributorsAndSkipsCurrentEditor() {
        JournalRepository journalRepository = org.mockito.Mockito.mock(JournalRepository.class);
        JournalCollabSuggestionRepository suggestionRepository =
                org.mockito.Mockito.mock(JournalCollabSuggestionRepository.class);
        JournalCollabCommentRepository commentRepository =
                org.mockito.Mockito.mock(JournalCollabCommentRepository.class);
        UUID journalId = UUID.randomUUID();
        UUID editorId = UUID.fromString("20000000-0000-0000-0000-000000000001");
        UUID proposerId = UUID.fromString("20000000-0000-0000-0000-000000000002");
        UUID deciderId = UUID.fromString("20000000-0000-0000-0000-000000000003");
        UUID commentAuthorId = UUID.fromString("20000000-0000-0000-0000-000000000004");
        Journal journal = postedJournal("20990613-3", "알림 적요");
        org.springframework.test.util.ReflectionTestUtils.setField(journal, "createdBy", "created_login");
        org.springframework.test.util.ReflectionTestUtils.setField(journal, "postedBy", editorId.toString());
        org.mockito.Mockito.when(journalRepository.findById(journalId)).thenReturn(Optional.of(journal));
        JournalCollabSuggestion suggestion = JournalCollabSuggestion.create(
                com.samhanair.logis.collab.CollabDocumentType.ACCOUNTING_VOUCHER, journalId,
                proposerId, "제안자", "{\"description\":{\"after\":\"x\"}}", null);
        suggestion.accept(deciderId, "결정자");
        org.mockito.Mockito.when(suggestionRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(
                        com.samhanair.logis.collab.CollabDocumentType.ACCOUNTING_VOUCHER, journalId))
                .thenReturn(List.of(suggestion));
        org.mockito.Mockito.when(commentRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(
                        com.samhanair.logis.collab.CollabDocumentType.ACCOUNTING_VOUCHER, journalId))
                .thenReturn(List.of(JournalCollabComment.create(
                        com.samhanair.logis.collab.CollabDocumentType.ACCOUNTING_VOUCHER, journalId,
                        "description", commentAuthorId, "댓글작성자", "확인", null)));

        JournalDocumentCollaborationPort port = new JournalDocumentCollaborationPort(
                journalRepository, org.mockito.Mockito.mock(JournalService.class), new ObjectMapper(),
                suggestionRepository, commentRepository);

        Set<String> recipients = port.resolveNotificationRecipients(journalId, editorId);

        org.assertj.core.api.Assertions.assertThat(recipients)
                .containsExactlyInAnyOrder(
                        "created_login",
                        proposerId.toString(),
                        deciderId.toString(),
                        commentAuthorId.toString())
                .doesNotContain(editorId.toString());
    }

    private static Journal postedJournal(String journalNo, String description) {
        Journal journal = Journal.create(journalNo, LocalDate.of(2099, 6, 13), description,
                JournalSourceType.MANUAL, null);
        journal.addLine(JournalLine.create(journal, 1, "101000",
                BigDecimal.valueOf(1000), BigDecimal.ZERO, null, "차변 메모"));
        journal.addLine(JournalLine.create(journal, 2, "201000",
                BigDecimal.ZERO, BigDecimal.valueOf(1000), null, "대변 메모"));
        journal.post("posted_login");
        return journal;
    }
}
