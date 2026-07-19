package com.samhanair.logis.groupware.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** 문서 레이아웃 템플릿 생성 요청. 서버 lifecycle/audit 필드는 받지 않는다. */
public record DocumentTemplateCreateRequest(
        @NotBlank @Size(max = 70, message = "문서 유형(docType)은 70자 이하여야 합니다")
                @JsonDeserialize(using = StrictJsonStringDeserializer.class) String docType,
        @NotBlank @Size(max = 100) @JsonDeserialize(using = StrictJsonStringDeserializer.class) String name,
        @NotNull @JsonDeserialize(using = StrictJsonShortDeserializer.class) Short schemaVersion,
        @NotNull JsonNode document
) {
}
