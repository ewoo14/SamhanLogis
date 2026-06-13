package com.samhanair.logis.accounting.collab;

import com.samhanair.logis.collab.CollabCommentService;
import com.samhanair.logis.collab.CollabDocumentType;
import com.samhanair.logis.collab.CollabRealtimePublisher;
import com.samhanair.logis.collab.CollabSuggestionService;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.domain.Pageable;

/**
 * 회계전표 협업 bean 설정.
 *
 * <p>collab-core generic service 를 회계전표 concrete entity/repository 로 연결한다. 문서 타입은
 * ACCOUNTING_VOUCHER 단일 타입이며, 권한은 컨트롤러의 {@code accounting.journals} page-code 가 담당한다.
 */
@Configuration
public class JournalCollabConfig {

    /** 회계전표 concrete comment service. */
    @Bean
    public CollabCommentService<JournalCollabComment> journalCollabCommentService(
            JournalCollabCommentRepository repository,
            CollabRealtimePublisher publisher) {
        return new CollabCommentService<>(
                new JournalCommentRepositoryAdapter(repository),
                JournalCollabComment::create,
                publisher);
    }

    /** 회계전표 concrete suggestion service. */
    @Bean
    public CollabSuggestionService<JournalCollabSuggestion> journalCollabSuggestionService(
            JournalCollabSuggestionRepository repository,
            CollabRealtimePublisher publisher) {
        return new CollabSuggestionService<>(
                new JournalSuggestionRepositoryAdapter(repository),
                JournalCollabSuggestion::create,
                publisher);
    }

    private record JournalCommentRepositoryAdapter(JournalCollabCommentRepository repository)
            implements CollabCommentService.CommentRepository<JournalCollabComment> {

        @Override
        public JournalCollabComment save(JournalCollabComment comment) {
            return repository.save(comment);
        }

        @Override
        public Optional<JournalCollabComment> findByIdAndDocumentTypeAndDocumentId(
                UUID commentId, CollabDocumentType documentType, UUID documentId) {
            return repository.findByIdAndDocumentTypeAndDocumentId(
                    commentId, documentType, documentId);
        }

        @Override
        public List<JournalCollabComment> findRecent(CollabDocumentType documentType,
                                                     UUID documentId,
                                                     Pageable pageable) {
            return repository.findRecent(documentType, documentId, pageable);
        }
    }

    private record JournalSuggestionRepositoryAdapter(JournalCollabSuggestionRepository repository)
            implements CollabSuggestionService.SuggestionRepository<JournalCollabSuggestion> {

        @Override
        public JournalCollabSuggestion save(JournalCollabSuggestion suggestion) {
            return repository.save(suggestion);
        }

        @Override
        public Optional<JournalCollabSuggestion> findById(UUID suggestionId) {
            return repository.findById(suggestionId);
        }
    }
}
