package com.samhanair.logis.groupware.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

/**
 * 문서 레이아웃 revision 이력.
 *
 * <p>이 entity에는 수정·삭제 행위가 없고, DB trigger가 UPDATE/DELETE도 차단한다. 승인 완료 문서는
 * {@code templateId + revision}만 결재선에 각인하고 본문은 이 이력에서 조회한다.
 */
@Entity
@Getter
@Table(name = "document_template_revisions")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class DocumentTemplateRevision extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "template_id", nullable = false, updatable = false)
    private UUID templateId;

    @Column(name = "revision", nullable = false, updatable = false)
    private int revision;

    @Column(name = "schema_version", nullable = false, updatable = false)
    private short schemaVersion;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "document", columnDefinition = "jsonb", nullable = false, updatable = false)
    private DocumentPayload document;

    private DocumentTemplateRevision(UUID templateId, int revision, short schemaVersion,
                                    DocumentPayload document) {
        if (templateId == null || revision <= 0 || document == null) {
            throw new IllegalArgumentException("문서 양식 revision 필수값이 유효하지 않습니다");
        }
        this.templateId = templateId;
        this.revision = revision;
        this.schemaVersion = schemaVersion;
        this.document = document;
    }

    /** 현재 문서 양식 상태를 append-only 이력 한 건으로 만든다. */
    public static DocumentTemplateRevision of(DocumentTemplate template) {
        return new DocumentTemplateRevision(template.getId(), template.getRevision(),
                template.getSchemaVersion(), template.getDocument());
    }
}
