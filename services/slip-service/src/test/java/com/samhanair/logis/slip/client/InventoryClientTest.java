package com.samhanair.logis.slip.client;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.headerDoesNotExist;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
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
    void reserve_sendsInternalTokenHeader() {
        UUID productId = UUID.randomUUID();
        UUID warehouseId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();

        server.expect(requestTo("http://inventory-service/inventory/reserve"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(header("X-User-Id", INTERNAL_CALLER_ID))
                .andExpect(header(SYSTEM_MASTER_HEADER, "true"))
                .andExpect(jsonPath("$.productId").value(productId.toString()))
                .andExpect(jsonPath("$.warehouseId").value(warehouseId.toString()))
                .andExpect(jsonPath("$.quantity").value(5))
                .andExpect(jsonPath("$.referenceType").value("SLIP"))
                .andExpect(jsonPath("$.referenceId").value(slipId.toString()))
                .andRespond(withSuccess());

        client.reserve(productId, warehouseId, 5, "SLIP", slipId);
        server.verify();
    }

    @Test
    void release_sendsInternalTokenHeader() {
        UUID productId = UUID.randomUUID();
        UUID warehouseId = UUID.randomUUID();

        server.expect(requestTo("http://inventory-service/inventory/release"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(header("X-User-Id", INTERNAL_CALLER_ID))
                .andExpect(header(SYSTEM_MASTER_HEADER, "true"))
                .andExpect(jsonPath("$.productId").value(productId.toString()))
                .andExpect(jsonPath("$.warehouseId").value(warehouseId.toString()))
                .andExpect(jsonPath("$.quantity").value(3))
                .andExpect(jsonPath("$.referenceType").value("SLIP"))
                .andRespond(withSuccess());

        client.release(productId, warehouseId, 3, "SLIP", UUID.randomUUID());
        server.verify();
    }

    @Test
    void deduct_sendsFromReservationFlag() {
        UUID slipId = UUID.randomUUID();
        server.expect(requestTo("http://inventory-service/inventory/deduct"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(header("X-User-Id", INTERNAL_CALLER_ID))
                .andExpect(header(SYSTEM_MASTER_HEADER, "true"))
                .andExpect(jsonPath("$.quantity").value(2))
                .andExpect(jsonPath("$.fromReservation").value(true))
                .andExpect(jsonPath("$.sourceContext.slipId").value(slipId.toString()))
                .andExpect(jsonPath("$.sourceContext.slipRevision").value(7))
                .andRespond(withSuccess());

        client.deduct(UUID.randomUUID(), UUID.randomUUID(), 2, true, "SLIP", slipId,
                new SourceOperationContext(UUID.randomUUID(), slipId, 7L));
        server.verify();
    }

    @Test
    void legacyDeduct_withoutSourceContext_failsBeforeHttpCall() {
        assertThatThrownBy(() -> client.deduct(UUID.randomUUID(), UUID.randomUUID(),
                1, true, "SLIP", UUID.randomUUID()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("sourceContext");
    }

    @Test
    void inbound_callsLotsInboundEndpoint_withUnitCost() {
        UUID slipId = UUID.randomUUID();
        server.expect(requestTo("http://inventory-service/inventory/lots/inbound"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(header("X-User-Id", INTERNAL_CALLER_ID))
                .andExpect(header(SYSTEM_MASTER_HEADER, "true"))
                .andExpect(jsonPath("$.quantity").value(10))
                .andExpect(jsonPath("$.lotNo").value("2026/05/04-1"))
                .andExpect(jsonPath("$.unitCost").value(100.00))
                .andExpect(jsonPath("$.sourceContext.slipId").value(slipId.toString()))
                .andExpect(jsonPath("$.sourceContext.slipRevision").value(4))
                .andRespond(withStatus(HttpStatus.CREATED));

        client.inbound(UUID.randomUUID(), UUID.randomUUID(), 10,
                "2026/05/04-1", new BigDecimal("100.00"),
                new SourceOperationContext(UUID.randomUUID(), slipId, 4L));
        server.verify();
    }

    @Test
    void inboundInstances_callsInstancesBatchEndpoint_withInternalToken() {
        UUID slipId = UUID.randomUUID();
        server.expect(requestTo("http://inventory-service/inventory/instances/batch"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(headerDoesNotExist("X-User-Role")) // C5-4: master bypass 는 X-Is-System-Master 전담
                .andExpect(header("X-User-Id", INTERNAL_CALLER_ID))
                .andExpect(header(SYSTEM_MASTER_HEADER, "true"))
                .andExpect(jsonPath("$.sourceContext.slipId").value(slipId.toString()))
                .andExpect(jsonPath("$.sourceContext.slipRevision").value(5))
                .andRespond(withStatus(HttpStatus.CREATED));

        client.inboundInstances(UUID.randomUUID(), "AC-S2", UUID.randomUUID(), 2,
                "PURCHASE", "S2-INB-001", new BigDecimal("500000.00"),
                new SourceOperationContext(UUID.randomUUID(), slipId, 5L));
        server.verify();
    }

    @Test
    void reserveInstances_callsReserveBatchEndpoint_withInternalHeadersAndBody() {
        UUID warehouseId = UUID.randomUUID();

        server.expect(requestTo("http://inventory-service/inventory/instances/reserve-batch"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(headerDoesNotExist("X-User-Role")) // C5-4: master bypass 는 X-Is-System-Master 전담
                .andExpect(header("X-User-Id", INTERNAL_CALLER_ID))
                .andExpect(header(SYSTEM_MASTER_HEADER, "true"))
                .andExpect(jsonPath("$.productCode").value("AC-S3"))
                .andExpect(jsonPath("$.warehouseId").value(warehouseId.toString()))
                .andExpect(jsonPath("$.quantity").value(2))
                .andExpect(jsonPath("$.outboundSlipNo").value("2026/06/02-1"))
                .andRespond(withSuccess());

        client.reserveInstances("AC-S3", warehouseId, 2, "2026/06/02-1");
        server.verify();
    }

    @Test
    void shipInstances_callsShipBatchEndpoint_withInternalHeadersAndBody() {
        UUID slipId = UUID.randomUUID();
        server.expect(requestTo("http://inventory-service/inventory/instances/ship-batch"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(headerDoesNotExist("X-User-Role")) // C5-4: master bypass 는 X-Is-System-Master 전담
                .andExpect(header("X-User-Id", INTERNAL_CALLER_ID))
                .andExpect(header(SYSTEM_MASTER_HEADER, "true"))
                .andExpect(jsonPath("$.outboundSlipNo").value("2026/06/02-2"))
                .andExpect(jsonPath("$.productCode").value("AC-S3"))
                .andExpect(jsonPath("$.partnerCode").value("P-2026-0001"))
                .andExpect(jsonPath("$.sourceContext.slipId").value(slipId.toString()))
                .andExpect(jsonPath("$.sourceContext.slipRevision").value(6))
                .andRespond(withSuccess());

        client.shipInstances("2026/06/02-2", "AC-S3", "P-2026-0001", null,
                new SourceOperationContext(UUID.randomUUID(), slipId, 6L));
        server.verify();
    }

    @Test
    void releaseInstances_callsReleaseBatchEndpoint_withInternalHeadersAndBody() {
        server.expect(requestTo("http://inventory-service/inventory/instances/release-batch"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(headerDoesNotExist("X-User-Role")) // C5-4: master bypass 는 X-Is-System-Master 전담
                .andExpect(header("X-User-Id", INTERNAL_CALLER_ID))
                .andExpect(header(SYSTEM_MASTER_HEADER, "true"))
                .andExpect(jsonPath("$.outboundSlipNo").value("2026/06/02-3"))
                .andExpect(jsonPath("$.productCode").value("AC-S3"))
                .andRespond(withSuccess());

        client.releaseInstances("2026/06/02-3", "AC-S3");
        server.verify();
    }

    @Test
    void recallInstances_callsRecallBatchEndpoint_withInternalHeadersAndBody() {
        server.expect(requestTo("http://inventory-service/inventory/instances/recall-batch"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(headerDoesNotExist("X-User-Role")) // C5-4: master bypass 는 X-Is-System-Master 전담
                .andExpect(header("X-User-Id", INTERNAL_CALLER_ID))
                .andExpect(header(SYSTEM_MASTER_HEADER, "true"))
                .andExpect(jsonPath("$.partnerCode").value("P-S4-001"))
                .andExpect(jsonPath("$.productCode").value("AC-S4"))
                .andExpect(jsonPath("$.quantity").value(2))
                .andExpect(jsonPath("$.recallSlipNo").value("2026/06/03-1"))
                .andRespond(withSuccess());

        client.recallInstances("P-S4-001", "AC-S4", 2, "2026/06/03-1");
        server.verify();
    }

    @Test
    void recallInstances_4xxResponse_includesErrorBody() {
        server.expect(requestTo("http://inventory-service/inventory/instances/recall-batch"))
                .andRespond(withStatus(HttpStatus.CONFLICT)
                        .body("{\"message\":\"회수 대상 부족\"}")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.recallInstances("P-S4-002", "AC-S4", 9, "2026/06/03-2"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("회수 대상 부족");
        server.verify();
    }

    @Test
    void unrecallInstances_callsUnrecallBatchEndpoint_withInternalHeadersAndBody() {
        server.expect(requestTo("http://inventory-service/inventory/instances/unrecall-batch"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(headerDoesNotExist("X-User-Role")) // C5-4: master bypass 는 X-Is-System-Master 전담
                .andExpect(header("X-User-Id", INTERNAL_CALLER_ID))
                .andExpect(header(SYSTEM_MASTER_HEADER, "true"))
                .andExpect(jsonPath("$.recallSlipNo").value("2026/06/03-3"))
                .andExpect(jsonPath("$.productCode").value("AC-S4"))
                .andRespond(withSuccess());

        client.unrecallInstances("2026/06/03-3", "AC-S4");
        server.verify();
    }

    @Test
    void unrecallInstances_4xxResponse_includesErrorBody() {
        server.expect(requestTo("http://inventory-service/inventory/instances/unrecall-batch"))
                .andRespond(withStatus(HttpStatus.CONFLICT)
                        .body("{\"message\":\"회수 취소 불가\"}")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.unrecallInstances("2026/06/03-4", "AC-S4"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("회수 취소 불가");
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
                1, true, "SLIP", UUID.randomUUID(),
                new SourceOperationContext(UUID.randomUUID(), UUID.randomUUID(), 1L)))
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
                1, "X", BigDecimal.ZERO,
                new SourceOperationContext(UUID.randomUUID(), UUID.randomUUID(), 1L)))
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
