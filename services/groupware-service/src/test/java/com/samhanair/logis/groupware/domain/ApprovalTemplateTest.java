package com.samhanair.logis.groupware.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.common.exception.BusinessException;
import org.junit.jupiter.api.Test;

/** 결재유형 템플릿 code 검증 단위 테스트. */
class ApprovalTemplateTest {

    @Test
    void create_withNormalCode_succeeds() {
        ApprovalTemplate template = ApprovalTemplate.create("EXPENSE_REPORT", "지출결의서", "설명", true, 10);

        assertThat(template.getCode()).isEqualTo("EXPENSE_REPORT");
        assertThat(template.getName()).isEqualTo("지출결의서");
    }

    @Test
    void create_withReservedDefaultCode_isRejected() {
        // code="DEFAULT" 는 파생 docType 이 렌더러 예약 sentinel "GROUPWARE_DEFAULT" 와 충돌하므로 거부.
        assertThatThrownBy(() -> ApprovalTemplate.create("DEFAULT", "예약", "설명", true, 0))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("예약된 결재유형 code");
    }

    @Test
    void create_withInvalidFormatCode_isRejected() {
        assertThatThrownBy(() -> ApprovalTemplate.create("default", "소문자", "설명", true, 0))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> ApprovalTemplate.create("A", "너무 짧음", "설명", true, 0))
                .isInstanceOf(BusinessException.class);
    }
}
