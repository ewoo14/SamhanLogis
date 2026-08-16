package com.samhanair.logis.partnerorder.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** InventoryClient — inventory-service reserve/release/warehouse internal 계약 회귀 가드. */
class InventoryClientTest {

    private static final String TOKEN = "test-token";
    private static final String INTERNAL_CALLER_ID = "00000000-0000-0000-0000-000000000000";
    private static final String SYSTEM_MASTER_HEADER = "X-Is-System-Master";

    private MockRestServiceServer server;
    private InventoryClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();

        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(TOKEN);
        client = new InventoryClient(builder, props);
    }

    @Test
    void reserve_경로_헤더_요청바디와_alreadyReserved_false를_검증한다() {
        UUID productId = UUID.fromString("00000000-0000-0000-0000-000000000301");
        UUID warehouseId = UUID.fromString("00000000-0000-0000-0000-000000000401");
        UUID referenceId = UUID.fromString("00000000-0000-0000-0000-000000000501");

        server.expect(requestTo("http://inventory-service/inventory/reserve"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(header("X-User-Id", INTERNAL_CALLER_ID))
                .andExpect(header(SYSTEM_MASTER_HEADER, "true"))
                .andExpect(jsonPath("$.productId").value(productId.toString()))
                .andExpect(jsonPath("$.warehouseId").value(warehouseId.toString()))
                .andExpect(jsonPath("$.quantity").value(7))
                .andExpect(jsonPath("$.referenceType").value("PARTNER_ORDER_CONVERT"))
                .andExpect(jsonPath("$.referenceId").value(referenceId.toString()))
                .andRespond(withSuccess("""
                        {"success":true,"data":{"alreadyReserved":false}}
                        """, MediaType.APPLICATION_JSON));

        InventoryClient.ReservationResult result =
                client.reserve(productId, warehouseId, 7, "PARTNER_ORDER_CONVERT", referenceId);

        assertThat(result.alreadyReserved()).isFalse();
        server.verify();
    }

    @Test
    void reserve_alreadyReserved_true는_멱등_noop으로_반환한다() {
        UUID productId = UUID.fromString("00000000-0000-0000-0000-000000000302");
        UUID warehouseId = UUID.fromString("00000000-0000-0000-0000-000000000402");
        UUID referenceId = UUID.fromString("00000000-0000-0000-0000-000000000502");

        server.expect(requestTo("http://inventory-service/inventory/reserve"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(header("X-User-Id", INTERNAL_CALLER_ID))
                .andExpect(header(SYSTEM_MASTER_HEADER, "true"))
                .andExpect(jsonPath("$.referenceType").value("PARTNER_ORDER_CONVERT"))
                .andExpect(jsonPath("$.referenceId").value(referenceId.toString()))
                .andRespond(withSuccess("""
                        {"success":true,"data":{"alreadyReserved":true}}
                        """, MediaType.APPLICATION_JSON));

        InventoryClient.ReservationResult result =
                client.reserve(productId, warehouseId, 1, "PARTNER_ORDER_CONVERT", referenceId);

        assertThat(result.alreadyReserved()).isTrue();
        server.verify();
    }

    @Test
    void reserve_409는_CONFLICT() {
        server.expect(requestTo("http://inventory-service/inventory/reserve"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(header("X-User-Id", INTERNAL_CALLER_ID))
                .andExpect(header(SYSTEM_MASTER_HEADER, "true"))
                .andRespond(withStatus(HttpStatus.CONFLICT));

        assertThatThrownBy(() -> client.reserve(UUID.randomUUID(), UUID.randomUUID(),
                100, "PARTNER_ORDER_CONVERT", UUID.randomUUID()))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
        server.verify();
    }

    @Test
    void release_경로_헤더_요청바디를_검증한다() {
        UUID productId = UUID.fromString("00000000-0000-0000-0000-000000000303");
        UUID warehouseId = UUID.fromString("00000000-0000-0000-0000-000000000403");
        UUID referenceId = UUID.fromString("00000000-0000-0000-0000-000000000503");

        server.expect(requestTo("http://inventory-service/inventory/release"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(header("X-User-Id", INTERNAL_CALLER_ID))
                .andExpect(header(SYSTEM_MASTER_HEADER, "true"))
                .andExpect(jsonPath("$.productId").value(productId.toString()))
                .andExpect(jsonPath("$.warehouseId").value(warehouseId.toString()))
                .andExpect(jsonPath("$.quantity").value(3))
                .andExpect(jsonPath("$.referenceType").value("PARTNER_ORDER_COMPENSATE"))
                .andExpect(jsonPath("$.referenceId").value(referenceId.toString()))
                .andRespond(withSuccess());

        client.release(productId, warehouseId, 3, "PARTNER_ORDER_COMPENSATE", referenceId);

        server.verify();
    }

    @Test
    void release_실패는_보상_alert용으로_삼킨다() {
        server.expect(requestTo("http://inventory-service/inventory/release"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(header("X-User-Id", INTERNAL_CALLER_ID))
                .andExpect(header(SYSTEM_MASTER_HEADER, "true"))
                .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));

        assertThatCode(() -> client.release(UUID.randomUUID(), UUID.randomUUID(),
                3, "PARTNER_ORDER_COMPENSATE", UUID.randomUUID()))
                .doesNotThrowAnyException();
        server.verify();
    }

    @Test
    void resolveWarehouseIdByCode_경로_토큰과_응답파싱을_검증한다() {
        UUID warehouseId = UUID.fromString("00000000-0000-0000-0000-000000000404");

        server.expect(requestTo("http://inventory-service/internal/inventory/warehouses/by-code?code=MAIN"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {"success":true,"data":{"warehouseId":"00000000-0000-0000-0000-000000000404"}}
                        """, MediaType.APPLICATION_JSON));

        assertThat(client.resolveWarehouseIdByCode(" MAIN ")).isEqualTo(warehouseId);
        server.verify();
    }

    @Test
    void resolveWarehouseIdByCode_acceptsOpaqueWarehouseId() {
        server.expect(requestTo("http://inventory-service/internal/inventory/warehouses/by-code?code=MAIN"))
                .andRespond(withSuccess("""
                        {"success":true,"data":{"warehouseId":"AAAAAAAAAAAAAAAAAAAAAA"}}
                        """, MediaType.APPLICATION_JSON));

        assertThat(client.resolveWarehouseIdByCode("MAIN"))
                .isEqualTo(UUID.fromString("00000000-0000-0000-0000-000000000000"));
        server.verify();
    }

    @Test
    void resolveWarehouseIdByCode_404는_NOT_FOUND() {
        server.expect(requestTo("http://inventory-service/internal/inventory/warehouses/by-code?code=UNKNOWN"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));

        assertThatThrownBy(() -> client.resolveWarehouseIdByCode("UNKNOWN"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.NOT_FOUND));
        server.verify();
    }
}
