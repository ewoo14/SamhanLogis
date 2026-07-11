package com.samhanair.logis.collab;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;
import org.springframework.transaction.annotation.Transactional;

/**
 * 변경 제안 generic service.
 *
 * <p>권한과 실제 도메인 mutation 은 {@link DocumentCollaborationPort} 로 위임한다. accept 는 제안을
 * 수락하고 changeSet 을 적용한 뒤 accepted record 를 반환하므로 호출측이 revision capture 를 이어갈 수 있다.
 *
 * <p><b>동시성 계약:</b> 소비 suggestion {@code @Entity} 는 {@code @Version} 필드를 반드시 선언해야 한다.
 * 같은 제안에 대한 동시 accept/reject lost-update 방지는 소비 service 의 concrete entity optimistic
 * locking 계약으로 보장한다.
 */
public class CollabSuggestionService<T extends CollabSuggestionRecord> {

    public static final String EVENT_SUGGESTION_PROPOSED = "suggestion.proposed";
    public static final String EVENT_SUGGESTION_ACCEPTED = "suggestion.accepted";
    public static final String EVENT_SUGGESTION_REJECTED = "suggestion.rejected";
    public static final String EVENT_SUGGESTION_WITHDRAWN = "suggestion.withdrawn";

    private final SuggestionRepository<T> repository;
    private final SuggestionFactory<T> factory;
    private final CollabRealtimePublisher publisher;

    public CollabSuggestionService(SuggestionRepository<T> repository,
                                   SuggestionFactory<T> factory,
                                   CollabRealtimePublisher publisher) {
        this.repository = repository;
        this.factory = factory;
        this.publisher = publisher;
    }

    /** 변경 제안 등록 + 문서 채널 publish. */
    @Transactional
    public T propose(DocumentCollaborationPort port, UUID documentId,
                     UUID proposerId, String proposerName, String changeSetJson, String reason) {
        if (!port.canPropose(proposerId, documentId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "문서 변경 제안 권한이 없습니다: " + documentId);
        }
        T saved = repository.save(factory.create(
                port.documentType(), documentId, proposerId, proposerName, changeSetJson, reason));
        publisher.publish(documentId, EVENT_SUGGESTION_PROPOSED, payload(saved));
        return saved;
    }

    /**
     * 제안 수락 + 도메인 changeSet 적용 + 문서 채널 publish.
     *
     * <p>본 overload 는 revision 을 자동 생성하지 않는다. 호출측은 수락 성공 이후
     * {@code SUGGESTION_ACCEPTED} revision capture 를 반드시 연결해야 한다.
     */
    @Transactional
    public T accept(UUID suggestionId, DocumentCollaborationPort port,
                    UUID deciderId, String deciderName) {
        return accept(suggestionId, port, deciderId, deciderName, accepted -> { });
    }

    /** 제안 수락 후 revision capture 등 후속 작업을 callback 으로 연결한다. */
    @Transactional
    public T accept(UUID suggestionId, DocumentCollaborationPort port,
                    UUID deciderId, String deciderName, Consumer<T> acceptedCallback) {
        T suggestion = find(suggestionId);
        requireSameDocumentType(suggestion, port);
        requireProposed(suggestion);
        if (!port.canDecide(deciderId, suggestion.getDocumentId())) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "문서 변경 제안 결정 권한이 없습니다: " + suggestion.getDocumentId());
        }
        port.applyChangeSet(suggestion.getDocumentId(), suggestion.getChangeSet());
        suggestion.accept(deciderId, deciderName);
        T saved = repository.save(suggestion);
        acceptedCallback.accept(saved);
        publisher.publish(saved.getDocumentId(), EVENT_SUGGESTION_ACCEPTED, payload(saved));
        return saved;
    }

    /** 제안 거절 + 문서 채널 publish. */
    @Transactional
    public T reject(UUID suggestionId, DocumentCollaborationPort port,
                    UUID deciderId, String deciderName, String reason) {
        T suggestion = find(suggestionId);
        requireSameDocumentType(suggestion, port);
        requireProposed(suggestion);
        if (!port.canDecide(deciderId, suggestion.getDocumentId())) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "문서 변경 제안 결정 권한이 없습니다: " + suggestion.getDocumentId());
        }
        suggestion.reject(deciderId, deciderName, reason);
        T saved = repository.save(suggestion);
        publisher.publish(saved.getDocumentId(), EVENT_SUGGESTION_REJECTED, payload(saved));
        return saved;
    }

    /** 제안 철회 + 문서 채널 publish. */
    @Transactional
    public T withdraw(UUID suggestionId, UUID requesterId) {
        T suggestion = find(suggestionId);
        if (!suggestion.getProposerId().equals(requesterId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "제안자만 철회할 수 있습니다: " + suggestionId);
        }
        suggestion.withdraw();
        T saved = repository.save(suggestion);
        publisher.publish(saved.getDocumentId(), EVENT_SUGGESTION_WITHDRAWN, payload(saved));
        return saved;
    }

    private T find(UUID suggestionId) {
        return repository.findById(suggestionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "제안을 찾을 수 없습니다: " + suggestionId));
    }

    private void requireSameDocumentType(T suggestion, DocumentCollaborationPort port) {
        if (suggestion.getDocumentType() != port.documentType()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "제안 문서 유형과 포트 유형이 다릅니다: " + suggestion.getDocumentType()
                            + " / " + port.documentType());
        }
    }

    private void requireProposed(T suggestion) {
        if (suggestion.getStatus() != CollabSuggestionStatus.PROPOSED) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 종결된 제안입니다: " + suggestion.getStatus().getDisplayName());
        }
    }

    private Map<String, Object> payload(T suggestion) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", suggestion.getId().toString());
        payload.put("documentType", suggestion.getDocumentType().name());
        payload.put("documentId", suggestion.getDocumentId().toString());
        payload.put("proposerName", suggestion.getProposerName());
        payload.put("status", suggestion.getStatus().name());
        putIfNotNull(payload, "reason", suggestion.getReason());
        putIfNotNull(payload, "decidedByName", suggestion.getDecidedByName());
        putIfNotNull(payload, "decidedAt", suggestion.getDecidedAt() == null
                ? null : suggestion.getDecidedAt().toString());
        return payload;
    }

    private void putIfNotNull(Map<String, Object> payload, String key, Object value) {
        if (value != null) {
            payload.put(key, value);
        }
    }

    /** 소비 service 의 concrete repository adapter. */
    public interface SuggestionRepository<T extends CollabSuggestionRecord> {
        T save(T suggestion);

        Optional<T> findById(UUID suggestionId);
    }

    /** 소비 service concrete entity 생성 adapter. */
    @FunctionalInterface
    public interface SuggestionFactory<T extends CollabSuggestionRecord> {
        T create(CollabDocumentType documentType, UUID documentId,
                 UUID proposerId, String proposerName, String changeSetJson, String reason);
    }
}
