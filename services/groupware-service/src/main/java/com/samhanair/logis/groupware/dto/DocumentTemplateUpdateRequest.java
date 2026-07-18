package com.samhanair.logis.groupware.dto;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** DRAFT 문서 레이아웃 템플릿 교체/rename 요청. 서버 lifecycle/audit 필드는 받지 않는다. */
public record DocumentTemplateUpdateRequest(
        @NotBlank @Size(max = 40) String docType,
        @NotBlank @Size(max = 100) String name,
        @NotNull Short schemaVersion,
        @NotNull JsonNode document
) {
}
