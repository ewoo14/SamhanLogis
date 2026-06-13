package com.samhanair.logis.slip.estimate.collab;

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
 * 견적 협업 bean 설정.
 *
 * <p>collab-core generic service 를 견적 concrete entity/repository 로 연결한다. 문서 타입은
 * ESTIMATE 단일 타입이며 권한은 {@code estimates.list} page-code 가 담당한다.
 */
@Configuration
public class EstimateCollabConfig {

    /** 견적 concrete comment service. */
    @Bean
    public CollabCommentService<EstimateCollabComment> estimateCollabCommentService(
            EstimateCollabCommentRepository repository,
            CollabRealtimePublisher publisher) {
        return new CollabCommentService<>(
                new EstimateCommentRepositoryAdapter(repository),
                EstimateCollabComment::create,
                publisher);
    }

    /** 견적 concrete suggestion service. */
    @Bean
    public CollabSuggestionService<EstimateCollabSuggestion> estimateCollabSuggestionService(
            EstimateCollabSuggestionRepository repository,
            CollabRealtimePublisher publisher) {
        return new CollabSuggestionService<>(
                new EstimateSuggestionRepositoryAdapter(repository),
                EstimateCollabSuggestion::create,
                publisher);
    }

    private record EstimateCommentRepositoryAdapter(EstimateCollabCommentRepository repository)
            implements CollabCommentService.CommentRepository<EstimateCollabComment> {

        @Override
        public EstimateCollabComment save(EstimateCollabComment comment) {
            return repository.save(comment);
        }

        @Override
        public Optional<EstimateCollabComment> findByIdAndDocumentTypeAndDocumentId(
                UUID commentId, CollabDocumentType documentType, UUID documentId) {
            return repository.findByIdAndDocumentTypeAndDocumentId(
                    commentId, documentType, documentId);
        }

        @Override
        public List<EstimateCollabComment> findRecent(CollabDocumentType documentType,
                                                      UUID documentId,
                                                      Pageable pageable) {
            return repository.findRecent(documentType, documentId, pageable);
        }
    }

    private record EstimateSuggestionRepositoryAdapter(EstimateCollabSuggestionRepository repository)
            implements CollabSuggestionService.SuggestionRepository<EstimateCollabSuggestion> {

        @Override
        public EstimateCollabSuggestion save(EstimateCollabSuggestion suggestion) {
            return repository.save(suggestion);
        }

        @Override
        public Optional<EstimateCollabSuggestion> findById(UUID suggestionId) {
            return repository.findById(suggestionId);
        }
    }
}
