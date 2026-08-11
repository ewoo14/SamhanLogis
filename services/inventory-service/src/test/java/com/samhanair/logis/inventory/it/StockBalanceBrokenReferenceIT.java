package com.samhanair.logis.inventory.it;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.inventory.InventoryServiceApplication;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.inventory.domain.StockBalance;
import com.samhanair.logis.inventory.domain.Warehouse;
import com.samhanair.logis.inventory.domain.WarehouseType;
import com.samhanair.logis.inventory.repository.StockBalanceRepository;
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import com.samhanair.logis.security.InternalAuthProperties;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.client.RestClient;

/**
 * #1051 RED-A — 잔고 화면의 product-service 부분 응답 허용 계약.
 *
 * <p>Testcontainers PostgreSQL에 실제 balance를 저장하고 MockMvc → service → 실제
 * ProductClient → HTTP contract stub 왕복을 태운다. ProductClient 자체는 mock하지 않는다.
 */
@SpringBootTest(classes = InventoryServiceApplication.class)
@AutoConfigureMockMvc
@Import(StockBalanceBrokenReferenceIT.ProductClientTestConfiguration.class)
class StockBalanceBrokenReferenceIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private StockBalanceRepository stockBalanceRepository;

    @Autowired
    private WarehouseRepository warehouseRepository;

    @Autowired
    @Qualifier("productLookupHttpStub")
    private ProductLookupHttpStub productLookupHttpStub;

    @Test
    void balances_withTwoExistingProductsAndOneMissingReference_returnsAllRows() throws Exception {
        Warehouse warehouse = warehouseRepository.saveAndFlush(Warehouse.create(
                "QA-1051-" + UUID.randomUUID().toString().substring(0, 8),
                "#1051 격리 창고", WarehouseType.HEADQUARTERS, null, 900, "#1051 RED-A"));
        UUID existingA = UUID.randomUUID();
        UUID existingB = UUID.randomUUID();
        UUID missing = UUID.randomUUID();
        saveBalance(existingA, warehouse, 12);
        saveBalance(existingB, warehouse, 7);
        saveBalance(missing, warehouse, 4);

        productLookupHttpStub.respondWith(List.of(
                summary(existingA, "정상 품목 A", "MODEL-1051-A"),
                summary(existingB, "정상 품목 B", "MODEL-1051-B")));

        mockMvc.perform(get("/inventory/balances")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .param("warehouseId", warehouse.getId().toString())
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content", hasSize(3)))
                .andExpect(jsonPath("$.data.totalElements").value(3))
                .andExpect(jsonPath("$.data.content[*].availableQty").exists())
                .andExpect(jsonPath("$.data.content[?(@.productName=='제품 마스터 없음')]", hasSize(1)))
                .andExpect(jsonPath("$.data.content[?(@.productName=='제품 마스터 없음')].totalQty")
                        .value(hasItem(4)));
    }

    @Test
    void inbound_withMissingProduct_staysStrictAndReturnsNotFound() throws Exception {
        UUID missing = UUID.randomUUID();
        UUID warehouseId = warehouseRepository.findByCode("HQ-001")
                .orElseThrow(() -> new IllegalStateException("HQ-001 시드 누락"))
                .getId();
        productLookupHttpStub.respondWith(List.of());

        mockMvc.perform(post("/inventory/lots/inbound")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "productId", missing,
                                "warehouseId", warehouseId,
                                "quantity", 1,
                                "lotNo", "RED-B-1051",
                                "unitCost", 1000,
                                "sourceContext", Map.of(
                                        "sourceOperationId", UUID.randomUUID(),
                                        "slipId", UUID.randomUUID(),
                                        "slipRevision", 1)))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    private void saveBalance(UUID productId, Warehouse warehouse, int quantity) {
        StockBalance balance = StockBalance.create(productId, warehouse);
        balance.addInbound(quantity);
        stockBalanceRepository.saveAndFlush(balance);
    }

    private ProductSummary summary(UUID id, String name, String modelName) {
        return new ProductSummary(id, name, modelName, UUID.randomUUID(),
                new BigDecimal("1000"), "ACTIVE");
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class ProductClientTestConfiguration {

        @Bean
        ProductLookupHttpStub productLookupHttpStub(ObjectMapper objectMapper) {
            RestClient.Builder builder = RestClient.builder();
            MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
            InternalAuthProperties properties = new InternalAuthProperties();
            properties.setToken("test-internal-token");
            ProductClient client = new ProductClient(builder, properties, objectMapper);
            return new ProductLookupHttpStub(server, objectMapper, client);
        }

        @Bean
        @Primary
        ProductClient productClient(ProductLookupHttpStub stub) {
            return stub.client();
        }
    }

    static final class ProductLookupHttpStub {

        private final MockRestServiceServer server;
        private final ObjectMapper objectMapper;
        private final ProductClient client;

        private ProductLookupHttpStub(MockRestServiceServer server,
                                      ObjectMapper objectMapper,
                                      ProductClient client) {
            this.server = server;
            this.objectMapper = objectMapper;
            this.client = client;
        }

        private ProductClient client() {
            return client;
        }

        private void respondWith(List<ProductSummary> summaries) throws Exception {
            server.reset();
            server.expect(requestTo("http://product-service/products/internal/lookup"))
                    .andExpect(method(HttpMethod.POST))
                    .andExpect(header("X-Internal-Token", "test-internal-token"))
                    .andRespond(withSuccess(objectMapper.writeValueAsString(Map.of(
                            "success", true,
                            "code", "OK",
                            "message", "성공",
                            "data", summaries)), MediaType.APPLICATION_JSON));
        }
    }
}
