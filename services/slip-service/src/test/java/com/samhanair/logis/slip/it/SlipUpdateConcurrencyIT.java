package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/** RED-B: 같은 updatedAt을 가진 두 direct PUT의 실제 동시 수정은 하나만 성공해야 한다. */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
class SlipUpdateConcurrencyIT extends AbstractPostgresIT {

    private static final String USER_ID = "00000000-0000-0000-0000-000000000052";
    private static final UUID PRODUCT_ID = UUID.fromString("00000000-0000-0000-0000-000000000823");

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;
    @MockBean ProductClient productClient;

    @Test
    void 같은_버전으로_동시_put하면_정확히_하나만_성공하고_패자는_409다() throws Exception {
        lenient().when(productClient.requireExists(PRODUCT_ID))
                .thenReturn(new ProductSummary(PRODUCT_ID, "동시성 품목", "CC", UUID.randomUUID(),
                        new BigDecimal("120000"), "ACTIVE"));
        String slipId = createSlip();
        String updatedAt = detail(slipId).path("updatedAt").asText();
        CountDownLatch lookups = new CountDownLatch(2);
        CountDownLatch release = new CountDownLatch(1);
        when(productClient.lookup(anyList())).thenAnswer(invocation -> {
            lookups.countDown();
            assertThat(lookups.await(10, TimeUnit.SECONDS)).isTrue();
            assertThat(release.await(10, TimeUnit.SECONDS)).isTrue();
            return List.of(new ProductSummary(PRODUCT_ID, "동시성 품목", "CC", UUID.randomUUID(),
                    new BigDecimal("120000"), "ACTIVE"));
        });
        Map<String, Object> first = updateBody(updatedAt, "동시수정-A");
        Map<String, Object> second = updateBody(updatedAt, "동시수정-B");

        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<Integer> a = executor.submit(() -> doPut(slipId, first));
            Future<Integer> b = executor.submit(() -> doPut(slipId, second));
            assertThat(lookups.await(10, TimeUnit.SECONDS)).isTrue();
            release.countDown();
            List<Integer> statuses = List.of(a.get(15, TimeUnit.SECONDS), b.get(15, TimeUnit.SECONDS));
            assertThat(statuses).containsExactlyInAnyOrder(200, 409);
        } finally {
            release.countDown();
            executor.shutdownNow();
        }
    }

    private String createSlip() throws Exception {
        Map<String, Object> line = new HashMap<>();
        line.put("productId", PRODUCT_ID.toString());
        line.put("productName", "동시성 품목");
        line.put("modelName", "CC");
        line.put("quantity", 1);
        line.put("unitPrice", 120000);
        Map<String, Object> body = new HashMap<>();
        body.put("slipType", "INBOUND");
        body.put("slipDate", LocalDate.now().toString());
        body.put("destinationWarehouseId", UUID.randomUUID().toString());
        body.put("partnerId", UUID.randomUUID().toString());
        body.put("partnerName", "동시성 거래처");
        body.put("memo", "S30-1123");
        body.put("lines", List.of(line));
        MvcResult result = mockMvc.perform(post("/slips")
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated()).andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).path("data").path("id").asText();
    }

    private JsonNode detail(String id) throws Exception {
        MvcResult result = mockMvc.perform(get("/slips/{id}", id)
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk()).andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).path("data");
    }

    private int doPut(String id, Map<String, Object> body) throws Exception {
        return mockMvc.perform(put("/slips/{id}", id)
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Name", "동시성 사용자")
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn().getResponse().getStatus();
    }

    private Map<String, Object> updateBody(String updatedAt, String partnerName) {
        Map<String, Object> line = new HashMap<>();
        line.put("productId", PRODUCT_ID.toString());
        line.put("productName", "동시성 품목");
        line.put("modelName", "CC");
        line.put("quantity", 1);
        line.put("unitPrice", "120000");
        Map<String, Object> body = new HashMap<>();
        body.put("updatedAt", updatedAt);
        body.put("partnerName", partnerName);
        body.put("memo", "S30-1123");
        body.put("lines", List.of(line));
        body.put("lineIdContract", true);
        return body;
    }
}
