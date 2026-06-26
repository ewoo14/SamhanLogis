package com.samhanair.logis.dashboard.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.dashboard.DashboardServiceApplication;
import com.samhanair.logis.dashboard.client.AccountingClient;
import com.samhanair.logis.dashboard.client.InventoryClient;
import com.samhanair.logis.dashboard.client.PartnerClient;
import com.samhanair.logis.dashboard.client.PartnerOrderClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/** 앱 릴리스 버전 조회 및 admin CRUD 통합 테스트. */
@SpringBootTest(classes = DashboardServiceApplication.class)
@AutoConfigureMockMvc
class AppReleaseControllerIT extends AbstractPostgresIT {

    private static final String ACCOUNT_ID = "00000000-0000-0000-0000-000000000501";
    private static final String PAGE_CODE = "admin.app-release";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @MockBean
    private InventoryClient inventoryClient;
    @MockBean
    private AccountingClient accountingClient;
    @MockBean
    private PartnerOrderClient partnerOrderClient;
    @MockBean
    private PartnerClient partnerClient;
    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void cleanup() {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);
        lenient().when(inventoryClient.findStock(any(), any())).thenReturn(Optional.empty());
        lenient().when(accountingClient.sumSalesByPartner(any(), any(), any())).thenReturn(BigDecimal.ZERO);
        lenient().when(accountingClient.fetchPrometheusMetrics()).thenReturn("");
        lenient().when(partnerOrderClient.countOrdersByPartner(any(), any(), any())).thenReturn(0);
        lenient().when(partnerClient.findByCode(any())).thenReturn(Optional.empty());
        jdbcTemplate.update("DELETE FROM app_release");
    }

    @Test
    @DisplayName("GET /app/version은 인증 헤더 없이 current < minSupported 이면 CRITICAL을 반환한다")
    void publicVersion_whenCurrentBelowMinSupported_returnsCriticalWithoutAuth() throws Exception {
        insertRelease("DESKTOP", "2.0.0", "MAJOR", "강제 업데이트", "1.5.0");

        mockMvc.perform(get("/app/version")
                        .param("clientType", "DESKTOP")
                        .param("currentVersion", "1.4.9"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.latestVersion").value("2.0.0"))
                .andExpect(jsonPath("$.data.minSupportedVersion").value("1.5.0"))
                .andExpect(jsonPath("$.data.forceLevel").value("CRITICAL"))
                .andExpect(jsonPath("$.data.releaseNotes").value("강제 업데이트"));
    }

    @Test
    @DisplayName("GET /app/version은 current < latest 이면 릴리스 등록 forceLevel을 반환한다")
    void publicVersion_whenCurrentBelowLatest_returnsRegisteredForceLevel() throws Exception {
        insertRelease("WEB", "1.3.0", "MINOR", "권고 업데이트", "1.0.0");

        mockMvc.perform(get("/app/version")
                        .param("clientType", "WEB")
                        .param("currentVersion", "1.2.9"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.latestVersion").value("1.3.0"))
                .andExpect(jsonPath("$.data.forceLevel").value("MINOR"));
    }

    @Test
    @DisplayName("GET /app/version은 current >= latest 이면 NONE을 반환한다")
    void publicVersion_whenCurrentAtLatest_returnsNone() throws Exception {
        insertRelease("MOBILE", "1.0.0", "CRITICAL", "최신", "1.0.0");

        mockMvc.perform(get("/app/version")
                        .param("clientType", "MOBILE")
                        .param("currentVersion", "1.0.0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.latestVersion").value("1.0.0"))
                .andExpect(jsonPath("$.data.forceLevel").value("NONE"));
    }

    @Test
    @DisplayName("admin CRUD는 admin.app-release 7-action 권한으로 등록/조회/수정/소프트삭제한다")
    void adminCrud_usesAppReleasePageCode_andSoftDeletes() throws Exception {
        String createBody = """
                {
                  "clientType": "DESKTOP",
                  "version": "1.0.0",
                  "forceLevel": "MINOR",
                  "releaseNotes": "초기 릴리스",
                  "releasedAt": "2026-06-27T09:00:00",
                  "minSupportedVersion": "0.9.0"
                }
                """;

        String id = mockMvc.perform(withActor(post("/app/releases")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.clientType").value("DESKTOP"))
                .andExpect(jsonPath("$.data.version").value("1.0.0"))
                .andExpect(jsonPath("$.data.forceLevel").value("MINOR"))
                .andReturn()
                .getResponse()
                .getContentAsString()
                .replaceAll("(?s).*\"id\"\\s*:\\s*\"([^\"]+)\".*", "$1");

        mockMvc.perform(withActor(get("/app/releases").param("clientType", "DESKTOP")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].version").value("1.0.0"));

        String updateBody = """
                {
                  "clientType": "DESKTOP",
                  "version": "1.0.1",
                  "forceLevel": "MAJOR",
                  "releaseNotes": "수정 릴리스",
                  "releasedAt": "2026-06-27T10:00:00",
                  "minSupportedVersion": "1.0.0"
                }
                """;
        mockMvc.perform(withActor(put("/app/releases/{id}", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.version").value("1.0.1"))
                .andExpect(jsonPath("$.data.forceLevel").value("MAJOR"));

        mockMvc.perform(withActor(delete("/app/releases/{id}", id)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        Integer deletedRows = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM app_release WHERE id = ?::uuid AND is_deleted = TRUE",
                Integer.class,
                id);
        org.assertj.core.api.Assertions.assertThat(deletedRows).isEqualTo(1);

        when(dynamicPermissionClient.check(any(UUID.class), org.mockito.ArgumentMatchers.eq(PAGE_CODE),
                org.mockito.ArgumentMatchers.eq(PermissionAction.CREATE))).thenReturn(false);
        mockMvc.perform(withActor(post("/app/releases")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody)))
                .andExpect(status().isForbidden());
    }

    private void insertRelease(
            String clientType,
            String version,
            String forceLevel,
            String releaseNotes,
            String minSupportedVersion) {
        jdbcTemplate.update("""
                INSERT INTO app_release
                    (id, client_type, version, force_level, release_notes, released_at, min_supported_version,
                     created_at, created_by, modified_at, modified_by, is_deleted)
                VALUES
                    (gen_random_uuid(), ?, ?, ?, ?, '2026-06-27 09:00:00', ?,
                     NOW(), 'it', NOW(), 'it', FALSE)
                """, clientType, version, forceLevel, releaseNotes, minSupportedVersion);
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder withActor(
            org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request) {
        return request
                .header("X-User-Id", ACCOUNT_ID)
                .header("X-User-Role", "MASTER");
    }
}
