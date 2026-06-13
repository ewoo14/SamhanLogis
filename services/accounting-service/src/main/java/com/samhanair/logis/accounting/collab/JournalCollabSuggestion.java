package com.samhanair.logis.accounting.collab;

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
 * 회계전표 협업 수정 이력.
 *
 * <p>changeSet 저장/상태 전이는 collab-core base 가 소유한다. 본 entity 는 회계전표 도메인 테이블,
 * UUID PK, 제안 동시 결정 방지를 위한 optimistic lock 버전만 제공한다.
 */
@Entity
@Table(name = "journal_collab_suggestions")
@SQLRestriction("is_deleted = false")
public class JournalCollabSuggestion extends CollabSuggestionRecord {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    protected JournalCollabSuggestion() {
    }

    private JournalCollabSuggestion(CollabDocumentType documentType, UUID documentId,
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

    /**
     * 신규 회계전표 수정 이력 factory.
     *
     * @param documentType ACCOUNTING_VOUCHER
     * @param documentId 분개 UUID
     * @param proposerId 수정자 UUID. 화면 노출 금지.
     * @param proposerName 수정자 표시명.
     * @param changeSet path → {before, after} JSON 문자열
     * @param reason 수정 사유
     * @return 영속화 전 신규 제안
     */
    public static JournalCollabSuggestion create(CollabDocumentType documentType, UUID documentId,
                                                 UUID proposerId, String proposerName,
                                                 String changeSet, String reason) {
        return new JournalCollabSuggestion(
                documentType, documentId, proposerId, proposerName, changeSet, reason);
    }
}
