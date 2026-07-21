package com.samhanair.logis.groupware.dto;

import com.samhanair.logis.groupware.domain.DocumentPayload;
import com.samhanair.logis.groupware.domain.DocumentTemplateRevision;
import java.util.UUID;

/** 재인쇄 전용 문서 레이아웃 revision 응답. templateId는 API 연동용이며 화면에 표시하지 않는다. */
public record DocumentTemplateRevisionResponse(
        UUID templateId,
        int revision,
        short schemaVersion,
        DocumentPayload document
) {

    public static DocumentTemplateRevisionResponse from(DocumentTemplateRevision revision) {
        return new DocumentTemplateRevisionResponse(revision.getTemplateId(), revision.getRevision(),
                revision.getSchemaVersion(), revision.getDocument());
    }
}
