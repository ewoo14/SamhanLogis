package com.samhanair.logis.groupware.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 결재유형 템플릿 필드.
 *
 * <p>template 내부에서 {@link #fieldKey} 가 고유하며, SELECT 타입은 {@link #optionsJson}
 * JSON 배열 문자열로 선택지를 보관한다.
 */
@Entity
@Getter
@Table(name = "approval_template_fields")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class ApprovalTemplateField extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 소속 결재유형 템플릿. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "template_id", nullable = false)
    private ApprovalTemplate template;

    /** 동적 값 map 의 key. */
    @Column(name = "field_key", nullable = false, length = 80)
    private String fieldKey;

    /** 화면 라벨. */
    @Column(name = "label", nullable = false, length = 100)
    private String label;

    /** 입력 타입. */
    @Enumerated(EnumType.STRING)
    @Column(name = "field_type", nullable = false, length = 20)
    private ApprovalFieldType fieldType;

    /** 필수 입력 여부. */
    @Column(name = "required", nullable = false)
    private boolean required;

    /** 템플릿 내 표시 순서. */
    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    /** SELECT 옵션 JSON 배열 문자열. */
    @Column(name = "options_json", length = 1000)
    private String optionsJson;

    /** 입력 placeholder. */
    @Column(name = "placeholder", length = 200)
    private String placeholder;

    private ApprovalTemplateField(ApprovalTemplate template, String fieldKey, String label,
                                  ApprovalFieldType fieldType, boolean required, int displayOrder,
                                  String optionsJson, String placeholder) {
        if (template == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "결재유형 템플릿은 필수입니다");
        }
        validateFieldKey(fieldKey);
        if (label == null || label.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "필드 라벨은 필수입니다");
        }
        if (fieldType == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "필드 타입은 필수입니다");
        }
        this.template = template;
        this.fieldKey = fieldKey.trim();
        this.label = label.trim();
        this.fieldType = fieldType;
        this.required = required;
        this.displayOrder = displayOrder;
        this.optionsJson = blankToNull(optionsJson);
        this.placeholder = blankToNull(placeholder);
    }

    /** 신규 템플릿 필드 생성. */
    public static ApprovalTemplateField create(ApprovalTemplate template, String fieldKey, String label,
                                               ApprovalFieldType fieldType, boolean required, int displayOrder,
                                               String optionsJson, String placeholder) {
        return new ApprovalTemplateField(template, fieldKey, label, fieldType, required,
                displayOrder, optionsJson, placeholder);
    }

    /** soft-delete 처리한다. */
    public ApprovalTemplateField softDelete(String actor) {
        markDeleted(actor == null || actor.isBlank() ? "system" : actor);
        return this;
    }

    private static void validateFieldKey(String fieldKey) {
        if (fieldKey == null || fieldKey.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "fieldKey 는 필수입니다");
        }
        if (!fieldKey.matches("[A-Za-z][A-Za-z0-9_]{1,79}")) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "fieldKey 는 영문자로 시작하는 영문/숫자/밑줄 2~80자여야 합니다");
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
