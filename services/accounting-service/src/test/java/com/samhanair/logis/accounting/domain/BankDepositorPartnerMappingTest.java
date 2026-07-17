package com.samhanair.logis.accounting.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** 입금자명 매핑 entity의 도메인 생성·변경·soft delete 테스트. */
class BankDepositorPartnerMappingTest {

    @Test
    @DisplayName("생성 시 rawName에서 normalizedName을 계산하고 거래처를 보관한다")
    void createsNormalizedMapping() {
        UUID partnerId = UUID.randomUUID();

        BankDepositorPartnerMapping mapping = BankDepositorPartnerMapping.create("  ac\tme  ", partnerId);

        assertThat(mapping.getRawName()).isEqualTo("ac\tme");
        assertThat(mapping.getNormalizedName()).isEqualTo("AC ME");
        assertThat(mapping.getPartnerId()).isEqualTo(partnerId);
    }

    @Test
    @DisplayName("공백 전용 rawName과 null 거래처는 거부한다")
    void rejectsInvalidMapping() {
        assertThatThrownBy(() -> BankDepositorPartnerMapping.create(" \u00A0 ", UUID.randomUUID()))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> BankDepositorPartnerMapping.create("거래처", null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("도메인 chain으로 매핑을 변경하고 soft delete한다")
    void updatesAndDeletesThroughDomainMethods() {
        BankDepositorPartnerMapping mapping = BankDepositorPartnerMapping
                .create("A", UUID.randomUUID())
                .updateMapping("B", UUID.randomUUID())
                .delete("tester");

        assertThat(mapping.getRawName()).isEqualTo("B");
        assertThat(mapping.getNormalizedName()).isEqualTo("B");
        assertThat(mapping.getIsDeleted()).isTrue();
        assertThat(mapping.getDeletedBy()).isEqualTo("tester");
    }
}
