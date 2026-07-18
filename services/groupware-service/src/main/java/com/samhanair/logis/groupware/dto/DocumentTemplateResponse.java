package com.samhanair.logis.groupware.dto;

import com.samhanair.logis.groupware.domain.DocumentPayload;
import com.samhanair.logis.groupware.domain.DocumentTemplate;
import com.samhanair.logis.groupware.domain.DocumentTemplateStatus;
import java.util.UUID;

/** 문서 레이아웃 응답. lock_version과 audit 필드는 의도적으로 노출하지 않는다. */
public record DocumentTemplateResponse(
        UUID id,
        DocumentTemplateStatus status,
        int revision,
        String docType,
        String name,
        short schemaVersion,
        DocumentPayload document
) {

    /** 엔티티 컬럼과 JSONB payload를 TemplateEnvelope 응답으로 조립한다. */
    public static DocumentTemplateResponse from(DocumentTemplate template) {
        return new DocumentTemplateResponse(template.getId(), template.getStatus(), template.getRevision(),
                template.getDocType(), template.getName(), template.getSchemaVersion(), template.getDocument());
    }
}
