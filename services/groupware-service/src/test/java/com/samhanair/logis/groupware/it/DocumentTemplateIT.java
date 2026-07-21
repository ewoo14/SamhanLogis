package com.samhanair.logis.groupware.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.groupware.GroupwareServiceApplication;
import com.samhanair.logis.groupware.client.UserClient;
import com.samhanair.logis.groupware.domain.DocumentPayload;
import com.samhanair.logis.groupware.domain.DocumentTemplate;
import com.samhanair.logis.groupware.domain.DocumentTemplateStatus;
import com.samhanair.logis.groupware.dto.DocumentTemplateCreateRequest;
import com.samhanair.logis.groupware.repository.DocumentTemplateRepository;
import com.samhanair.logis.groupware.repository.DocumentTemplateRevisionRepository;
import com.samhanair.logis.groupware.service.DocumentTemplateService;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.MediaType;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

/** DS-2 실 PostgreSQL Flyway/JPA/HTTP 계약 검증. */
@SpringBootTest(classes = GroupwareServiceApplication.class)
@AutoConfigureMockMvc
@WithMockUser(username = "document-template-it", authorities = {"ROLE_MANAGER"})
class DocumentTemplateIT extends AbstractPostgresIT {

    private static final String ACTOR = "document-template-it";
    private static final String CANONICAL_ARTIFACT = "/document-template-fixtures/canonical-active-response.json";
    /** 정규 아티팩트용 고정 placeholder id (실제 응답 id 는 서버 생성 UUID, 대조 시 이 값으로 정규화). */
    private static final String CANONICAL_ID = "00000000-0000-0000-0000-000000000845";

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private DocumentTemplateRepository repository;
    @Autowired private DocumentTemplateRevisionRepository revisionRepository;
    @Autowired private DocumentTemplateService service;
    @Autowired private JdbcTemplate jdbcTemplate;

    @MockBean private UserClient userClient;
    @MockBean private DynamicPermissionClient dynamicPermissionClient;
    @SpyBean private DocumentTemplateService serviceSpy;

    @BeforeEach
    void setUp() {
        // revision 이력은 운영 transaction에서 삭제하지 않는다. IT 격리 fixture만 TRUNCATE로 초기화한다.
        jdbcTemplate.execute("TRUNCATE TABLE document_template_revisions, document_templates RESTART IDENTITY CASCADE");
        repository.deleteAll();
        repository.flush();
        lenient().when(dynamicPermissionClient.check(any(UUID.class), any(String.class), any())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canView(any(), any())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(any(), any())).thenReturn(true);
    }

    @AfterEach
    void tearDown() {
        jdbcTemplate.execute("TRUNCATE TABLE document_template_revisions, document_templates RESTART IDENTITY CASCADE");
        repository.deleteAll();
        repository.flush();
    }

    @Test
    void documentTypeColumns_areExactly70Characters() {
        assertThat(columnLength("approval_lines", "document_type")).isEqualTo(70);
        assertThat(columnLength("document_templates", "doc_type")).isEqualTo(70);
    }

    @Test
    void documentTemplate_docType_accepts41And70_andRejects71With70Message() {
        assertThat(service.create(request("D".repeat(41), "41자 양식")).docType()).hasSize(41);
        assertThat(service.create(request("E".repeat(70), "70자 양식")).docType()).hasSize(70);

        assertThatThrownBy(() -> service.create(request("F".repeat(71), "71자 양식")))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("70");
    }

    @Test
    void revisionHistory_isAppendedOnCreateAndDatabaseRejectsUpdateAndDelete() {
        UUID templateId = service.create(request("GROUPWARE_APPEND_ONLY", "append-only 양식")).id();

        var revision = revisionRepository.findByTemplateIdAndRevisionAndIsDeletedFalse(templateId, 1).orElseThrow();
        assertThat(revision.getDocument().bands()).isNotEmpty();

        assertThatThrownBy(() -> jdbcTemplate.update(
                "UPDATE document_template_revisions SET document=?::jsonb WHERE id=?",
                "{}", revision.getId()))
                .as("revision UPDATE는 append-only trigger에 의해 차단되어야 함")
                .isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> jdbcTemplate.update(
                "DELETE FROM document_template_revisions WHERE id=?", revision.getId()))
                .as("revision DELETE는 append-only trigger에 의해 차단되어야 함")
                .isInstanceOf(RuntimeException.class);

        assertThat(revisionRepository.findById(revision.getId())).isPresent();
        assertThat(revisionRepository.findById(revision.getId()).orElseThrow().getRevision()).isEqualTo(1);
    }

    @Test
    void httpDocType_41to70_passesValidationGate_and71Rejected() throws Exception {
        // 위 accepts41And70 테스트는 service.create() 직접 호출이라 @Valid(DTO @Size) 를 우회한다.
        // 실 HTTP 경로를 태워야 41–70자 GROUPWARE_${code} 레이아웃 저장이 실제 가능한지 검증된다
        // (#848 store ②·DTO @Size(40) 게이트 회귀 차단·[[feedback_live_qa_penetrates_it_masking]]).
        String hdr = "40000000-0000-0000-0000-000000000845";
        String docType41 = "N".repeat(41);
        mvc.perform(post("/admin/groupware/document-templates").header("X-User-Id", hdr)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request(docType41, "HTTP 41자"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.docType").value(docType41));
        String docType70 = "O".repeat(70);
        mvc.perform(post("/admin/groupware/document-templates").header("X-User-Id", hdr)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request(docType70, "HTTP 70자"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.docType").value(docType70));
        mvc.perform(post("/admin/groupware/document-templates").header("X-User-Id", hdr)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request("P".repeat(71), "HTTP 71자"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("docType: 문서 유형(docType)은 70자 이하여야 합니다"));

        // update(PUT) DTO 게이트도 동일. DRAFT 는 docType 변경 불가(422)라 동일 65자 docType 으로 rename → 200.
        String docType65 = "Q".repeat(65);
        String created = mvc.perform(post("/admin/groupware/document-templates").header("X-User-Id", hdr)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request(docType65, "PUT 시드"))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        UUID id = UUID.fromString(objectMapper.readTree(created).path("data").path("id").asText());
        mvc.perform(put("/admin/groupware/document-templates/{id}", id).header("X-User-Id", hdr)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request(docType65, "PUT 65자 rename"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.docType").value(docType65));
        mvc.perform(put("/admin/groupware/document-templates/{id}", id).header("X-User-Id", hdr)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request("Z".repeat(71), "PUT 71자"))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void httpCrudActivationAndJsonbRoundTrip() throws Exception {
        DocumentTemplateCreateRequest request = request("GROUPWARE_ROUNDTRIP", "왕복 양식");
        String created = mvc.perform(post("/admin/groupware/document-templates")
                        .header("X-User-Id", "40000000-0000-0000-0000-000000000845")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("DRAFT"))
                .andExpect(jsonPath("$.data.revision").value(1))
                .andExpect(jsonPath("$.data.lock_version").doesNotExist())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        UUID id = UUID.fromString(objectMapper.readTree(created).path("data").path("id").asText());

        mvc.perform(post("/admin/groupware/document-templates/{id}/activate", id)
                        .header("X-User-Id", "40000000-0000-0000-0000-000000000845"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("ACTIVE"));
        String active = mvc.perform(get("/groupware/document-templates/active")
                        .param("docType", "GROUPWARE_ROUNDTRIP"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.document.paper").value("A4_PORTRAIT"))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode expected = objectMapper.valueToTree(request.document());
        JsonNode actual = objectMapper.readTree(active).path("data").path("document");
        assertThat(actual).isEqualTo(expected);

        // 라운드트립 stage-1(BE 소유): active GET 응답 data 를 실제로 캡처해 committed canonical artifact
        // 와 대조한다. 휘발성 id 만 정규화하고 나머지(id 존재/status/revision/docType/name/schemaVersion/
        // document)는 전부 faithful 하게 일치해야 한다. FE(stage-2)는 이 artifact 를 parse→렌더한다.
        JsonNode liveData = objectMapper.readTree(active).path("data");
        assertThat(liveData.path("id").asText()).as("응답 id").isNotBlank();
        UUID.fromString(liveData.path("id").asText());
        assertThat(liveData.path("status").asText()).isEqualTo("ACTIVE");
        ObjectNode normalized = (ObjectNode) liveData.deepCopy();
        normalized.put("id", CANONICAL_ID);
        writeCanonicalActual(normalized);
        assertThat((JsonNode) normalized)
                .as("active GET data 는 committed canonical artifact 와 정확히 일치(휘발성 id 정규화)")
                .isEqualTo(readCanonicalArtifact());

        mvc.perform(put("/admin/groupware/document-templates/{id}", id)
                        .header("X-User-Id", "40000000-0000-0000-0000-000000000845")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(delete("/admin/groupware/document-templates/{id}", id)
                        .header("X-User-Id", "40000000-0000-0000-0000-000000000845"))
                .andExpect(status().isOk());
        assertThat(jdbcTemplate.queryForObject(
                "SELECT is_deleted FROM document_templates WHERE id=?", Boolean.class, id)).isTrue();
        assertThat(repository.findAll()).isEmpty();
        assertThat(service.create(request("GROUPWARE_ROUNDTRIP", "왕복 양식")).id()).isNotEqualTo(id);
    }

    @Test
    void onlyOneActiveAndActivationIsIdempotent() {
        UUID first = service.create(request("GROUPWARE_SINGLETON", "첫 양식")).id();
        UUID second = service.create(request("GROUPWARE_SINGLETON", "둘째 양식")).id();

        service.activate(first, ACTOR);
        service.activate(first, ACTOR);
        service.activate(second, ACTOR);

        assertThat(repository.findByDocTypeAndIsDeletedFalse("GROUPWARE_SINGLETON"))
                .filteredOn(template -> template.getStatus() == DocumentTemplateStatus.ACTIVE)
                .singleElement()
                .extracting(DocumentTemplate::getId)
                .isEqualTo(second);
    }

    @Test
    void bulkDemotion_incrementsLockAndAudit_andStaleEntityReturnsConflict() {
        UUID first = service.create(request("GROUPWARE_LOCK", "첫 양식")).id();
        UUID second = service.create(request("GROUPWARE_LOCK", "둘째 양식")).id();
        service.activate(first, "actor-a");
        DocumentTemplate stale = repository.findById(first).orElseThrow();

        service.activate(second, "actor-b");
        DocumentTemplate demoted = repository.findById(first).orElseThrow();
        assertThat(demoted.getStatus()).isEqualTo(DocumentTemplateStatus.DRAFT);
        assertThat(demoted.getLockVersion()).isGreaterThan(stale.getLockVersion());
        assertThat(demoted.getModifiedBy()).isEqualTo("actor-b");
        assertThat(demoted.getModifiedAt()).isNotNull();

        assertThat(org.assertj.core.api.Assertions.catchThrowable(() -> repository.saveAndFlush(
                        stale.deactivate())))
                .isInstanceOf(ObjectOptimisticLockingFailureException.class);
    }

    @Test
    void concurrentActivation_sameId_allowsSuccessOrTypedConflict() throws Exception {
        UUID id = service.create(request("GROUPWARE_SAME_ID", "동일 대상")).id();
        List<ActivationOutcome> outcomes = runConcurrentActivations(List.of(id, id));

        assertThat(outcomes).anyMatch(ActivationOutcome::success);
        assertTypedConflictsOnly(outcomes);
    }

    @Test
    void concurrentActivation_differentIds_hasOneWinnerAndTypedConflicts() throws Exception {
        List<UUID> ids = List.of(
                service.create(request("GROUPWARE_CONCURRENT", "A")).id(),
                service.create(request("GROUPWARE_CONCURRENT", "B")).id(),
                service.create(request("GROUPWARE_CONCURRENT", "C")).id());
        List<ActivationOutcome> outcomes = runConcurrentActivations(ids);

        assertThat(outcomes.stream().filter(ActivationOutcome::success).count()).isGreaterThanOrEqualTo(1);
        assertThat(outcomes.stream().filter(outcome -> !outcome.success()).count()).isGreaterThanOrEqualTo(1);
        assertTypedConflictsOnly(outcomes);
        assertThat(repository.findByDocTypeAndIsDeletedFalse("GROUPWARE_CONCURRENT"))
                .filteredOn(template -> template.getStatus() == DocumentTemplateStatus.ACTIVE)
                .hasSize(1);
    }

    @Test
    void adminPermission_deniesNonMasterAndMasterBypassesClient() throws Exception {
        UUID accountId = UUID.fromString("40000000-0000-0000-0000-000000000846");
        lenient().when(dynamicPermissionClient.check(eq(accountId), eq("groupware.approval-templates"), eq(
                com.samhanair.logis.security.permission.PermissionAction.VIEW))).thenReturn(false);

        mvc.perform(get("/admin/groupware/document-templates")
                        .header("X-User-Id", accountId.toString()))
                .andExpect(status().isForbidden());

        clearInvocations(dynamicPermissionClient);
        mvc.perform(get("/admin/groupware/document-templates")
                        .header("X-User-Id", accountId.toString())
                        .header("X-Is-System-Master", "true"))
                .andExpect(status().isOk());
        verify(dynamicPermissionClient, org.mockito.Mockito.never()).check(
                any(UUID.class), eq("groupware.approval-templates"), eq(
                        com.samhanair.logis.security.permission.PermissionAction.VIEW));
    }

    @Test
    void adminPermission_mapsViewAndUpdateToExactActions() throws Exception {
        UUID accountId = UUID.fromString("40000000-0000-0000-0000-000000000847");
        lenient().when(dynamicPermissionClient.check(eq(accountId), eq("groupware.approval-templates"), any()))
                .thenReturn(true);

        mvc.perform(get("/admin/groupware/document-templates")
                        .header("X-User-Id", accountId.toString()))
                .andExpect(status().isOk());
        verify(dynamicPermissionClient).check(accountId, "groupware.approval-templates",
                com.samhanair.logis.security.permission.PermissionAction.VIEW);

        clearInvocations(dynamicPermissionClient);
        mvc.perform(post("/admin/groupware/document-templates")
                        .header("X-User-Id", accountId.toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request("GROUPWARE_PERMISSION", "권한 양식"))))
                .andExpect(status().isCreated());
        verify(dynamicPermissionClient).check(accountId, "groupware.approval-templates",
                com.samhanair.logis.security.permission.PermissionAction.UPDATE);
    }

    @Test
    void httpRejectsJacksonScalarCoercionCorpus() throws Exception {
        UUID accountId = UUID.fromString("40000000-0000-0000-0000-000000000848");
        lenient().when(dynamicPermissionClient.check(eq(accountId), eq("groupware.approval-templates"), any()))
                .thenReturn(true);

        ObjectNode schemaString = validRequestJson("GROUPWARE_COERCION_STRING", "1");
        ObjectNode schemaFloat = validRequestJson("GROUPWARE_COERCION_FLOAT", 1.9);
        ObjectNode docTypeNumber = validRequestJson(123, 1);
        mvc.perform(post("/admin/groupware/document-templates")
                        .header("X-User-Id", accountId.toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                validRequestJson("GROUPWARE_COERCION_INTEGRAL_FLOAT", 1.0))))
                .andExpect(status().isCreated());
        for (ObjectNode body : List.of(schemaString, schemaFloat, docTypeNumber)) {
            mvc.perform(post("/admin/groupware/document-templates")
                            .header("X-User-Id", accountId.toString())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(body)))
                    .andExpect(status().isBadRequest());
        }
    }

    @Test
    void httpActivationBusinessConflict_is409() throws Exception {
        UUID accountId = UUID.fromString("40000000-0000-0000-0000-000000000849");
        UUID id = service.create(request("GROUPWARE_HTTP_CONFLICT", "HTTP 경합" )).id();
        lenient().when(dynamicPermissionClient.check(eq(accountId), eq("groupware.approval-templates"), any()))
                .thenReturn(true);
        doThrow(new BusinessException(ErrorCode.CONFLICT, "활성화 경합"))
                .when(serviceSpy).activate(eq(id), any(String.class));

        mvc.perform(post("/admin/groupware/document-templates/{id}/activate", id)
                        .header("X-User-Id", accountId.toString()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONFLICT"));
    }

    @Test
    void reservedDocType_isRejected() {
        org.assertj.core.api.Assertions.assertThatThrownBy(
                        () -> service.create(request("GROUPWARE_DEFAULT", "예약")))
                .hasMessageContaining("예약된 docType");
    }

    @Test
    void directStatusConstraintAndActivePartialIndex_areEnforced() {
        UUID id = UUID.randomUUID();
        assertThat(org.assertj.core.api.Assertions.catchThrowable(() -> jdbcTemplate.update(
                "INSERT INTO document_templates (id,doc_type,name,revision,status,schema_version,lock_version,document,"
                        + "created_at,created_by,is_deleted) VALUES (?,?,?,?,?,?,?,?::jsonb,?,?,false)", id,
                "GROUPWARE_DIRECT", "직접", 1, "BROKEN", (short) 1,
                0L, "{\"paper\":\"A4_PORTRAIT\",\"bands\":[]}",
                java.sql.Timestamp.valueOf(java.time.LocalDateTime.now()), ACTOR)))
                .isInstanceOf(RuntimeException.class);

        String document = "{\"paper\":\"A4_PORTRAIT\",\"bands\":[]}";
        insertRawTemplate(UUID.randomUUID(), "GROUPWARE_INDEX", "첫 active", "ACTIVE", document);
        assertThat(org.assertj.core.api.Assertions.catchThrowable(() -> insertRawTemplate(
                UUID.randomUUID(), "GROUPWARE_INDEX", "둘째 active", "ACTIVE", document)))
                .isInstanceOf(RuntimeException.class);
    }

    /**
     * 실제 V10 마이그레이션(파일 자체)이 backfill 을 수행함을 격리된 fresh schema 에서 검증한다.
     *
     * <p>SpringBootTest 컨텍스트의 Flyway 는 이미 빈 approval_lines 위에서 V10 을 실행해 backfill 이
     * 0행이므로, pre-V10(=V9) 상태의 legacy 행을 심고 실제 V10 을 적용해야 backfill 로직이 genuine 하게
     * 검증된다([[feedback_migration_fresh_postgres_probe]]). V10 상태에서 code 31자·60자 파생값은
     * NULL이고, V11 적용 후 각각 41자·70자로 backfill 된다.
     */
    @Test
    void v11Migration_backfills41To70CharDerivedTypes_andIsIdempotent() {
        String schema = "ds2_backfill_probe";
        String url = POSTGRES.getJdbcUrl();
        String user = POSTGRES.getUsername();
        String password = POSTGRES.getPassword();

        jdbcTemplate.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        jdbcTemplate.execute("CREATE SCHEMA " + schema);
        Flyway.configure().dataSource(url, user, password).schemas(schema)
                .locations("classpath:db/migration")
                .target(MigrationVersion.fromVersion("9")).load().migrate();

        String code31 = "B".repeat(31);
        String code60 = "C".repeat(60);
        UUID code31Template = UUID.randomUUID();
        UUID code60Template = UUID.randomUUID();
        UUID code31Line = UUID.randomUUID();
        UUID code60Line = UUID.randomUUID();
        UUID nonNullLine = UUID.randomUUID();
        UUID nullTemplateLine = UUID.randomUUID();
        jdbcTemplate.update("INSERT INTO " + schema + ".approval_templates "
                        + "(id,code,name,active,display_order,created_at,created_by,is_deleted) "
                        + "VALUES (?,?,?,true,0,NOW(),?,false),(?,?,?,true,0,NOW(),?,false)",
                code31Template, code31, "31자 legacy", ACTOR,
                code60Template, code60, "60자 legacy", ACTOR);
        insertLegacyLine(schema, code31Line, code31Template, "2099/01/01-401");
        insertLegacyLine(schema, code60Line, code60Template, "2099/01/01-402");
        insertLegacyLine(schema, nonNullLine, code60Template, "2099/01/01-403", "MANUAL_LEGACY");
        insertLegacyLine(schema, nullTemplateLine, null, "2099/01/01-404", "INDEPENDENT_LEGACY");

        Flyway.configure().dataSource(url, user, password).schemas(schema)
                .locations("classpath:db/migration")
                .target(MigrationVersion.fromVersion("10")).load().migrate();

        assertThat(jdbcTemplate.queryForObject(
                "SELECT document_type FROM " + schema + ".approval_lines WHERE id=?", String.class, code31Line))
                .isNull();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT document_type FROM " + schema + ".approval_lines WHERE id=?", String.class, code60Line))
                .isNull();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT document_type FROM " + schema + ".approval_lines WHERE id=?", String.class, nonNullLine))
                .isEqualTo("MANUAL_LEGACY");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT document_type FROM " + schema + ".approval_lines WHERE id=?", String.class, nullTemplateLine))
                .isEqualTo("INDEPENDENT_LEGACY");

        Flyway.configure().dataSource(url, user, password).schemas(schema)
                .locations("classpath:db/migration")
                .target(MigrationVersion.fromVersion("11")).load().migrate();

        assertThat(jdbcTemplate.queryForObject(
                "SELECT document_type FROM " + schema + ".approval_lines WHERE id=?", String.class, code31Line))
                .isEqualTo("GROUPWARE_" + code31)
                .hasSize(41);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT document_type FROM " + schema + ".approval_lines WHERE id=?", String.class, code60Line))
                .isEqualTo("GROUPWARE_" + code60)
                .hasSize(70);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT document_type FROM " + schema + ".approval_lines WHERE id=?", String.class, nonNullLine))
                .isEqualTo("MANUAL_LEGACY");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT document_type FROM " + schema + ".approval_lines WHERE id=?", String.class, nullTemplateLine))
                .isEqualTo("INDEPENDENT_LEGACY");

        int rerunCount = jdbcTemplate.update("""
                UPDATE %s.approval_lines
                   SET document_type = 'GROUPWARE_' || t.code
                  FROM %s.approval_templates t
                 WHERE %s.approval_lines.template_id = t.id
                   AND %s.approval_lines.document_type IS NULL
                   AND length('GROUPWARE_' || t.code) BETWEEN 41 AND 70
                """.formatted(schema, schema, schema, schema));
        assertThat(rerunCount).isZero();

        jdbcTemplate.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
    }

    private void insertRawTemplate(UUID id, String docType, String name, String status, String document) {
        jdbcTemplate.update("INSERT INTO document_templates (id,doc_type,name,revision,status,schema_version,lock_version,document,"
                        + "created_at,created_by,is_deleted) VALUES (?,?,?,?,?,?,?,?::jsonb,?,?,false)", id, docType, name, 1,
                status, (short) 1, 0L, document, java.sql.Timestamp.valueOf(java.time.LocalDateTime.now()), ACTOR);
    }

    private int columnLength(String tableName, String columnName) {
        return jdbcTemplate.queryForObject("""
                SELECT character_maximum_length
                  FROM information_schema.columns
                 WHERE table_schema = current_schema()
                   AND table_name = ?
                   AND column_name = ?
                """, Integer.class, tableName, columnName);
    }

    private void insertLegacyLine(String schema, UUID id, UUID templateId, String approvalNo) {
        insertLegacyLine(schema, id, templateId, approvalNo, null);
    }

    private void insertLegacyLine(String schema, UUID id, UUID templateId, String approvalNo,
                                  String documentType) {
        jdbcTemplate.update("INSERT INTO " + schema + ".approval_lines "
                        + "(id,requester_id,title,content,status,approval_no,template_id,created_at,created_by,is_deleted,document_type) "
                        + "VALUES (?,?,?,?,?,?,?,?,?,false,?)",
                id, UUID.randomUUID(), "legacy", "legacy", "PENDING", approvalNo, templateId,
                java.sql.Timestamp.valueOf(java.time.LocalDateTime.now()), ACTOR, documentType);
    }

    private void insertLegacyApprovalTemplate(String schema, UUID id, String code, String name, boolean deleted) {
        jdbcTemplate.update("INSERT INTO " + schema + ".approval_templates "
                        + "(id,code,name,active,display_order,created_at,created_by,is_deleted) "
                        + "VALUES (?,?,?,true,0,NOW(),?,?)",
                id, code, name, ACTOR, deleted);
    }

    private List<ActivationOutcome> runConcurrentActivations(List<UUID> ids) throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(ids.size());
        CountDownLatch ready = new CountDownLatch(ids.size());
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Callable<ActivationOutcome>> calls = ids.stream()
                    .map(id -> (Callable<ActivationOutcome>) () -> {
                        ready.countDown();
                        if (!start.await(10, TimeUnit.SECONDS)) {
                            return ActivationOutcome.error(new AssertionError("activate 경합 barrier timeout"));
                        }
                        try {
                            service.activate(id, ACTOR);
                            return ActivationOutcome.ok();
                        } catch (Throwable failure) {
                            return ActivationOutcome.error(failure);
                        }
                    }).toList();
            List<Future<ActivationOutcome>> futures = calls.stream().map(executor::submit).toList();
            assertThat(ready.await(10, TimeUnit.SECONDS)).as("모든 activate worker가 barrier에 도착").isTrue();
            start.countDown();
            return futures.stream().map(DocumentTemplateIT::outcome).toList();
        } finally {
            executor.shutdownNow();
        }
    }

    private static ActivationOutcome outcome(Future<ActivationOutcome> future) {
        try {
            return future.get();
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            return ActivationOutcome.error(ex);
        } catch (ExecutionException ex) {
            return ActivationOutcome.error(ex.getCause());
        }
    }

    private static void assertTypedConflictsOnly(List<ActivationOutcome> outcomes) {
        assertThat(outcomes.stream().filter(outcome -> !outcome.success()).map(ActivationOutcome::failure))
                .allSatisfy(failure -> {
                    assertThat(failure).isInstanceOf(BusinessException.class);
                    assertThat(((BusinessException) failure).getErrorCode()).isEqualTo(ErrorCode.CONFLICT);
                });
    }

    private ObjectNode validRequestJson(Object docType, Object schemaVersion) {
        ObjectNode body = objectMapper.createObjectNode();
        if (docType instanceof String text) body.put("docType", text);
        else body.put("docType", ((Number) docType).intValue());
        if (schemaVersion instanceof String text) body.put("schemaVersion", text);
        else body.put("schemaVersion", ((Number) schemaVersion).doubleValue());
        body.put("name", "coercion");
        body.set("document", payload());
        return body;
    }

    private record ActivationOutcome(boolean success, Throwable failure) {
        static ActivationOutcome ok() {
            return new ActivationOutcome(true, null);
        }

        static ActivationOutcome error(Throwable failure) {
            return new ActivationOutcome(false, failure);
        }
    }

    private JsonNode readCanonicalArtifact() throws IOException {
        try (InputStream input = getClass().getResourceAsStream(CANONICAL_ARTIFACT)) {
            assertThat(input).as("canonical artifact 리소스").isNotNull();
            return objectMapper.readTree(input);
        }
    }

    private void writeCanonicalActual(JsonNode normalized) {
        try {
            Path out = Path.of("build", "tmp", "ds2-canonical-active-response.actual.json");
            Files.createDirectories(out.getParent());
            Files.writeString(out,
                    objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(normalized),
                    StandardCharsets.UTF_8);
        } catch (Exception ignored) {
            // 진단용 write 실패는 대조(assert) 결과에 영향을 주지 않는다.
        }
    }

    private DocumentTemplateCreateRequest request(String docType, String name) {
        return new DocumentTemplateCreateRequest(docType, name, (short) 1, payload());
    }

    private JsonNode payload() {
        return objectMapper.valueToTree(new DocumentPayload("A4_PORTRAIT", List.of(
                new DocumentPayload.Band("header", "HEADER", List.of(
                        new DocumentPayload.Element("title", "TITLE"),
                        new DocumentPayload.Element("approval", "APPROVAL_GRID"))),
                new DocumentPayload.Band("body", "BODY", List.of(
                        new DocumentPayload.Element("content", "CONTENT_PARAGRAPHS"))),
                new DocumentPayload.Band("footer", "FOOTER", List.of(
                        new DocumentPayload.Element("closing", "CLOSING"))))));
    }

}
