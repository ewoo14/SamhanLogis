package com.samhanair.logis.slip.client;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * InventoryClient — X-Internal-Token 헤더 송신, 4xx → CONFLICT, 5xx → INTERNAL_ERROR 매핑 검증.
 */
class InventoryClientTest {

    private static final String TOKEN = "test-token-xyz";
    private static final String INTERNAL_CALLER_ID = "00000000-0000-0000-0000-000000000000";

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
    void reserve_sendsInternalTokenHeader() {
        UUID productId = UUID.randomUUID();
        UUID warehouseId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();

        server.expect(requestTo("http://inventory-service/inventory/reserve"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess());

        client.reserve(productId, warehouseId, 5, "SLIP", slipId);
        server.verify();
    }

    @Test
    void release_sendsInternalTokenHeader() {
        UUID productId = UUID.randomUUID();
        UUID warehouseId = UUID.randomUUID();

        server.expect(requestTo("http://inventory-service/inventory/release"))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess());

        client.release(productId, warehouseId, 3, "SLIP", UUID.randomUUID());
        server.verify();
    }

    @Test
    void deduct_sendsFromReservationFlag() {
        server.expect(requestTo("http://inventory-service/inventory/deduct"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess());

        client.deduct(UUID.randomUUID(), UUID.randomUUID(), 2, true, "SLIP", UUID.randomUUID());
        server.verify();
    }

    @Test
    void inbound_callsLotsInboundEndpoint_withUnitCost() {
        server.expect(requestTo("http://inventory-service/inventory/lots/inbound"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.CREATED));

        client.inbound(UUID.randomUUID(), UUID.randomUUID(), 10,
                "2026/05/04-1", new BigDecimal("100.00"));
        server.verify();
    }

    @Test
    void inboundInstances_callsInstancesBatchEndpoint_withInternalToken() {
        server.expect(requestTo("http://inventory-service/inventory/instances/batch"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(header("X-User-Id", INTERNAL_CALLER_ID))
                .andRespond(withStatus(HttpStatus.CREATED));

        client.inboundInstances(UUID.randomUUID(), "AC-S2", UUID.randomUUID(), 2,
                "구매", "S2-INB-001", new BigDecimal("500000.00"));
        server.verify();
    }

    @Test
    void reserve_4xxResponse_mapsToConflict() {
        server.expect(requestTo("http://inventory-service/inventory/reserve"))
                .andRespond(withStatus(HttpStatus.CONFLICT));

        assertThatThrownBy(() -> client.reserve(UUID.randomUUID(), UUID.randomUUID(),
                100, "SLIP", UUID.randomUUID()))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assert be.getErrorCode() == ErrorCode.CONFLICT;
                });
        server.verify();
    }

    @Test
    void deduct_4xxBadRequest_mapsToConflict() {
        server.expect(requestTo("http://inventory-service/inventory/deduct"))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST));

        assertThatThrownBy(() -> client.deduct(UUID.randomUUID(), UUID.randomUUID(),
                1, true, "SLIP", UUID.randomUUID()))
                .isInstanceOf(BusinessException.class);
        server.verify();
    }

    @Test
    void reserve_5xxResponse_mapsToInternalError() {
        server.expect(requestTo("http://inventory-service/inventory/reserve"))
                .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));

        assertThatThrownBy(() -> client.reserve(UUID.randomUUID(), UUID.randomUUID(),
                1, "SLIP", UUID.randomUUID()))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assert be.getErrorCode() == ErrorCode.INTERNAL_ERROR;
                });
        server.verify();
    }

    @Test
    void inbound_5xx_mapsToInternalError() {
        server.expect(requestTo("http://inventory-service/inventory/lots/inbound"))
                .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));

        assertThatThrownBy(() -> client.inbound(UUID.randomUUID(), UUID.randomUUID(),
                1, "X", BigDecimal.ZERO))
                .isInstanceOf(BusinessException.class);
        server.verify();
    }

    @Test
    void release_missingToken_throwsInternalError() {
        InternalAuthProperties emptyProps = new InternalAuthProperties();
        emptyProps.setToken(""); // 미설정
        InventoryClient bareClient = new InventoryClient(RestClient.builder(), emptyProps);

        assertThatThrownBy(() -> bareClient.release(UUID.randomUUID(), UUID.randomUUID(),
                1, "SLIP", UUID.randomUUID()))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assert be.getErrorCode() == ErrorCode.INTERNAL_ERROR;
                });
    }
}
