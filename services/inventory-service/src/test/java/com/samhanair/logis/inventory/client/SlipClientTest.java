package com.samhanair.logis.inventory.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** inventory-service slip-service GET /slips/{slipId} RestClient contract test. */
class SlipClientTest {

    private static final String TOKEN = "test-token-xyz";
    private static final UUID SLIP_ID = UUID.fromString("00000000-0000-0000-0000-000000000201");
    private static final String ENDPOINT = "http://slip-service/slips/" + SLIP_ID;

    private MockRestServiceServer server;
    private SlipClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();

        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(TOKEN);
        client = new SlipClient(builder, props, new ObjectMapper());
    }

    @Test
    void getSlip_sendsInternalHeaders_andParsesInboundLines() {
        UUID warehouseId = UUID.fromString("00000000-0000-0000-0000-000000000202");
        UUID lineId = UUID.fromString("00000000-0000-0000-0000-000000000203");
        UUID productId = UUID.fromString("00000000-0000-0000-0000-000000000204");
        String json = """
                {
                  "success": true,
                  "code": "OK",
                  "message": "성공",
                  "data": {
                    "id": "%s",
                    "slipNo": "2026/06/20-001",
                    "slipType": "INBOUND",
                    "status": "CONFIRMED",
                    "destinationWarehouseId": "%s",
                    "partnerName": "삼한테스트",
                    "destinationWarehouseName": "본사창고",
                    "slipDate": "2026-06-20",
                    "businessNumber": "1234567890",
                    "lines": [{
                      "id": "%s",
                      "productId": "%s",
                      "productName": "테스트 품목",
                      "modelName": "MODEL-A",
                      "quantity": 7,
                      "unitPrice": 12345.67,
                      "supplyAmount": 70000
                    }]
                  }
                }
                """.formatted(SLIP_ID, warehouseId, lineId, productId);

        server.expect(requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(header("X-User-Id", "system-internal"))
                .andExpect(header("X-User-Role", "MASTER"))
                .andExpect(header("X-Is-System-Master", "true"))
                .andRespond(withSuccess(json, MediaType.APPLICATION_JSON));

        SlipDetail result = client.getSlip(SLIP_ID);

        assertThat(result.id()).isEqualTo(SLIP_ID);
        assertThat(result.slipNo()).isEqualTo("2026/06/20-001");
        assertThat(result.slipType()).isEqualTo("INBOUND");
        assertThat(result.status()).isEqualTo("CONFIRMED");
        assertThat(result.destinationWarehouseId()).isEqualTo(warehouseId);
        assertThat(result.partnerName()).isEqualTo("삼한테스트");
        assertThat(result.destinationWarehouseName()).isEqualTo("본사창고");
        assertThat(result.slipDate()).isEqualTo("2026-06-20");
        assertThat(result.businessNumber()).isEqualTo("1234567890");
        assertThat(result.lines()).hasSize(1);
        SlipLineDetail line = result.lines().get(0);
        assertThat(line.id()).isEqualTo(lineId);
        assertThat(line.productId()).isEqualTo(productId);
        assertThat(line.quantity()).isEqualTo(7);
        assertThat(line.unitPrice()).isEqualByComparingTo(new BigDecimal("12345.67"));
        assertThat(line.supplyAmount()).isEqualByComparingTo(new BigDecimal("70000"));
        server.verify();
    }

    @Test
    void getSlip_404_mapsToNotFound() {
        server.expect(requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(header("X-User-Id", "system-internal"))
                .andExpect(header("X-User-Role", "MASTER"))
                .andExpect(header("X-Is-System-Master", "true"))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));

        assertThatThrownBy(() -> client.getSlip(SLIP_ID))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.NOT_FOUND));
        server.verify();
    }

    @Test
    void getSlip_403_mapsToForbidden() {
        server.expect(requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(header("X-User-Id", "system-internal"))
                .andExpect(header("X-User-Role", "MASTER"))
                .andExpect(header("X-Is-System-Master", "true"))
                .andRespond(withStatus(HttpStatus.FORBIDDEN));

        assertThatThrownBy(() -> client.getSlip(SLIP_ID))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.FORBIDDEN));
        server.verify();
    }

    @Test
    void getSlip_400_mapsToInvalidInput() {
        server.expect(requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(header("X-User-Id", "system-internal"))
                .andExpect(header("X-User-Role", "MASTER"))
                .andExpect(header("X-Is-System-Master", "true"))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST));

        assertThatThrownBy(() -> client.getSlip(SLIP_ID))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
        server.verify();
    }

    @Test
    void getSlip_5xx_mapsToInternalError() {
        server.expect(requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(header("X-User-Id", "system-internal"))
                .andExpect(header("X-User-Role", "MASTER"))
                .andExpect(header("X-Is-System-Master", "true"))
                .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));

        assertThatThrownBy(() -> client.getSlip(SLIP_ID))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INTERNAL_ERROR));
        server.verify();
    }

    @Test
    void getSlip_missingData_mapsToInternalError() {
        server.expect(requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(header("X-User-Id", "system-internal"))
                .andExpect(header("X-User-Role", "MASTER"))
                .andExpect(header("X-Is-System-Master", "true"))
                .andRespond(withSuccess("""
                        {"success":true,"code":"OK","message":"성공"}
                        """, MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.getSlip(SLIP_ID))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INTERNAL_ERROR));
        server.verify();
    }
}
