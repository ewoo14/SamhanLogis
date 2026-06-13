package com.samhanair.logis.groupware.collab;

import com.samhanair.logis.collab.CollabDocumentType;
import com.samhanair.logis.collab.CollabSuggestionRecord;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.util.UUID;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 결재 협업 수정 이력.
 *
 * <p>changeSet 저장/상태 전이는 collab-core base 가 소유한다. 본 entity 는 결재 도메인 테이블,
 * UUID PK, 수정완료 동시 결정 방지를 위한 optimistic lock 버전만 제공한다.
 */
@Entity
@Table(name = "approval_collab_suggestions")
@SQLRestriction("is_deleted = false")
public class ApprovalCollabSuggestion extends CollabSuggestionRecord {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    protected ApprovalCollabSuggestion() {
    }

    private ApprovalCollabSuggestion(CollabDocumentType documentType, UUID documentId,
                                     UUID proposerId, String proposerName, String changeSet,
                                     String reason) {
        init(documentType, documentId, proposerId, proposerName, changeSet, reason);
    }

    @Override
    public UUID getId() {
        return id;
    }

    public Long getVersion() {
        return version;
    }

    /** 신규 결재 수정 이력 factory. */
    public static ApprovalCollabSuggestion create(CollabDocumentType documentType, UUID documentId,
                                                  UUID proposerId, String proposerName,
                                                  String changeSet, String reason) {
        return new ApprovalCollabSuggestion(
                documentType, documentId, proposerId, proposerName, changeSet, reason);
    }
}
