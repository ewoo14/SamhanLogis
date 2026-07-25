package com.samhanair.logis.dashboard.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.assertj.core.api.Assertions.assertThat;
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
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

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
    @DisplayName("개발 버전 릴리스는 슬래시 날짜-번호를 그대로 등록·조회한다")
    void developmentVersion_isStoredAndReturnedWithoutSemverSubstitution() throws Exception {
        String createBody = """
                {
                  "clientType": "DESKTOP",
                  "version": "2026/07/25-1",
                  "forceLevel": "MINOR",
                  "releaseNotes": "개발 버전 릴리스",
                  "releasedAt": "2026-07-25T09:00:00",
                  "minSupportedVersion": "2026/07/24-9"
                }
                """;

        mockMvc.perform(withActor(post("/app/releases")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.version").value("2026/07/25-1"))
                .andExpect(jsonPath("$.data.minSupportedVersion").value("2026/07/24-9"));
    }

    @ParameterizedTest(name = "잘못된 개발 버전 {0}은 등록을 거부한다")
    @ValueSource(strings = {"2026-07-25-1", "2026/7/5-1", "0.1.0"})
    @DisplayName("릴리스 등록은 YYYY/MM/DD-번호가 아닌 version을 한국어로 거부한다")
    void adminCreate_rejectsNonDevelopmentVersionWithKoreanGuide(String version) throws Exception {
        String createBody = """
                {
                  "clientType": "DESKTOP",
                  "version": "%s",
                  "forceLevel": "MINOR",
                  "releaseNotes": "잘못된 버전",
                  "releasedAt": "2026-07-25T09:00:00",
                  "minSupportedVersion": "2026/07/24-1"
                }
                """.formatted(version);

        String body = mockMvc.perform(withActor(post("/app/releases")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody)))
                .andExpect(status().isBadRequest())
                .andReturn()
                .getResponse()
                .getContentAsString(StandardCharsets.UTF_8);

        assertThat(body)
                .contains("YYYY/MM/DD-{번호}")
                .contains("최신 버전")
                .doesNotContain("version");
    }

    @Test
    @DisplayName("빈 version 등록은 한국어 필수 입력 오류로 거부한다")
    void adminCreate_rejectsBlankVersionWithKoreanMessage() throws Exception {
        String createBody = """
                {
                  "clientType": "DESKTOP",
                  "version": "",
                  "forceLevel": "MINOR",
                  "releaseNotes": "빈 버전",
                  "releasedAt": "2026-07-25T09:00:00",
                  "minSupportedVersion": "2026/07/24-1"
                }
                """;

        String body = mockMvc.perform(withActor(post("/app/releases")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody)))
                .andExpect(status().isBadRequest())
                .andReturn()
                .getResponse()
                .getContentAsString(StandardCharsets.UTF_8);

        assertThat(body).contains("version").contains("버전은 필수입니다.");
    }

    @Test
    @DisplayName("기존 semver 릴리스는 새 형식 검증 도입 뒤에도 조회·판정을 유지한다")
    void publicVersion_preservesLegacySemverReleaseAfterDevelopmentVersionValidation() throws Exception {
        insertRelease("DESKTOP", "1.2.0", "MAJOR", "기존 semver 릴리스", "1.0.0");

        mockMvc.perform(get("/app/version")
                        .param("clientType", "DESKTOP")
                        .param("currentVersion", "1.1.0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.latestVersion").value("1.2.0"))
                .andExpect(jsonPath("$.data.minSupportedVersion").value("1.0.0"))
                .andExpect(jsonPath("$.data.forceLevel").value("MAJOR"));
    }

    @Test
    @DisplayName("기존 semver 릴리스는 값 유지 수정 시에도 편집 경로를 보존한다")
    void adminUpdate_preservesLegacySemverWhenValuesAreUnchanged() throws Exception {
        String id = insertRelease("DESKTOP", "1.2.0", "MINOR", "기존 semver 편집", "1.0.0", true);
        String updateBody = """
                {
                  "clientType": "DESKTOP",
                  "version": "1.2.0",
                  "forceLevel": "MAJOR",
                  "releaseNotes": "기존 semver 편집 보존",
                  "releasedAt": "2026-07-25T10:00:00",
                  "minSupportedVersion": "1.0.0"
                }
                """;

        mockMvc.perform(withActor(put("/app/releases/{id}", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.version").value("1.2.0"))
                .andExpect(jsonPath("$.data.minSupportedVersion").value("1.0.0"))
                .andExpect(jsonPath("$.data.forceLevel").value("MAJOR"));
    }

    @Test
    @DisplayName("전환기에는 최소 지원 버전으로 기존 semver를 등록하고 구버전 판정을 보존한다")
    void adminCreate_acceptsLegacySemverMinSupportedVersionDuringTransition() throws Exception {
        String createBody = """
                {
                  "clientType": "DESKTOP",
                  "version": "2026/07/25-5",
                  "forceLevel": "MINOR",
                  "releaseNotes": "전환기 semver 최소 지원 버전",
                  "releasedAt": "2026-07-25T09:00:00",
                  "minSupportedVersion": "0.1.0"
                }
                """;

        String id = mockMvc.perform(withActor(post("/app/releases")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.version").value("2026/07/25-5"))
                .andExpect(jsonPath("$.data.minSupportedVersion").value("0.1.0"))
                .andReturn()
                .getResponse()
                .getContentAsString(StandardCharsets.UTF_8)
                .replaceAll(".*\\\"id\\\":\\\"([^\\\"]+)\\\".*", "$1");

        mockMvc.perform(withActor(post("/app/releases/{id}/publish", id)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/app/version")
                        .param("clientType", "DESKTOP")
                        .param("currentVersion", "0.1.0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.minSupportedVersion").value("0.1.0"))
                .andExpect(jsonPath("$.data.forceLevel").value("MINOR"));
    }

    @Test
    @DisplayName("앱별 CRITICAL 릴리스는 다른 모바일 앱의 버전 판정을 바꾸지 않는다")
    void publicVersion_isolatedByExplicitAppIdentity() throws Exception {
        insertRelease("AROLOGIS_MOBILE", "1.1.0", "CRITICAL", "아로로지스 모바일 긴급 업데이트", "1.0.0");
        insertRelease("SAMHAN_MOBILE", "0.5.0", "MINOR", "삼한 모바일 현재 릴리스", "0.5.0");
        insertRelease("SAMHAN_MOBILE_STAFF", "0.4.0", "MINOR", "직원 모바일 현재 릴리스", "0.4.0");

        mockMvc.perform(get("/app/version")
                        .param("clientType", "AROLOGIS_MOBILE")
                        .param("currentVersion", "1.0.0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.forceLevel").value("CRITICAL"));

        mockMvc.perform(get("/app/version")
                        .param("clientType", "SAMHAN_MOBILE")
                        .param("currentVersion", "0.5.0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.forceLevel").value("NONE"));

        mockMvc.perform(get("/app/version")
                        .param("clientType", "SAMHAN_MOBILE_STAFF")
                        .param("currentVersion", "0.4.0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.forceLevel").value("NONE"));
    }

    @Test
    @DisplayName("마이그레이션 뒤 기존 DESKTOP 릴리스는 삼한 데스크톱 정책으로 계속 조회된다")
    void publicVersion_preservesLegacyDesktopIdentityAfterIdentityMigration() throws Exception {
        insertRelease("DESKTOP", "9.9.8", "CRITICAL", "기존 삼한 데스크톱 릴리스", "9.9.0");
        insertRelease("AROLOGIS_DESKTOP", "1.0.1", "CRITICAL", "아로로지스 데스크톱 릴리스", "1.0.0");

        mockMvc.perform(get("/app/version")
                        .param("clientType", "DESKTOP")
                        .param("currentVersion", "9.9.0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.latestVersion").value("9.9.8"))
                .andExpect(jsonPath("$.data.releaseNotes").value("기존 삼한 데스크톱 릴리스"));
    }

    @Test
    @DisplayName("구버전 MOBILE 식별자는 신규 앱 릴리스 정책을 잘못 적용하지 않고 확인 실패로 끝난다")
    void publicVersion_legacyMobileIdentifierFailsOpenWhenNewIdentityReleaseExists() throws Exception {
        insertRelease("AROLOGIS_MOBILE", "1.1.0", "CRITICAL", "아로로지스 모바일 긴급 업데이트", "1.0.0");

        mockMvc.perform(get("/app/version")
                        .param("clientType", "MOBILE")
                        .param("currentVersion", "0.5.0"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("POST /app/releases 신규 등록은 미발행 상태이며 publish 전까지 /app/version에 반영되지 않는다")
    void adminCreate_registersUnpublishedRelease_untilExplicitPublish() throws Exception {
        String createBody = """
                {
                  "clientType": "DESKTOP",
                  "version": "2026/07/26-1",
                  "forceLevel": "MAJOR",
                  "releaseNotes": "staged release",
                  "releasedAt": "2026-06-27T12:00:00",
                  "minSupportedVersion": "2026/07/25-10"
                }
                """;

        String id = mockMvc.perform(withActor(post("/app/releases")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.version").value("2026/07/26-1"))
                .andExpect(jsonPath("$.data.isPublished").value(false))
                .andReturn()
                .getResponse()
                .getContentAsString(StandardCharsets.UTF_8)
                .replaceAll("(?s).*\"id\"\\s*:\\s*\"([^\"]+)\".*", "$1");

        mockMvc.perform(get("/app/version")
                        .param("clientType", "DESKTOP")
                        .param("currentVersion", "2026/07/25-10"))
                .andExpect(status().isNotFound());

        mockMvc.perform(withActor(post("/app/releases/{id}/publish", id)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isPublished").value(true));

        mockMvc.perform(get("/app/version")
                        .param("clientType", "DESKTOP")
                        .param("currentVersion", "2026/07/25-10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.latestVersion").value("2026/07/26-1"))
                .andExpect(jsonPath("$.data.forceLevel").value("MAJOR"));
    }

    @Test
    @DisplayName("GET /app/version은 published 최신만 반영하고 publish/unpublish가 노출 상태를 전환한다")
    void publicVersion_usesPublishedLatestOnly_andPublishToggleControlsVisibility() throws Exception {
        insertRelease("WEB", "1.0.0", "MINOR", "배포 릴리스", "0.9.0", true);
        String unpublishedId = insertRelease("WEB", "2.0.0", "MAJOR", "테스트 릴리스", "1.0.0", false);

        mockMvc.perform(get("/app/version")
                        .param("clientType", "WEB")
                        .param("currentVersion", "0.8.0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.latestVersion").value("1.0.0"))
                .andExpect(jsonPath("$.data.releaseNotes").value("배포 릴리스"));

        mockMvc.perform(withActor(post("/app/releases/{id}/publish", unpublishedId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.version").value("2.0.0"))
                .andExpect(jsonPath("$.data.isPublished").value(true));

        mockMvc.perform(get("/app/version")
                        .param("clientType", "WEB")
                        .param("currentVersion", "1.0.0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.latestVersion").value("2.0.0"))
                .andExpect(jsonPath("$.data.releaseNotes").value("테스트 릴리스"));

        mockMvc.perform(withActor(post("/app/releases/{id}/unpublish", unpublishedId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isPublished").value(false));

        mockMvc.perform(get("/app/version")
                        .param("clientType", "WEB")
                        .param("currentVersion", "1.0.0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.latestVersion").value("1.0.0"));

        when(dynamicPermissionClient.check(any(UUID.class), org.mockito.ArgumentMatchers.eq(PAGE_CODE),
                org.mockito.ArgumentMatchers.eq(PermissionAction.UPDATE))).thenReturn(false);
        mockMvc.perform(withActor(post("/app/releases/{id}/publish", unpublishedId)))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("GET /app/version은 clientType 누락 시 내부 타입명을 노출하지 않는 400을 반환한다")
    void publicVersion_whenClientTypeMissing_returnsInvalidInputWithoutTypeLeak() throws Exception {
        String body = mockMvc.perform(get("/app/version")
                        .param("currentVersion", "1.0.0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andReturn()
                .getResponse()
                .getContentAsString(StandardCharsets.UTF_8);

        assertThat(body)
                .contains("필수 요청 파라미터가 누락되었습니다.")
                .doesNotContain("AppClientType")
                .doesNotContain("clientType");
    }

    @Test
    @DisplayName("admin CRUD는 admin.app-release 7-action 권한으로 등록/조회/수정/소프트삭제한다")
    void adminCrud_usesAppReleasePageCode_andSoftDeletes() throws Exception {
        String createBody = """
                {
                  "clientType": "DESKTOP",
                  "version": "2026/07/25-2",
                  "forceLevel": "MINOR",
                  "releaseNotes": "초기 릴리스",
                  "releasedAt": "2026-06-27T09:00:00",
                  "minSupportedVersion": "2026/07/25-1"
                }
                """;

        String id = mockMvc.perform(withActor(post("/app/releases")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.clientType").value("DESKTOP"))
                .andExpect(jsonPath("$.data.version").value("2026/07/25-2"))
                .andExpect(jsonPath("$.data.forceLevel").value("MINOR"))
                .andReturn()
                .getResponse()
                .getContentAsString(StandardCharsets.UTF_8)
                .replaceAll("(?s).*\"id\"\\s*:\\s*\"([^\"]+)\".*", "$1");

        mockMvc.perform(withActor(get("/app/releases").param("clientType", "DESKTOP")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].version").value("2026/07/25-2"));

        String updateBody = """
                {
                  "clientType": "DESKTOP",
                  "version": "2026/07/25-3",
                  "forceLevel": "MAJOR",
                  "releaseNotes": "수정 릴리스",
                  "releasedAt": "2026-06-27T10:00:00",
                  "minSupportedVersion": "2026/07/25-2"
                }
                """;
        mockMvc.perform(withActor(put("/app/releases/{id}", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.version").value("2026/07/25-3"))
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

    @Test
    @DisplayName("동시 POST 중복 릴리스는 200/409로 귀결되고 SQL 제약명을 노출하지 않는다")
    void adminCreate_whenDuplicateRace_returnsConflictWithoutSqlLeak() throws Exception {
        String createBody = """
                {
                  "clientType": "DESKTOP",
                  "version": "2026/07/27-1",
                  "forceLevel": "MINOR",
                  "releaseNotes": "동시 등록",
                  "releasedAt": "2026-06-27T11:00:00",
                  "minSupportedVersion": "2026/07/26-1"
                }
                """;
        installAppReleaseInsertDelayTrigger();

        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            CountDownLatch start = new CountDownLatch(1);
            Callable<MvcResult> request = () -> {
                assertThat(start.await(5, TimeUnit.SECONDS)).isTrue();
                return mockMvc.perform(withActor(post("/app/releases")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(createBody)))
                        .andReturn();
            };

            List<Future<MvcResult>> futures = List.of(executor.submit(request), executor.submit(request));
            start.countDown();
            List<Integer> statuses = new ArrayList<>();
            List<String> bodies = new ArrayList<>();
            for (Future<MvcResult> future : futures) {
                MvcResult result = future.get(5, TimeUnit.SECONDS);
                statuses.add(result.getResponse().getStatus());
                bodies.add(result.getResponse().getContentAsString(StandardCharsets.UTF_8));
            }
            Collections.sort(statuses);

            assertThat(statuses).containsExactly(200, 409);
            assertThat(String.join("\n", bodies))
                    .doesNotContain("ux_app_release_client_type_version_active")
                    .doesNotContain("client_type")
                    .doesNotContain("duplicate key value")
                    .doesNotContain("DataIntegrityViolationException");
        } finally {
            dropAppReleaseInsertDelayTrigger();
            executor.shutdownNow();
        }
    }

    @Test
    @DisplayName("없는 앱 릴리스 수정은 응답 메시지에 UUID를 노출하지 않는다")
    void adminUpdate_whenReleaseNotFound_doesNotExposeUuid() throws Exception {
        UUID missingId = UUID.fromString("00000000-0000-0000-0000-000000009999");
        String updateBody = """
                {
                  "clientType": "DESKTOP",
                  "version": "2026/07/25-4",
                  "forceLevel": "MAJOR",
                  "releaseNotes": "수정 릴리스",
                  "releasedAt": "2026-06-27T10:00:00",
                  "minSupportedVersion": "2026/07/25-3"
                }
                """;

        String body = mockMvc.perform(withActor(put("/app/releases/{id}", missingId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateBody)))
                .andExpect(status().isNotFound())
                .andReturn()
                .getResponse()
                .getContentAsString(StandardCharsets.UTF_8);

        assertThat(body)
                .contains("앱 릴리스를 찾을 수 없습니다.")
                .doesNotContain(missingId.toString());
    }

    private void insertRelease(
            String clientType,
            String version,
            String forceLevel,
            String releaseNotes,
            String minSupportedVersion) {
        insertRelease(clientType, version, forceLevel, releaseNotes, minSupportedVersion, true);
    }

    private String insertRelease(
            String clientType,
            String version,
            String forceLevel,
            String releaseNotes,
            String minSupportedVersion,
            boolean isPublished) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO app_release
                    (id, client_type, version, force_level, release_notes, released_at, min_supported_version, is_published,
                     created_at, created_by, modified_at, modified_by, is_deleted)
                VALUES
                    (?::uuid, ?, ?, ?, ?, '2026-06-27 09:00:00', ?, ?,
                     NOW(), 'it', NOW(), 'it', FALSE)
                """, id, clientType, version, forceLevel, releaseNotes, minSupportedVersion, isPublished);
        return id.toString();
    }

    private void installAppReleaseInsertDelayTrigger() {
        jdbcTemplate.execute("""
                CREATE OR REPLACE FUNCTION app_release_it_sleep_before_insert()
                RETURNS trigger AS $$
                BEGIN
                    PERFORM pg_sleep(0.5);
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql
                """);
        jdbcTemplate.execute("""
                CREATE TRIGGER app_release_it_sleep_before_insert
                BEFORE INSERT ON app_release
                FOR EACH ROW
                EXECUTE FUNCTION app_release_it_sleep_before_insert()
                """);
    }

    private void dropAppReleaseInsertDelayTrigger() {
        jdbcTemplate.execute("DROP TRIGGER IF EXISTS app_release_it_sleep_before_insert ON app_release");
        jdbcTemplate.execute("DROP FUNCTION IF EXISTS app_release_it_sleep_before_insert()");
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder withActor(
            org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request) {
        return request
                .header("X-User-Id", ACCOUNT_ID)
                .header("X-User-Role", "MASTER");
    }
}
