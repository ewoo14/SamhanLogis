package com.samhanair.logis.groupware.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

/**
 * 그룹웨어 문서 레이아웃 템플릿.
 *
 * <p>입력필드 템플릿인 {@link ApprovalTemplate}과 분리된 문서 출력 레이아웃 aggregate이며,
 * 삭제는 물리 삭제가 아닌 {@link #softDelete(String)}로 처리한다.
 */
@Entity
@Getter
@Table(name = "document_templates")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class DocumentTemplate extends BaseEntity {

    private static final int DOC_TYPE_MAX_LENGTH = 40;
    private static final int NAME_MAX_LENGTH = 100;
    public static final short SUPPORTED_SCHEMA_VERSION = 1;

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "doc_type", nullable = false, length = DOC_TYPE_MAX_LENGTH)
    private String docType;

    @Column(name = "name", nullable = false, length = NAME_MAX_LENGTH)
    private String name;

    @Column(name = "revision", nullable = false)
    private int revision;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private DocumentTemplateStatus status;

    @Column(name = "schema_version", nullable = false)
    private short schemaVersion;

    @Version
    @Column(name = "lock_version", nullable = false)
    private Long lockVersion;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "document", columnDefinition = "jsonb", nullable = false)
    private DocumentPayload document;

    private DocumentTemplate(String docType, String name, short schemaVersion, DocumentPayload document) {
        this.docType = validateDocType(docType);
        this.name = validateName(name);
        if (schemaVersion != SUPPORTED_SCHEMA_VERSION) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "지원하지 않는 문서 양식 schemaVersion입니다: " + schemaVersion);
        }
        if (document == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "문서 양식 document는 필수입니다");
        }
        this.schemaVersion = schemaVersion;
        this.document = document;
        this.revision = 1;
        this.status = DocumentTemplateStatus.DRAFT;
        this.lockVersion = 0L;
    }

    /** 신규 문서 양식은 DRAFT revision 1로 생성한다. */
    public static DocumentTemplate create(String docType, String name, short schemaVersion,
                                          DocumentPayload document) {
        return new DocumentTemplate(docType, name, schemaVersion, document);
    }

    /** DRAFT 문서 레이아웃을 교체하고 정보성 revision을 증가시킨다. */
    public DocumentTemplate updateDocument(DocumentPayload document) {
        ensureDraft("DRAFT 문서만 레이아웃을 수정할 수 있습니다.");
        if (document == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "문서 양식 document는 필수입니다");
        }
        this.document = document;
        this.revision++;
        return this;
    }

    /** 문서 양식을 활성화한다. 이미 ACTIVE이면 멱등적으로 유지한다. */
    public DocumentTemplate activate() {
        this.status = DocumentTemplateStatus.ACTIVE;
        return this;
    }

    /** 문서 양식을 비활성화한다. */
    public DocumentTemplate deactivate() {
        this.status = DocumentTemplateStatus.DRAFT;
        return this;
    }

    /** 문서 양식 표시명을 변경한다. */
    public DocumentTemplate rename(String name) {
        ensureDraft("DRAFT 문서만 이름을 변경할 수 있습니다.");
        this.name = validateName(name);
        return this;
    }

    /** 문서 양식을 soft-delete한다. */
    public DocumentTemplate softDelete(String actor) {
        markDeleted(actor == null || actor.isBlank() ? "system" : actor);
        return this;
    }

    private void ensureDraft(String message) {
        if (status != DocumentTemplateStatus.DRAFT) {
            throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, message);
        }
    }

    private static String validateDocType(String value) {
        if (value == null || value.isBlank() || value.trim().length() > DOC_TYPE_MAX_LENGTH) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "문서 양식 docType은 1~40자여야 합니다");
        }
        return value.trim();
    }

    private static String validateName(String value) {
        if (value == null || value.isBlank() || value.trim().length() > NAME_MAX_LENGTH) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "문서 양식 이름은 1~100자여야 합니다");
        }
        return value.trim();
    }
}
