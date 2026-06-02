package com.samhanair.logis.inventory.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * S3 출고연동용 StockInstance 상태전이 테스트.
 */
class StockInstanceOutboundTest {

    private static final UUID PRODUCT_ID = UUID.fromString("00000000-0000-0000-0000-000000000101");
    private static final UUID WAREHOUSE_ID = UUID.fromString("00000000-0000-0000-0000-000000000201");

    @Test
    @DisplayName("reserve(outboundSlipNo)는 RESERVED 마커를 기록하고 release는 마커를 지운다")
    void reserveWithSlipMarker_thenReleaseClearsMarker() {
        StockInstance instance = instance();

        instance.reserve("2026/06/02-1");

        assertThat(instance.getStatus()).isEqualTo(StockInstanceStatus.RESERVED);
        assertThat(instance.getOutboundSlipNo()).isEqualTo("2026/06/02-1");

        instance.release();

        assertThat(instance.getStatus()).isEqualTo(StockInstanceStatus.AVAILABLE);
        assertThat(instance.getOutboundSlipNo()).isNull();
    }

    @Test
    @DisplayName("RESERVED 인스턴스도 출고 완료 시 SHIPPED로 전이된다")
    void reservedInstanceCanBeShipped() {
        LocalDateTime outboundAt = LocalDateTime.of(2026, 6, 2, 10, 0);
        StockInstance instance = instance();
        instance.reserve("2026/06/02-2");

        instance.ship("P-2026-0001", "2026/06/02-2", outboundAt);

        assertThat(instance.getStatus()).isEqualTo(StockInstanceStatus.SHIPPED);
        assertThat(instance.getOutboundPartnerCode()).isEqualTo("P-2026-0001");
        assertThat(instance.getOutboundSlipNo()).isEqualTo("2026/06/02-2");
        assertThat(instance.getOutboundAt()).isEqualTo(outboundAt);
    }

    @Test
    @DisplayName("AVAILABLE 직접 ship은 기존처럼 허용된다")
    void availableInstanceCanStillBeShipped() {
        StockInstance instance = instance();

        instance.ship("P-2026-0002", "2026/06/02-3", null);

        assertThat(instance.getStatus()).isEqualTo(StockInstanceStatus.SHIPPED);
        assertThat(instance.getOutboundPartnerCode()).isEqualTo("P-2026-0002");
        assertThat(instance.getOutboundAt()).isNotNull();
    }

    @Test
    @DisplayName("이미 SHIPPED인 인스턴스 재출고는 409로 거부한다")
    void shipFromInvalidStateThrows409() {
        StockInstance instance = instance();
        instance.ship("P-2026-0003", "2026/06/02-4", null);

        assertThatThrownBy(() -> instance.ship("P-2026-0004", "2026/06/02-5", null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);
    }

    private StockInstance instance() {
        return StockInstance.inbound(PRODUCT_ID, "AC-S3", WAREHOUSE_ID,
                "구매", LocalDateTime.of(2026, 5, 30, 9, 0),
                new BigDecimal("500000"), "S2-IN-001");
    }
}
