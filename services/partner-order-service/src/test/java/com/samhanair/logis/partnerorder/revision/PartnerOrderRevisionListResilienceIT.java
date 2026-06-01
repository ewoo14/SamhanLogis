package com.samhanair.logis.partnerorder.revision;

import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.partnerorder.PartnerOrderServiceApplication;
import com.samhanair.logis.partnerorder.client.DcConfigClient;
import com.samhanair.logis.partnerorder.client.InventoryClient;
import com.samhanair.logis.partnerorder.client.PartnerAuthClient;
import com.samhanair.logis.partnerorder.client.ProductClient;
import com.samhanair.logis.partnerorder.client.SlipServiceClient;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import com.samhanair.logis.partnerorder.it.AbstractPostgresIT;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.repository.SlipPublishOutboxRepository;
import com.samhanair.logis.partnerorder.revision.domain.PartnerOrderRevision;
import com.samhanair.logis.partnerorder.revision.domain.PartnerOrderRevisionType;
import com.samhanair.logis.partnerorder.revision.repository.PartnerOrderRevisionRepository;
import com.samhanair.logis.partnerorder.vendor.client.PartnerLookupClient;
import com.samhanair.logis.partnerorder.vendor.client.ProductCatalogLookupClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 저장된 partner-order revision snapshot 의 스키마 진화 내성을 검증한다.
 *
 * <p>QA 의 {@code /revisions} 500 은 현재 스키마로 새로 캡처한 스냅샷이 아니라,
 * 과거 저장 스냅샷이 현재 {@link com.samhanair.logis.partnerorder.revision.snapshot.PartnerOrderSnapshot}
 * record 로 역직렬화되지 않는 조건에서 재현된다. 본 IT 는 세 후보를 분리한다:
 * unknown field(①), 알 수 없는 enum(②), 타입 불일치/손상 데이터(③).
 */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
@AutoConfigureMockMvc
class PartnerOrderRevisionListResilienceIT extends AbstractPostgresIT {

    private static final String ACCOUNT_ID = "30000000-0000-0000-0000-000000000301";

    @Autowired private MockMvc mockMvc;
    @Autowired private PartnerOrderRepository orderRepository;
    @Autowired private PartnerOrderRevisionRepository revisionRepository;
    @Autowired private SlipPublishOutboxRepository outboxRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    @MockBean private DcConfigClient dcConfigClient;
    @MockBean private ProductClient productClient;
    @MockBean private InventoryClient inventoryClient;
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private PartnerAuthClient partnerAuthClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ProductCatalogLookupClient catalogLookupClient;
    @MockBean private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUp() {
        outboxRepository.deleteAll();
        jdbcTemplate.update("DELETE FROM partner_order_revisions");
        jdbcTemplate.update("DELETE FROM partner_order_lines");
        orderRepository.deleteAll();

        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);
    }

    @Test
    @WithMockUser(username = "sales", roles = {"SALES"})
    @DisplayName("① unknown 필드가 추가된 snapshot 은 /revisions 200으로 유지된다")
    void listWithSummary_toleratesUnknownFieldsInStoredSnapshot() throws Exception {
        UUID orderId = saveOrder("2026/06/01-310");
        saveRevision(orderId, 1, snapshotWithUnknownFields("2026/06/01-310"));

        mockMvc.perform(get("/api/v1/partner-orders/{id}/revisions", orderId)
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].revisionNo").value(1))
                .andExpect(jsonPath("$.data[0].changeSummary.lineAdded").value(1));
    }

    @Test
    @WithMockUser(username = "sales", roles = {"SALES"})
    @DisplayName("② 폐기된 enum 값이 저장된 snapshot 도 /revisions 200으로 요약된다")
    void listWithSummary_toleratesUnknownEnumValuesInStoredSnapshot() throws Exception {
        UUID orderId = saveOrder("2026/06/01-311");
        saveRevision(orderId, 1, snapshotWithUnknownEnumValues("2026/06/01-311"));

        mockMvc.perform(get("/api/v1/partner-orders/{id}/revisions", orderId)
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].revisionNo").value(1))
                .andExpect(jsonPath("$.data[0].changeSummary.lineAdded").value(1));
    }

    @Test
    @WithMockUser(username = "sales", roles = {"SALES"})
    @DisplayName("③ 타입 불일치로 역직렬화 불가한 snapshot 은 해당 revision summary 만 null 처리한다")
    void listWithSummary_gracefullyReturnsRevisionWhenStoredSnapshotIsNotDeserializable() throws Exception {
        UUID orderId = saveOrder("2026/06/01-312");
        saveRevision(orderId, 1, snapshotWithTypeMismatch("2026/06/01-312"));

        mockMvc.perform(get("/api/v1/partner-orders/{id}/revisions", orderId)
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].revisionNo").value(1))
                .andExpect(jsonPath("$.data[0].changeSummary").value(nullValue()));
    }

    private UUID saveOrder(String orderNo) {
        PartnerOrder order = PartnerOrder.createFromConfirm(
                "P-REV-EVO", "1112233333", orderNo,
                "IT-REV-EVO-" + orderNo, BigDecimal.ZERO);
        order.addLine(PartnerOrderLine.create(
                UUID.randomUUID(),
                "AJ040RXH4BC1",
                "실외기",
                "homemulti",
                2,
                new BigDecimal("120000"),
                "스키마 진화 테스트"));
        return orderRepository.saveAndFlush(order).getId();
    }

    private void saveRevision(UUID orderId, int revisionNo, String snapshot) {
        revisionRepository.saveAndFlush(PartnerOrderRevision.of(
                orderId,
                revisionNo,
                PartnerOrderRevisionType.CREATE,
                null,
                "2026/06/01-" + (300 + revisionNo),
                snapshot,
                UUID.fromString(ACCOUNT_ID),
                "영업담당자",
                null));
    }

    private String snapshotWithUnknownFields(String orderNo) {
        return """
                {
                  "orderNo": "%s",
                  "partnerCode": "P-REV-EVO",
                  "bizCode": "1112233333",
                  "status": "DRAFT",
                  "slipPublishStatus": "NOT_REQUIRED",
                  "totalAmount": 240000,
                  "dueDate": "2026-06-10",
                  "memo": "unknown field",
                  "legacyHeaderField": "과거 헤더 필드",
                  "revisionCount": 0,
                  "lines": [
                    {
                      "productId": "00000000-0000-0000-0000-000000000111",
                      "modelName": "AJ040RXH4BC1",
                      "productName": "실외기",
                      "categoryKey": "homemulti",
                      "quantity": 2,
                      "priceVat": 120000,
                      "subtotal": 240000,
                      "remark": "unknown field",
                      "legacyLineField": "과거 라인 필드"
                    }
                  ]
                }
                """.formatted(orderNo);
    }

    private String snapshotWithUnknownEnumValues(String orderNo) {
        return """
                {
                  "orderNo": "%s",
                  "partnerCode": "P-REV-EVO",
                  "bizCode": "1112233333",
                  "status": "LEGACY_DONE",
                  "slipPublishStatus": "LEGACY_QUEUE",
                  "totalAmount": 240000,
                  "dueDate": "2026-06-10",
                  "memo": "unknown enum",
                  "revisionCount": 0,
                  "lines": [
                    {
                      "productId": "00000000-0000-0000-0000-000000000112",
                      "modelName": "AJ040RXH4BC1",
                      "productName": "실외기",
                      "categoryKey": "homemulti",
                      "quantity": 2,
                      "priceVat": 120000,
                      "subtotal": 240000,
                      "remark": "unknown enum"
                    }
                  ]
                }
                """.formatted(orderNo);
    }

    private String snapshotWithTypeMismatch(String orderNo) {
        return """
                {
                  "orderNo": "%s",
                  "partnerCode": "P-REV-EVO",
                  "bizCode": "1112233333",
                  "status": "DRAFT",
                  "slipPublishStatus": "NOT_REQUIRED",
                  "totalAmount": 240000,
                  "dueDate": "2026-06-10",
                  "memo": "type mismatch",
                  "revisionCount": 0,
                  "lines": [
                    {
                      "productId": "00000000-0000-0000-0000-000000000113",
                      "modelName": "AJ040RXH4BC1",
                      "productName": "실외기",
                      "categoryKey": "homemulti",
                      "quantity": {"legacy": 2},
                      "priceVat": 120000,
                      "subtotal": 240000,
                      "remark": "type mismatch"
                    }
                  ]
                }
                """.formatted(orderNo);
    }
}
