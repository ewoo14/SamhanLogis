package com.samhanair.logis.partnerorder.collab;

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
 * 주문 협업 bean 설정.
 *
 * <p>collab-core generic service 를 주문 concrete entity/repository 로 연결한다. 문서 타입은
 * PARTNER_ORDER 단일 타입이며, 권한은 컨트롤러의 기존 {@code sales.partner-order.*} page-code 가
 * 담당한다.
 */
@Configuration
public class PartnerOrderCollabConfig {

    /** 주문 concrete comment service. */
    @Bean
    public CollabCommentService<PartnerOrderCollabComment> partnerOrderCollabCommentService(
            PartnerOrderCollabCommentRepository repository,
            CollabRealtimePublisher publisher) {
        return new CollabCommentService<>(
                new PartnerOrderCommentRepositoryAdapter(repository),
                PartnerOrderCollabComment::create,
                publisher);
    }

    /** 주문 concrete suggestion service. */
    @Bean
    public CollabSuggestionService<PartnerOrderCollabSuggestion> partnerOrderCollabSuggestionService(
            PartnerOrderCollabSuggestionRepository repository,
            CollabRealtimePublisher publisher) {
        return new CollabSuggestionService<>(
                new PartnerOrderSuggestionRepositoryAdapter(repository),
                PartnerOrderCollabSuggestion::create,
                publisher);
    }

    private record PartnerOrderCommentRepositoryAdapter(PartnerOrderCollabCommentRepository repository)
            implements CollabCommentService.CommentRepository<PartnerOrderCollabComment> {

        @Override
        public PartnerOrderCollabComment save(PartnerOrderCollabComment comment) {
            return repository.save(comment);
        }

        @Override
        public Optional<PartnerOrderCollabComment> findByIdAndDocumentTypeAndDocumentId(
                UUID commentId, CollabDocumentType documentType, UUID documentId) {
            return repository.findByIdAndDocumentTypeAndDocumentId(
                    commentId, documentType, documentId);
        }

        @Override
        public List<PartnerOrderCollabComment> findRecent(CollabDocumentType documentType,
                                                          UUID documentId,
                                                          Pageable pageable) {
            return repository.findRecent(documentType, documentId, pageable);
        }
    }

    private record PartnerOrderSuggestionRepositoryAdapter(PartnerOrderCollabSuggestionRepository repository)
            implements CollabSuggestionService.SuggestionRepository<PartnerOrderCollabSuggestion> {

        @Override
        public PartnerOrderCollabSuggestion save(PartnerOrderCollabSuggestion suggestion) {
            return repository.save(suggestion);
        }

        @Override
        public Optional<PartnerOrderCollabSuggestion> findById(UUID suggestionId) {
            return repository.findById(suggestionId);
        }
    }
}
