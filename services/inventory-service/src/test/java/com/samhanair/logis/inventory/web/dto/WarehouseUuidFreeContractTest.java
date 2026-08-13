package com.samhanair.logis.inventory.web.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.inventory.domain.WarehouseType;
import java.time.LocalDateTime;
import java.util.UUID;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/** 창고 목록 응답과 후속 URL에서 내부 UUID 원문을 숨기는 계약. */
class WarehouseUuidFreeContractTest {

    private static final UUID WAREHOUSE_ID = UUID.fromString("11111111-1111-4111-8111-111111111111");
    private static final Pattern UUID_PATTERN = Pattern.compile(
            "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}");

    @Test
    void listResponseAndFollowUpUrl_areUuidFree_andOpaqueTokenResolves() throws Exception {
        WarehouseResponse response = new WarehouseResponse(
                WAREHOUSE_ID, "WH-001", "본사", WarehouseType.HEADQUARTERS, "서울", 1,
                null, LocalDateTime.parse("2026-08-13T00:00:00"), "system",
                LocalDateTime.parse("2026-08-13T00:00:00"), "system");
        String body = new ObjectMapper().findAndRegisterModules().writeValueAsString(response);
        String token = OpaqueUuidSerializer.encode(WAREHOUSE_ID);
        String followUpUrl = "/inventory/warehouses/" + token + "/audit-logs";

        assertThat(body).doesNotContain(WAREHOUSE_ID.toString());
        assertThat(UUID_PATTERN.matcher(body).find()).isFalse();
        assertThat(followUpUrl).doesNotContain(WAREHOUSE_ID.toString());
        assertThat(OpaqueUuidDeserializer.decode(token)).isEqualTo(WAREHOUSE_ID);
    }
}
