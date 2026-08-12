package com.samhanair.logis.inventory.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class StockInstanceSerialQualityTest {

    private static final String SERIAL_CHARSET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
    private static final UUID PRODUCT_ID = UUID.randomUUID();
    private static final UUID WAREHOUSE_ID = UUID.randomUUID();

    @Test
    @DisplayName("신규 인스턴스는 창고 방식의 별도 노출 시리얼키를 발급한다")
    void inbound_assignsWarehouseStyleExposedSerialKey() {
        StockInstance instance = inbound();

        assertThat(instance.getSerialKey())
                .matches("SI-[" + SERIAL_CHARSET + "]{6}");
    }

    @Test
    @DisplayName("신규 인스턴스 품질 기본값은 정상이다")
    void inbound_defaultsQualityToNormal() {
        assertThat(inbound().getQuality()).isEqualTo(StockInstanceQuality.NORMAL);
    }

    @Test
    @DisplayName("시리얼키는 반복 발급해도 중복되지 않는다")
    void inbound_serialKeysAreUnique() {
        Set<String> serialKeys = new HashSet<>();
        for (int i = 0; i < 100; i++) {
            serialKeys.add(inbound().getSerialKey());
        }

        assertThat(serialKeys).hasSize(100);
    }

    private StockInstance inbound() {
        return StockInstance.inbound(
                PRODUCT_ID,
                "MODEL-001",
                WAREHOUSE_ID,
                "구매",
                LocalDateTime.of(2026, 8, 12, 9, 0),
                BigDecimal.valueOf(1000),
                null);
    }
}
