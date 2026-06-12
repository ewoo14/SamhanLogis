package com.samhanair.logis.collab;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.transaction.annotation.Transactional;

/**
 * 문서 댓글 generic service.
 *
 * <p>소비 service 는 concrete comment entity/repository 와 {@link CommentFactory} 를 주입해
 * typed bean 을 등록한다. collab-core 는 문서별 최근 조회, 상태 전이, SSE publish 흐름만 제공한다.
 */
public class CollabCommentService<T extends CollabCommentRecord> {

    private static final Logger log = LoggerFactory.getLogger(CollabCommentService.class);

    /** 최근 백필 기본 limit. */
    public static final int DEFAULT_RECENT_LIMIT = 20;

    /** 최근 백필 최대 limit. */
    public static final int MAX_RECENT_LIMIT = 100;

    /** SSE event name — 신규 댓글. */
    public static final String EVENT_COMMENT_CREATED = "comment.created";

    /** SSE event name — 댓글 해결. */
    public static final String EVENT_COMMENT_RESOLVED = "comment.resolved";

    /** SSE event name — 댓글 soft-delete. */
    public static final String EVENT_COMMENT_DELETED = "comment.deleted";

    private final CommentRepository<T> repository;
    private final CommentFactory<T> factory;
    private final CollabRealtimePublisher publisher;

    public CollabCommentService(CommentRepository<T> repository,
                                CommentFactory<T> factory,
                                CollabRealtimePublisher publisher) {
        this.repository = repository;
        this.factory = factory;
        this.publisher = publisher;
    }

    /** 신규 댓글 등록 + 문서 채널 publish. */
    @Transactional
    public T add(CollabDocumentType documentType, UUID documentId, String anchor,
                 UUID authorId, String authorName, String body, UUID parentId) {
        if (parentId != null) {
            find(documentType, documentId, parentId, "부모 댓글을 찾을 수 없습니다: ");
        }
        T saved = repository.save(factory.create(
                documentType, documentId, anchor, authorId, authorName, body, parentId));
        publisher.publish(documentId, EVENT_COMMENT_CREATED, payload(saved));
        return saved;
    }

    /** 최근 N건 백필. */
    @Transactional(readOnly = true)
    public List<T> listRecent(CollabDocumentType documentType, UUID documentId, int limit) {
        int safeLimit = Math.max(1, Math.min(limit, MAX_RECENT_LIMIT));
        return repository.findRecent(documentType, documentId, PageRequest.of(0, safeLimit));
    }

    /** 댓글 해결 + 문서 채널 publish. */
    @Transactional
    public T resolve(CollabDocumentType documentType, UUID documentId, UUID commentId) {
        T comment = find(documentType, documentId, commentId, "댓글을 찾을 수 없습니다: ");
        if (comment.getStatus() == CollabCommentStatus.RESOLVED) {
            return comment;
        }
        comment.resolve();
        T saved = repository.save(comment);
        publisher.publish(saved.getDocumentId(), EVENT_COMMENT_RESOLVED, payload(saved));
        return saved;
    }

    /** 댓글 soft-delete + 문서 채널 publish. */
    @Transactional
    public void softDelete(CollabDocumentType documentType, UUID documentId,
                           UUID commentId, String deleterUserId) {
        T comment = find(documentType, documentId, commentId, "댓글을 찾을 수 없습니다: ");
        comment.softDelete(deleterUserId);
        repository.save(comment);
        publisher.publish(comment.getDocumentId(), EVENT_COMMENT_DELETED, deletedPayload(comment));
    }

    private T find(CollabDocumentType documentType, UUID documentId,
                   UUID commentId, String messagePrefix) {
        return repository.findByIdAndDocumentTypeAndDocumentId(commentId, documentType, documentId)
                .orElseThrow(() -> {
                    log.warn("[CollabCommentService] 댓글 미존재 — documentType={} documentId={} commentId={}",
                            documentType, documentId, commentId);
                    return new BusinessException(ErrorCode.NOT_FOUND, genericNotFoundMessage(messagePrefix));
                });
    }

    private static String genericNotFoundMessage(String messagePrefix) {
        if (messagePrefix != null && messagePrefix.startsWith("부모 댓글")) {
            return "부모 댓글을 찾을 수 없습니다";
        }
        return "댓글을 찾을 수 없습니다";
    }

    private Map<String, Object> payload(T comment) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", comment.getId().toString());
        payload.put("documentType", comment.getDocumentType().name());
        payload.put("documentId", comment.getDocumentId().toString());
        putIfNotNull(payload, "anchor", comment.getAnchor());
        payload.put("authorName", comment.getAuthorName());
        payload.put("body", comment.getBody());
        putIfNotNull(payload, "parentId", comment.getParentId() == null
                ? null : comment.getParentId().toString());
        payload.put("status", comment.getStatus().name());
        putIfNotNull(payload, "createdAt", comment.getCreatedAt() == null
                ? null : comment.getCreatedAt().toString());
        return payload;
    }

    private Map<String, Object> deletedPayload(T comment) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", comment.getId().toString());
        payload.put("documentId", comment.getDocumentId().toString());
        return payload;
    }

    private void putIfNotNull(Map<String, Object> payload, String key, Object value) {
        if (value != null) {
            payload.put(key, value);
        }
    }

    /** 소비 service 의 concrete repository adapter. */
    public interface CommentRepository<T extends CollabCommentRecord> {
        T save(T comment);

        Optional<T> findByIdAndDocumentTypeAndDocumentId(
                UUID commentId, CollabDocumentType documentType, UUID documentId);

        List<T> findRecent(CollabDocumentType documentType, UUID documentId, Pageable pageable);
    }

    /** 소비 service concrete entity 생성 adapter. */
    @FunctionalInterface
    public interface CommentFactory<T extends CollabCommentRecord> {
        T create(CollabDocumentType documentType, UUID documentId, String anchor,
                 UUID authorId, String authorName, String body, UUID parentId);
    }
}
