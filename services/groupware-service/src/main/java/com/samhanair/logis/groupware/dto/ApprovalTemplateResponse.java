package com.samhanair.logis.groupware.dto;

import com.samhanair.logis.groupware.domain.ApprovalFieldType;
import com.samhanair.logis.groupware.domain.ApprovalTemplate;
import com.samhanair.logis.groupware.domain.ApprovalTemplateField;
import java.util.List;
import java.util.UUID;

/**
 * 결재유형 템플릿 응답.
 *
 * @param id 템플릿 UUID
 * @param code 템플릿 코드
 * @param name 이름
 * @param description 설명
 * @param active 활성 여부
 * @param displayOrder 정렬 순서
 * @param fields 필드 목록
 */
public record ApprovalTemplateResponse(
        UUID id,
        String code,
        String name,
        String description,
        boolean active,
        int displayOrder,
        List<Field> fields
) {

    /** 결재유형 템플릿 필드 응답. */
    public record Field(
            UUID id,
            String fieldKey,
            String label,
            ApprovalFieldType fieldType,
            boolean required,
            int displayOrder,
            String optionsJson,
            String placeholder
    ) {
        static Field from(ApprovalTemplateField field) {
            return new Field(field.getId(), field.getFieldKey(), field.getLabel(), field.getFieldType(),
                    field.isRequired(), field.getDisplayOrder(), field.getOptionsJson(), field.getPlaceholder());
        }
    }

    /** entity + fields 로 응답 DTO 를 만든다. */
    public static ApprovalTemplateResponse from(ApprovalTemplate template, List<ApprovalTemplateField> fields) {
        return new ApprovalTemplateResponse(template.getId(), template.getCode(), template.getName(),
                template.getDescription(), template.isActive(), template.getDisplayOrder(),
                fields.stream().map(Field::from).toList());
    }
}
