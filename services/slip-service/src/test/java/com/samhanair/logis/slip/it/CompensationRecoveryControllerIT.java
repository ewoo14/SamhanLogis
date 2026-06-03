package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.NotificationChatRoomClient;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.client.PartnerBlockClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ReceiptOcrClient;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.delivery.sms.SmsGateway;
import com.samhanair.logis.slip.repository.SerialCompensationFailureRepository;
import com.samhanair.logis.slip.web.CompensationRecoveryController;
import java.lang.reflect.Method;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * 보상 실패 복구 API 통합 테스트.
 *
 * <p>실 PostgreSQL/Flyway 스키마에서 목록 resolved 필터, createdAt DESC 정렬,
 * resolve 멱등 전이, UUID 비공개 응답, {@link RequirePermission} 가드를 검증한다.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
class CompensationRecoveryControllerIT extends AbstractPostgresIT {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_ROLE_HEADER = "X-User-Role";
    private static final String INVENTORY_ACCOUNT_ID = "10000000-0000-0000-0000-000000000410";
    private static final String CLEANUP_PREFIX = "2026/06/03-COMP-REC-";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private SerialCompensationFailureRepository failureRepository;

    @MockBean
    private ArologisDispatchClient arologisDispatchClient;

    @MockBean
    private InventoryClient inventoryClient;

    @MockBean
    private NotificationClient notificationClient;

    @MockBean
    private NotificationChatRoomClient notificationChatRoomClient;

    @MockBean
    private PartnerBlockClient partnerBlockClient;

    @MockBean
    private PartnerInternalClient partnerInternalClient;

    @MockBean
    private ProductClient productClient;

    @MockBean
    private ReceiptOcrClient receiptOcrClient;

    @MockBean
    private SmsGateway smsGateway;

    @MockBean
    private UserInternalClient userInternalClient;

    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void setUp() {
        cleanup();
        Mockito.lenient().when(userInternalClient.resolveFullName(any()))
                .thenReturn(Optional.of("담당자"));
    }

    @AfterEach
    void tearDown() {
        cleanup();
    }

    @Test
    void list_defaultUnresolved_filtersAndSortsByCreatedAtDesc_withoutSlipId() throws Exception {
        UUID oldUnresolved = insertFailure("001", false,
                LocalDateTime.of(2026, 6, 3, 9, 0),
                LocalDateTime.of(2026, 6, 3, 9, 1));
        UUID resolved = insertFailure("002", true,
                LocalDateTime.of(2026, 6, 3, 10, 0),
                LocalDateTime.of(2026, 6, 3, 10, 1));
        UUID newUnresolved = insertFailure("003", false,
                LocalDateTime.of(2026, 6, 3, 11, 0),
                LocalDateTime.of(2026, 6, 3, 11, 1));

        MvcResult result = mockMvc.perform(get("/api/v1/slips/compensation-failures")
                        .param("page", "0")
                        .param("size", "10")
                        .header(USER_ID_HEADER, INVENTORY_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "INVENTORY"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.content.length()").value(2))
                .andExpect(jsonPath("$.data.content[0].id").value(newUnresolved.toString()))
                .andExpect(jsonPath("$.data.content[0].slipNo").value(CLEANUP_PREFIX + "003"))
                .andExpect(jsonPath("$.data.content[0].resolved").value(false))
                .andExpect(jsonPath("$.data.content[1].id").value(oldUnresolved.toString()))
                .andExpect(jsonPath("$.data.content[1].slipNo").value(CLEANUP_PREFIX + "001"))
                .andReturn();

        String body = result.getResponse().getContentAsString();
        assertThat(body).doesNotContain("slipId");
        assertThat(body).doesNotContain(resolved.toString());
    }

    @Test
    void list_resolvedTrue_returnsOnlyResolvedFailures() throws Exception {
        insertFailure("010", false,
                LocalDateTime.of(2026, 6, 3, 9, 0),
                LocalDateTime.of(2026, 6, 3, 9, 1));
        UUID resolved = insertFailure("011", true,
                LocalDateTime.of(2026, 6, 3, 10, 0),
                LocalDateTime.of(2026, 6, 3, 10, 1));

        mockMvc.perform(get("/api/v1/slips/compensation-failures")
                        .param("resolved", "true")
                        .param("page", "0")
                        .param("size", "10")
                        .header(USER_ID_HEADER, INVENTORY_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "INVENTORY"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(resolved.toString()))
                .andExpect(jsonPath("$.data.content[0].resolved").value(true));
    }

    @Test
    void resolve_transitionsFalseToTrue_andIsIdempotent() throws Exception {
        UUID id = insertFailure("020", false,
                LocalDateTime.of(2026, 6, 3, 10, 0),
                LocalDateTime.of(2026, 6, 3, 10, 1));

        mockMvc.perform(patch("/api/v1/slips/compensation-failures/{id}/resolve", id)
                        .header(USER_ID_HEADER, INVENTORY_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "INVENTORY"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(id.toString()))
                .andExpect(jsonPath("$.data.resolved").value(true));

        assertThat(failureRepository.findById(id).orElseThrow().isResolved()).isTrue();

        mockMvc.perform(patch("/api/v1/slips/compensation-failures/{id}/resolve", id)
                        .header(USER_ID_HEADER, INVENTORY_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "INVENTORY"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(id.toString()))
                .andExpect(jsonPath("$.data.resolved").value(true));
    }

    @Test
    void resolve_missingFailure_returns404() throws Exception {
        mockMvc.perform(patch("/api/v1/slips/compensation-failures/{id}/resolve", UUID.randomUUID())
                        .header(USER_ID_HEADER, INVENTORY_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "INVENTORY"))
                .andExpect(status().isNotFound());
    }

    @Test
    void permissionGuard_blocksListAndResolveWhenInventoryPermissionDenied() throws Exception {
        UUID id = insertFailure("030", false,
                LocalDateTime.of(2026, 6, 3, 10, 0),
                LocalDateTime.of(2026, 6, 3, 10, 1));

        Mockito.when(dynamicPermissionClient.check(
                        any(UUID.class), eq("inventory.list"), eq(PermissionAction.VIEW)))
                .thenReturn(false);
        mockMvc.perform(get("/api/v1/slips/compensation-failures")
                        .header(USER_ID_HEADER, INVENTORY_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "INVENTORY"))
                .andExpect(status().isForbidden());

        Mockito.when(dynamicPermissionClient.check(
                        any(UUID.class), eq("inventory.list"), eq(PermissionAction.UPDATE)))
                .thenReturn(false);
        mockMvc.perform(patch("/api/v1/slips/compensation-failures/{id}/resolve", id)
                        .header(USER_ID_HEADER, INVENTORY_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "INVENTORY"))
                .andExpect(status().isForbidden());
    }

    @Test
    void controller_declaresInventoryListRequirePermissionGuards() throws Exception {
        Method list = CompensationRecoveryController.class.getMethod(
                "list",
                boolean.class,
                org.springframework.data.domain.Pageable.class);
        Method resolve = CompensationRecoveryController.class.getMethod("resolve", UUID.class);

        RequirePermission listPermission = list.getAnnotation(RequirePermission.class);
        RequirePermission resolvePermission = resolve.getAnnotation(RequirePermission.class);

        assertThat(listPermission).isNotNull();
        assertThat(listPermission.page()).isEqualTo("inventory.list");
        assertThat(listPermission.action()).isEqualTo(PermissionAction.VIEW);
        assertThat(resolvePermission).isNotNull();
        assertThat(resolvePermission.page()).isEqualTo("inventory.list");
        assertThat(resolvePermission.action()).isEqualTo(PermissionAction.UPDATE);
    }

    private UUID insertFailure(String suffix, boolean resolved,
                               LocalDateTime occurredAt, LocalDateTime createdAt) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO serial_compensation_failures (
                    id,
                    slip_id,
                    slip_no,
                    slip_type,
                    phase,
                    product_code,
                    attempted_operation,
                    failure_reason,
                    original_failure_reason,
                    resolved,
                    occurred_at,
                    created_at,
                    created_by,
                    modified_at,
                    modified_by,
                    deleted_at,
                    deleted_by,
                    is_deleted
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, false)
                """,
                id,
                UUID.randomUUID(),
                CLEANUP_PREFIX + suffix,
                "OUTBOUND",
                "ACCEPT_RESERVE",
                "AC-COMP-REC-" + suffix,
                "RELEASE_INSTANCES",
                "BusinessException: release 실패",
                "BusinessException: reserve 실패",
                resolved,
                occurredAt,
                createdAt,
                "CompensationRecoveryControllerIT");
        return id;
    }

    private void cleanup() {
        jdbcTemplate.update("""
                UPDATE serial_compensation_failures
                   SET is_deleted = true,
                       deleted_at = CURRENT_TIMESTAMP,
                       deleted_by = 'CompensationRecoveryControllerIT'
                 WHERE slip_no LIKE ?
                   AND is_deleted = false
                """, CLEANUP_PREFIX + "%");
    }
}
