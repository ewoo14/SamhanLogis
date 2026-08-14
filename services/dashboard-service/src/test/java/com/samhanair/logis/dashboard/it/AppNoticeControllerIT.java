package com.samhanair.logis.dashboard.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
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
import java.nio.charset.StandardCharsets;
import java.util.Base64;
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
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

/** DEV-2 팝업공지 CRUD/활성조회/이미지 메타 통합 테스트. */
@SpringBootTest(classes = DashboardServiceApplication.class, properties = "SAMHAN_GATEWAY_ATTESTATION=test-attestation")
@AutoConfigureMockMvc
class AppNoticeControllerIT extends AbstractPostgresIT {

    private static final String ACCOUNT_ID = "00000000-0000-0000-0000-000000000501";
    private static final String PAGE_CODE = "dev.popup-notice";
    private static final String NOOP_NOTICE_IMAGE_URL = "about:blank#app-notice-noop";
    private static final byte[] ONE_PIXEL_PNG = Base64.getDecoder().decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=");

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
    void setup() {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);
        lenient().when(inventoryClient.findStock(any(), any())).thenReturn(Optional.empty());
        lenient().when(accountingClient.sumSalesByPartner(any(), any(), any())).thenReturn(BigDecimal.ZERO);
        lenient().when(accountingClient.fetchPrometheusMetrics()).thenReturn("");
        lenient().when(partnerOrderClient.countOrdersByPartner(any(), any(), any())).thenReturn(0);
        lenient().when(partnerClient.findByCode(any())).thenReturn(Optional.empty());
        jdbcTemplate.update("DELETE FROM app_notice_image");
        jdbcTemplate.update("DELETE FROM app_notice");
    }

    @Test
    @DisplayName("GET /app/notices/active는 인증 후 현재 KST 게시기간 내 active 공지만 이미지 순서대로 반환한다")
    void activeNotices_filtersCurrentPeriodAndOrdersImages() throws Exception {
        String activeId = insertNotice("게시 중", true,
                "2020-01-01 00:00:00", "2100-01-01 00:00:00", 2);
        insertImage(activeId, "app-notices/" + activeId + "/b.png", 2, "두번째");
        insertImage(activeId, "app-notices/" + activeId + "/a.png", 1, "첫번째");
        insertNotice("미게시", false, "2020-01-01 00:00:00", "2100-01-01 00:00:00", 1);
        insertNotice("기간 전", true, "2099-01-01 00:00:00", "2100-01-01 00:00:00", 1);
        insertNotice("기간 후", true, "2020-01-01 00:00:00", "2021-01-01 00:00:00", 1);

        mockMvc.perform(withActor(get("/app/notices/active")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].title").value("게시 중"))
                .andExpect(jsonPath("$.data[0].images[0].caption").value("첫번째"))
                .andExpect(jsonPath("$.data[0].images[0].displayOrder").value(1))
                .andExpect(jsonPath("$.data[0].images[0].imageUrl").value(NOOP_NOTICE_IMAGE_URL))
                .andExpect(jsonPath("$.data[0].images[0].id").doesNotExist())
                .andExpect(jsonPath("$.data[0].images[0].imageKey").doesNotExist())
                .andExpect(jsonPath("$.data[0].images[0].fileName").doesNotExist())
                .andExpect(jsonPath("$.data[0].images[1].caption").value("두번째"));
        assertThat(mockMvc.perform(withActor(get("/app/notices/active")))
                .andReturn()
                .getResponse()
                .getContentAsString(StandardCharsets.UTF_8))
                .doesNotContain("app-notices/");
    }

    @Test
    @DisplayName("admin CRUD는 dev.popup-notice 권한으로 등록/수정/소프트삭제한다")
    void adminCrud_usesPopupNoticePageCodeAndSoftDeletes() throws Exception {
        String createBody = """
                {
                  "title": "점검 안내",
                  "isActive": true,
                  "startAt": "2026-06-28T09:00:00",
                  "endAt": "2026-06-29T18:00:00",
                  "displayOrder": 10
                }
                """;

        String id = mockMvc.perform(withActor(post("/app/notices")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.title").value("점검 안내"))
                .andExpect(jsonPath("$.data.isActive").value(true))
                .andReturn()
                .getResponse()
                .getContentAsString(StandardCharsets.UTF_8)
                .replaceAll("(?s).*\"id\"\\s*:\\s*\"([^\"]+)\".*", "$1");

        mockMvc.perform(withActor(get("/app/notices")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].id").value(id));

        String updateBody = """
                {
                  "title": "점검 안내 수정",
                  "isActive": false,
                  "startAt": "2026-06-28T10:00:00",
                  "endAt": "2026-06-30T18:00:00",
                  "displayOrder": 3
                }
                """;
        mockMvc.perform(withActor(put("/app/notices/{id}", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.title").value("점검 안내 수정"))
                .andExpect(jsonPath("$.data.isActive").value(false))
                .andExpect(jsonPath("$.data.displayOrder").value(3));

        mockMvc.perform(withActor(delete("/app/notices/{id}", id)))
                .andExpect(status().isOk());

        Integer deletedRows = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM app_notice WHERE id = ?::uuid AND is_deleted = TRUE",
                Integer.class,
                id);
        assertThat(deletedRows).isEqualTo(1);

        when(dynamicPermissionClient.check(any(UUID.class),
                eq(PAGE_CODE),
                eq(PermissionAction.CREATE))).thenReturn(false);
        mockMvc.perform(withActor(post("/app/notices")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody)))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("이미지 업로드/순서변경/삭제는 메타데이터를 유지하고 presigned URL을 반환한다")
    void imageLifecycle_returnsPresignedUrlAndSoftDeletesImage() throws Exception {
        String noticeId = insertNotice("이미지 공지", true,
                "2026-06-28 00:00:00", "2026-06-29 00:00:00", 1);
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "banner.png",
                "image/png",
                ONE_PIXEL_PNG);

        String imageId = mockMvc.perform(withActor(multipart("/app/notices/{id}/images", noticeId)
                        .file(file)
                        .param("caption", "배너")
                        .param("displayOrder", "5")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.caption").value("배너"))
                .andExpect(jsonPath("$.data.id").exists())
                .andExpect(jsonPath("$.data.imageKey").doesNotExist())
                .andExpect(jsonPath("$.data.fileName").value("banner.png"))
                .andExpect(jsonPath("$.data.displayOrder").value(5))
                .andExpect(jsonPath("$.data.imageUrl").value(NOOP_NOTICE_IMAGE_URL))
                .andReturn()
                .getResponse()
                .getContentAsString(StandardCharsets.UTF_8)
                .replaceAll("(?s).*\"id\"\\s*:\\s*\"([^\"]+)\".*", "$1");

        mockMvc.perform(withActor(put("/app/notices/{noticeId}/images/order", noticeId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"id\":\"" + imageId + "\",\"displayOrder\":1}]")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].id").value(imageId))
                .andExpect(jsonPath("$.data[0].imageKey").doesNotExist())
                .andExpect(jsonPath("$.data[0].fileName").value("banner.png"))
                .andExpect(jsonPath("$.data[0].displayOrder").value(1));

        mockMvc.perform(withActor(get("/app/notices")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].images[0].id").value(imageId))
                .andExpect(jsonPath("$.data[0].images[0].imageKey").doesNotExist())
                .andExpect(jsonPath("$.data[0].images[0].fileName").value("banner.png"));

        mockMvc.perform(withActor(delete("/app/notices/{noticeId}/images/{imageId}", noticeId, imageId)))
                .andExpect(status().isOk());

        Integer deletedRows = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM app_notice_image WHERE id = ?::uuid AND is_deleted = TRUE",
                Integer.class,
                imageId);
        assertThat(deletedRows).isEqualTo(1);
    }

    @Test
    @DisplayName("admin 팝업공지 권한 거부는 VIEW/UPDATE/DELETE 및 이미지 action별로 403을 반환한다")
    void adminPermissionDenied_returnsForbiddenByAction() throws Exception {
        String noticeId = insertNotice("권한 공지", true,
                "2026-06-28 00:00:00", "2026-06-29 00:00:00", 1);
        String imageId = insertImage(noticeId, "app-notices/" + noticeId + "/deny.png", 1, "거부");
        String updateBody = """
                {
                  "title": "권한 공지 수정",
                  "isActive": true,
                  "startAt": "2026-06-28T09:00:00",
                  "endAt": "2026-06-29T18:00:00",
                  "displayOrder": 1
                }
                """;
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "deny.png",
                "image/png",
                ONE_PIXEL_PNG);

        when(dynamicPermissionClient.check(any(UUID.class), eq(PAGE_CODE), eq(PermissionAction.VIEW)))
                .thenReturn(false);
        mockMvc.perform(withActor(get("/app/notices")))
                .andExpect(status().isForbidden());

        when(dynamicPermissionClient.check(any(UUID.class), eq(PAGE_CODE), eq(PermissionAction.UPDATE)))
                .thenReturn(false);
        mockMvc.perform(withActor(put("/app/notices/{id}", noticeId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateBody)))
                .andExpect(status().isForbidden());
        mockMvc.perform(withActor(multipart("/app/notices/{id}/images", noticeId).file(file)))
                .andExpect(status().isForbidden());
        mockMvc.perform(withActor(put("/app/notices/{noticeId}/images/order", noticeId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"id\":\"" + imageId + "\",\"displayOrder\":1}]")))
                .andExpect(status().isForbidden());
        mockMvc.perform(withActor(delete("/app/notices/{noticeId}/images/{imageId}", noticeId, imageId)))
                .andExpect(status().isForbidden());

        when(dynamicPermissionClient.check(any(UUID.class), eq(PAGE_CODE), eq(PermissionAction.DELETE)))
                .thenReturn(false);
        mockMvc.perform(withActor(delete("/app/notices/{id}", noticeId)))
                .andExpect(status().isForbidden());
    }

    private String insertNotice(String title, boolean active, String startAt, String endAt, int displayOrder) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO app_notice
                    (id, title, is_active, start_at, end_at, display_order,
                     created_at, created_by, modified_at, modified_by, is_deleted)
                VALUES (?::uuid, ?, ?, ?::timestamp, ?::timestamp, ?,
                        NOW(), 'it', NOW(), 'it', FALSE)
                """, id, title, active, startAt, endAt, displayOrder);
        return id.toString();
    }

    private String insertImage(String noticeId, String imageKey, int displayOrder, String caption) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO app_notice_image
                    (id, notice_id, image_key, original_file_name, display_order, caption,
                     created_at, created_by, modified_at, modified_by, is_deleted)
                VALUES (?::uuid, ?::uuid, ?, ?, ?, ?,
                        NOW(), 'it', NOW(), 'it', FALSE)
                """, id, noticeId, imageKey, "notice.png", displayOrder, caption);
        return id.toString();
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder withActor(
            org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request) {
        return request
                .header("X-User-Id", ACCOUNT_ID)
                .header("X-Samhan-Gateway-Attestation", "test-attestation")
                .header("X-User-Role", "MASTER");
    }
}
