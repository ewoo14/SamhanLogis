package com.samhanair.logis.partnerorder.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("주문서웹 레거시 확정 헤더")
class PartnerOrderLegacyHeaderTest {

    @Test
    @DisplayName("납기·배송주소·감리주소·전화·입금예정일·메모를 확정 주문 snapshot으로 보존한다")
    void preservesLegacyConfirmationHeader() {
        PartnerOrder order = PartnerOrder.createFromConfirm(
                UUID.randomUUID(), "CUST-001", "1234567890", "2026/08/16-1", "idem-1",
                BigDecimal.ZERO, "배송 주소", LocalDate.of(2026, 8, 20), "감리 주소",
                "010-1111-2222", LocalDate.of(2026, 9, 10), "현관 앞 배송");

        assertThat(order.getDeliveryAddress()).isEqualTo("배송 주소");
        assertThat(order.getAuditAddress()).isEqualTo("감리 주소");
        assertThat(order.getContactPhone()).isEqualTo("010-1111-2222");
        assertThat(order.getDueDate()).isEqualTo(LocalDate.of(2026, 8, 20));
        assertThat(order.getPaymentDueDate()).isEqualTo(LocalDate.of(2026, 9, 10));
        assertThat(order.getMemo()).isEqualTo("현관 앞 배송");
    }
}
