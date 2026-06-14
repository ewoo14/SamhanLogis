package com.samhanair.logis.groupware.dto;

import com.samhanair.logis.groupware.domain.ApprovalFieldType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 결재유형 템플릿 생성/수정 요청.
 *
 * @param code 템플릿 코드
 * @param name 템플릿 이름
 * @param description 설명
 * @param active 활성 여부
 * @param displayOrder 정렬 순서
 * @param fields 필드 replace-set
 */
public record ApprovalTemplateRequest(
        @NotBlank @Size(max = 60) String code,
        @NotBlank @Size(max = 100) String name,
        @Size(max = 500) String description,
        boolean active,
        int displayOrder,
        List<@Valid Field> fields
) {

    /** 결재유형 템플릿 필드 요청. */
    public record Field(
            @NotBlank @Size(max = 80) String fieldKey,
            @NotBlank @Size(max = 100) String label,
            @NotNull ApprovalFieldType fieldType,
            boolean required,
            int displayOrder,
            @Size(max = 1000) String optionsJson,
            @Size(max = 200) String placeholder
    ) {
    }
}
