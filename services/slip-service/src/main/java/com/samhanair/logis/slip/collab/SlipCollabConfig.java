package com.samhanair.logis.slip.collab;

import com.samhanair.logis.collab.CollabCommentService;
import com.samhanair.logis.collab.CollabDocumentType;
import com.samhanair.logis.collab.CollabRealtimePublisher;
import com.samhanair.logis.collab.CollabSuggestionService;
import com.samhanair.logis.collab.DocumentCollaborationPort;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.domain.Pageable;

/**
 * 입출고전표 협업 bean 설정.
 *
 * <p>collab-core generic service 를 전표 concrete entity/repository 로 연결한다. 문서 타입이
 * SLIP_OUTBOUND/SLIP_INBOUND 두 개이므로 포트는 documentType 별 bean 으로 분리한다.
 */
@Configuration
public class SlipCollabConfig {

    /** 전표 concrete comment service. */
    @Bean
    public CollabCommentService<SlipCollabComment> slipCollabCommentService(
            SlipCollabCommentRepository repository,
            CollabRealtimePublisher publisher) {
        return new CollabCommentService<>(
                new SlipCommentRepositoryAdapter(repository),
                SlipCollabComment::create,
                publisher);
    }

    /** 전표 concrete suggestion service. */
    @Bean
    public CollabSuggestionService<SlipCollabSuggestion> slipCollabSuggestionService(
            SlipCollabSuggestionRepository repository,
            CollabRealtimePublisher publisher) {
        return new CollabSuggestionService<>(
                new SlipSuggestionRepositoryAdapter(repository),
                SlipCollabSuggestion::create,
                publisher);
    }

    /** 출고전표 협업 포트. */
    @Bean(name = "slipOutboundCollaborationPort")
    @Qualifier("slipOutboundCollaborationPort")
    public DocumentCollaborationPort slipOutboundCollaborationPort(
            SlipDocumentCollaborationPort.Factory factory) {
        return factory.create(CollabDocumentType.SLIP_OUTBOUND);
    }

    /** 입고전표 협업 포트. */
    @Bean(name = "slipInboundCollaborationPort")
    @Qualifier("slipInboundCollaborationPort")
    public DocumentCollaborationPort slipInboundCollaborationPort(
            SlipDocumentCollaborationPort.Factory factory) {
        return factory.create(CollabDocumentType.SLIP_INBOUND);
    }

    private record SlipCommentRepositoryAdapter(SlipCollabCommentRepository repository)
            implements CollabCommentService.CommentRepository<SlipCollabComment> {

        @Override
        public SlipCollabComment save(SlipCollabComment comment) {
            return repository.save(comment);
        }

        @Override
        public Optional<SlipCollabComment> findByIdAndDocumentTypeAndDocumentId(
                UUID commentId, CollabDocumentType documentType, UUID documentId) {
            return repository.findByIdAndDocumentTypeAndDocumentId(
                    commentId, documentType, documentId);
        }

        @Override
        public List<SlipCollabComment> findRecent(CollabDocumentType documentType,
                                                  UUID documentId,
                                                  Pageable pageable) {
            return repository.findRecent(documentType, documentId, pageable);
        }
    }

    private record SlipSuggestionRepositoryAdapter(SlipCollabSuggestionRepository repository)
            implements CollabSuggestionService.SuggestionRepository<SlipCollabSuggestion> {

        @Override
        public SlipCollabSuggestion save(SlipCollabSuggestion suggestion) {
            return repository.save(suggestion);
        }

        @Override
        public Optional<SlipCollabSuggestion> findById(UUID suggestionId) {
            return repository.findById(suggestionId);
        }
    }
}
