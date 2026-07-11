package com.samhanair.logis.collab;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.persistence.Column;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.MappedSuperclass;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * 문서 변경 제안 공통 base.
 *
 * <p>changeSet 은 path → {before, after} 형태의 JSON 문자열로 저장한다. 공유 module 은 JSON 구조를
 * 해석하지 않고 소비 service 의 {@link DocumentCollaborationPort#applyChangeSet} 로 전달한다.
 */
@Getter
@MappedSuperclass
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public abstract class CollabSuggestionRecord extends BaseEntity {

    /** 하위 entity 의 UUID PK. */
    public abstract UUID getId();

    /** 제안/결정 사유 최대 길이. */
    public static final int MAX_REASON_LENGTH = 500;

    @Enumerated(EnumType.STRING)
    @Column(name = "document_type", nullable = false, length = 40)
    private CollabDocumentType documentType;

    @Column(name = "document_id", nullable = false)
    private UUID documentId;

    @Column(name = "proposer_id", nullable = false)
    private UUID proposerId;

    @Column(name = "proposer_name", nullable = false, length = 50)
    private String proposerName;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "change_set", nullable = false, columnDefinition = "jsonb")
    private String changeSet;

    @Column(name = "reason", length = MAX_REASON_LENGTH)
    private String reason;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private CollabSuggestionStatus status = CollabSuggestionStatus.PROPOSED;

    @Column(name = "decided_by_id")
    private UUID decidedById;

    @Column(name = "decided_by_name", length = 50)
    private String decidedByName;

    @Column(name = "decided_at")
    private Instant decidedAt;

    /** 하위 entity factory 가 호출하는 공통 초기화. */
    protected void init(CollabDocumentType documentType, UUID documentId,
                        UUID proposerId, String proposerName, String changeSet, String reason) {
        if (documentType == null) {
            throw new IllegalArgumentException("documentType 은 필수입니다");
        }
        if (documentId == null) {
            throw new IllegalArgumentException("documentId 는 필수입니다");
        }
        if (proposerId == null) {
            throw new IllegalArgumentException("proposerId 는 필수입니다");
        }
        if (proposerName == null || proposerName.isBlank()) {
            throw new IllegalArgumentException("proposerName 은 필수입니다");
        }
        if (changeSet == null || changeSet.isBlank()) {
            throw new IllegalArgumentException("changeSet 은 필수입니다");
        }
        validateReason(reason);
        this.documentType = documentType;
        this.documentId = documentId;
        this.proposerId = proposerId;
        this.proposerName = proposerName;
        this.changeSet = changeSet;
        this.reason = reason;
        this.status = CollabSuggestionStatus.PROPOSED;
    }

    /** 제안 수락 (PROPOSED → ACCEPTED). */
    public void accept(UUID deciderId, String deciderName) {
        requireProposed();
        requireDecider(deciderId, deciderName);
        this.status = CollabSuggestionStatus.ACCEPTED;
        this.decidedById = deciderId;
        this.decidedByName = deciderName;
        this.decidedAt = Instant.now();
    }

    /** 제안 거절 (PROPOSED → REJECTED). reason 은 거절 사유로 보존한다. */
    public void reject(UUID deciderId, String deciderName, String reason) {
        requireProposed();
        requireDecider(deciderId, deciderName);
        validateReason(reason);
        this.status = CollabSuggestionStatus.REJECTED;
        this.decidedById = deciderId;
        this.decidedByName = deciderName;
        this.decidedAt = Instant.now();
        this.reason = reason;
    }

    /** 제안자 철회 (PROPOSED → WITHDRAWN). */
    public void withdraw() {
        requireProposed();
        this.status = CollabSuggestionStatus.WITHDRAWN;
        this.decidedAt = Instant.now();
    }

    private void requireProposed() {
        if (this.status != CollabSuggestionStatus.PROPOSED) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 종결된 제안입니다: " + this.status.getDisplayName());
        }
    }

    private void requireDecider(UUID deciderId, String deciderName) {
        if (deciderId == null) {
            throw new IllegalArgumentException("deciderId 는 필수입니다");
        }
        if (deciderName == null || deciderName.isBlank()) {
            throw new IllegalArgumentException("deciderName 은 필수입니다");
        }
    }

    private void validateReason(String reason) {
        if (reason != null && reason.length() > MAX_REASON_LENGTH) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "reason 은 최대 " + MAX_REASON_LENGTH + "자입니다");
        }
    }
}
