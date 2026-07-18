package com.samhanair.logis.groupware.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 결재유형 템플릿.
 *
 * <p>관리자가 결재 유형과 표시 순서를 관리하고, 하위 {@link ApprovalTemplateField} 들이
 * 동적 폼 스키마를 구성한다. 삭제는 물리 삭제가 아니라 {@link #softDelete(String)} 로 처리한다.
 */
@Entity
@Getter
@Table(name = "approval_templates")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class ApprovalTemplate extends BaseEntity {

    /**
     * 렌더러 기본 레이아웃 sentinel docType.
     *
     * <p>결재선의 {@code document_type} 은 {@code GROUPWARE_${code}} 로 파생되며, 렌더러는
     * {@code GROUPWARE_DEFAULT} 를 "저장된 레이아웃 없음(=기본 출력)" 을 뜻하는 예약값으로 사용한다.
     * 따라서 {@code code = "DEFAULT"} 로 파생 docType 이 이 예약값과 충돌하는 것을 금지한다.
     */
    private static final String RESERVED_RENDERER_DOC_TYPE = "GROUPWARE_DEFAULT";

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 템플릿 business code. 예: EXPENSE_REPORT. */
    @Column(name = "code", nullable = false, length = 60)
    private String code;

    /** 사용자 표시명. */
    @Column(name = "name", nullable = false, length = 100)
    private String name;

    /** 관리자 설명. */
    @Column(name = "description", length = 500)
    private String description;

    /** 사용자 작성 화면 노출 여부. */
    @Column(name = "active", nullable = false)
    private boolean active;

    /** 화면 정렬 순서. */
    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    private ApprovalTemplate(String code, String name, String description, boolean active, int displayOrder) {
        validateCode(code);
        validateName(name);
        this.code = code.trim();
        this.name = name.trim();
        this.description = blankToNull(description);
        this.active = active;
        this.displayOrder = displayOrder;
    }

    /** 신규 결재유형 템플릿 생성. */
    public static ApprovalTemplate create(String code, String name, String description,
                                          boolean active, int displayOrder) {
        return new ApprovalTemplate(code, name, description, active, displayOrder);
    }

    /** 템플릿을 활성화한다. */
    public ApprovalTemplate activate() {
        this.active = true;
        return this;
    }

    /** 템플릿을 비활성화한다. */
    public ApprovalTemplate deactivate() {
        this.active = false;
        return this;
    }

    /** 템플릿 이름을 변경한다. */
    public ApprovalTemplate rename(String name) {
        validateName(name);
        this.name = name.trim();
        return this;
    }

    /** 설명을 변경한다. */
    public ApprovalTemplate updateDescription(String description) {
        this.description = blankToNull(description);
        return this;
    }

    /** 화면 정렬 순서를 변경한다. */
    public ApprovalTemplate reorder(int displayOrder) {
        this.displayOrder = displayOrder;
        return this;
    }

    /** soft-delete 처리한다. */
    public ApprovalTemplate softDelete(String actor) {
        markDeleted(actor == null || actor.isBlank() ? "system" : actor);
        return this;
    }

    private static void validateCode(String code) {
        if (code == null || code.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "결재유형 code 는 필수입니다");
        }
        if (!code.matches("[A-Z0-9_]{2,60}")) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "결재유형 code 는 영문 대문자/숫자/밑줄 2~60자여야 합니다");
        }
        if (RESERVED_RENDERER_DOC_TYPE.equals("GROUPWARE_" + code)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "예약된 결재유형 code 는 사용할 수 없습니다: " + code);
        }
    }

    private static void validateName(String name) {
        if (name == null || name.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "결재유형 이름은 필수입니다");
        }
        if (name.length() > 100) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "결재유형 이름은 100자 이하여야 합니다");
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
