package com.samhanair.logis.groupware.collab;

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
 * 그룹웨어 결재 협업 bean 설정.
 *
 * <p>collab-core generic service 를 결재 concrete entity/repository 로 연결한다. 문서 타입은
 * APPROVAL_LINE 단일 타입이며 권한은 {@code groupware.approvals} page-code 가 담당한다.
 */
@Configuration
public class GroupwareApprovalCollabConfig {

    /** 결재 concrete comment service. */
    @Bean(name = "groupwareApprovalCollabCommentService")
    public CollabCommentService<ApprovalCollabComment> groupwareApprovalCollabCommentService(
            ApprovalCollabCommentRepository repository,
            CollabRealtimePublisher publisher) {
        return new CollabCommentService<>(
                new ApprovalCommentRepositoryAdapter(repository),
                ApprovalCollabComment::create,
                publisher);
    }

    /** 결재 concrete suggestion service. */
    @Bean(name = "groupwareApprovalCollabSuggestionService")
    public CollabSuggestionService<ApprovalCollabSuggestion> groupwareApprovalCollabSuggestionService(
            ApprovalCollabSuggestionRepository repository,
            CollabRealtimePublisher publisher) {
        return new CollabSuggestionService<>(
                new ApprovalSuggestionRepositoryAdapter(repository),
                ApprovalCollabSuggestion::create,
                publisher);
    }

    private record ApprovalCommentRepositoryAdapter(ApprovalCollabCommentRepository repository)
            implements CollabCommentService.CommentRepository<ApprovalCollabComment> {

        @Override
        public ApprovalCollabComment save(ApprovalCollabComment comment) {
            return repository.save(comment);
        }

        @Override
        public Optional<ApprovalCollabComment> findByIdAndDocumentTypeAndDocumentId(
                UUID commentId, CollabDocumentType documentType, UUID documentId) {
            return repository.findByIdAndDocumentTypeAndDocumentId(
                    commentId, documentType, documentId);
        }

        @Override
        public List<ApprovalCollabComment> findRecent(CollabDocumentType documentType,
                                                      UUID documentId,
                                                      Pageable pageable) {
            return repository.findRecent(documentType, documentId, pageable);
        }
    }

    private record ApprovalSuggestionRepositoryAdapter(ApprovalCollabSuggestionRepository repository)
            implements CollabSuggestionService.SuggestionRepository<ApprovalCollabSuggestion> {

        @Override
        public ApprovalCollabSuggestion save(ApprovalCollabSuggestion suggestion) {
            return repository.save(suggestion);
        }

        @Override
        public Optional<ApprovalCollabSuggestion> findById(UUID suggestionId) {
            return repository.findById(suggestionId);
        }
    }
}
