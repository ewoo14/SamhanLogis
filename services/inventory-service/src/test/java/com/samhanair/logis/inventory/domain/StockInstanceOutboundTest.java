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
                .hasMessageContaining("출고완료")
                .hasMessageContaining("가용")
                .hasMessageContaining("예약")
                .hasMessageNotContaining("SHIPPED")
                .hasMessageNotContaining("AVAILABLE")
                .hasMessageNotContaining("RESERVED")
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);
    }

    @Test
    @DisplayName("recall(recallSlipNo)는 SHIPPED 인스턴스를 RECALLED로 전이하고 회수전표 마커를 기록한다")
    void recallWithSlipMarker_recordsMarker() {
        StockInstance instance = instance();
        instance.ship("P-2026-0005", "2026/06/02-6", LocalDateTime.of(2026, 6, 2, 11, 0));

        instance.recall("2026/06/03-1");

        assertThat(instance.getStatus()).isEqualTo(StockInstanceStatus.RECALLED);
        assertThat(instance.getRecallSlipNo()).isEqualTo("2026/06/03-1");
    }

    @Test
    @DisplayName("SHIPPED가 아닌 인스턴스 회수는 409로 거부한다")
    void recallFromInvalidStateThrows409() {
        StockInstance instance = instance();

        assertThatThrownBy(() -> instance.recall("2026/06/03-2"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("가용")
                .hasMessageContaining("출고완료")
                .hasMessageNotContaining("AVAILABLE")
                .hasMessageNotContaining("SHIPPED")
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);
    }

    @Test
    @DisplayName("unrecall은 RECALLED를 SHIPPED로 되돌리고 출고 마커는 유지한다")
    void unrecallRestoresShippedAndKeepsOutboundMarkers() {
        LocalDateTime outboundAt = LocalDateTime.of(2026, 6, 2, 11, 0);
        StockInstance instance = instance();
        instance.ship("P-2026-0006", "2026/06/02-7", outboundAt);
        instance.recall("2026/06/03-3");

        instance.unrecall();

        assertThat(instance.getStatus()).isEqualTo(StockInstanceStatus.SHIPPED);
        assertThat(instance.getRecallSlipNo()).isNull();
        assertThat(instance.getOutboundPartnerCode()).isEqualTo("P-2026-0006");
        assertThat(instance.getOutboundSlipNo()).isEqualTo("2026/06/02-7");
        assertThat(instance.getOutboundAt()).isEqualTo(outboundAt);
    }

    @Test
    @DisplayName("RECALLED가 아닌 인스턴스 회수 취소는 409로 거부한다")
    void unrecallFromInvalidStateThrows409() {
        StockInstance instance = instance();
        instance.ship("P-2026-0007", "2026/06/02-8", null);

        assertThatThrownBy(instance::unrecall)
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("출고완료")
                .hasMessageContaining("회수됨")
                .hasMessageNotContaining("SHIPPED")
                .hasMessageNotContaining("RECALLED")
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);
    }

    @Test
    @DisplayName("resell은 RECALLED를 AVAILABLE로 전이하고 회수/출고 마커를 지우며 receivedAt을 갱신한다")
    void resellRestoresAvailableAndClearsRecallAndOutboundMarkers() {
        LocalDateTime outboundAt = LocalDateTime.of(2026, 6, 2, 12, 0);
        StockInstance instance = instance();
        instance.ship("P-2026-0008", "2026/06/02-9", outboundAt);
        instance.recall("2026/06/03-6");
        LocalDateTime previousReceivedAt = instance.getReceivedAt();
        LocalDateTime before = LocalDateTime.now().minusSeconds(1);

        instance.resell();

        LocalDateTime after = LocalDateTime.now().plusSeconds(1);
        assertThat(instance.getStatus()).isEqualTo(StockInstanceStatus.AVAILABLE);
        assertThat(instance.getRecallSlipNo()).isNull();
        assertThat(instance.getOutboundPartnerCode()).isNull();
        assertThat(instance.getOutboundSlipNo()).isNull();
        assertThat(instance.getOutboundAt()).isNull();
        assertThat(instance.getReceivedAt()).isNotEqualTo(previousReceivedAt);
        assertThat(instance.getReceivedAt()).isBetween(before, after);
    }

    @Test
    @DisplayName("RECALLED가 아닌 인스턴스 재판매는 409로 거부한다")
    void resellFromInvalidStateThrows409() {
        StockInstance instance = instance();

        assertThatThrownBy(instance::resell)
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("가용")
                .hasMessageContaining("회수됨")
                .hasMessageNotContaining("AVAILABLE")
                .hasMessageNotContaining("RECALLED")
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);
    }

    @Test
    @DisplayName("StockInstanceStatus displayName은 사용자 노출 한국어 SSOT다")
    void stockInstanceStatusDisplayNames() {
        assertThat(StockInstanceStatus.AVAILABLE.getDisplayName()).isEqualTo("가용");
        assertThat(StockInstanceStatus.RESERVED.getDisplayName()).isEqualTo("예약");
        assertThat(StockInstanceStatus.SHIPPED.getDisplayName()).isEqualTo("출고완료");
        assertThat(StockInstanceStatus.RECALLED.getDisplayName()).isEqualTo("회수됨");
    }

    private StockInstance instance() {
        return StockInstance.inbound(PRODUCT_ID, "AC-S3", WAREHOUSE_ID,
                "구매", LocalDateTime.of(2026, 5, 30, 9, 0),
                new BigDecimal("500000"), "S2-IN-001");
    }
}
