package com.samhanair.logis.groupware.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.groupware.GroupwareServiceApplication;
import com.samhanair.logis.groupware.client.UserClient;
import com.samhanair.logis.groupware.domain.DocumentPayload;
import com.samhanair.logis.groupware.domain.DocumentTemplate;
import com.samhanair.logis.groupware.domain.DocumentTemplateStatus;
import com.samhanair.logis.groupware.dto.DocumentTemplateCreateRequest;
import com.samhanair.logis.groupware.dto.DocumentTemplateResponse;
import com.samhanair.logis.groupware.dto.DocumentTemplateUpdateRequest;
import com.samhanair.logis.groupware.repository.DocumentTemplateRepository;
import com.samhanair.logis.groupware.service.DocumentTemplateService;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

/** DS-2 실 PostgreSQL Flyway/JPA/HTTP 계약 검증. */
@SpringBootTest(classes = GroupwareServiceApplication.class)
@AutoConfigureMockMvc
@WithMockUser(username = "document-template-it", authorities = {"ROLE_MANAGER"})
class DocumentTemplateIT extends AbstractPostgresIT {

    private static final String ACTOR = "document-template-it";

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private DocumentTemplateRepository repository;
    @Autowired private DocumentTemplateService service;
    @Autowired private JdbcTemplate jdbcTemplate;

    @MockBean private UserClient userClient;
    @MockBean private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUp() {
        repository.deleteAll();
        repository.flush();
        lenient().when(dynamicPermissionClient.check(any(UUID.class), any(String.class), any())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canView(any(), any())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(any(), any())).thenReturn(true);
    }

    @AfterEach
    void tearDown() {
        repository.deleteAll();
        repository.flush();
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
                .andReturn().getResponse().getContentAsString();
        UUID id = UUID.fromString(objectMapper.readTree(created).path("data").path("id").asText());

        mvc.perform(post("/admin/groupware/document-templates/{id}/activate", id)
                        .header("X-User-Id", "40000000-0000-0000-0000-000000000845"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("ACTIVE"));
        String active = mvc.perform(get("/groupware/document-templates/active")
                        .param("docType", "GROUPWARE_ROUNDTRIP"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.document.paper").value("A4_PORTRAIT"))
                .andReturn().getResponse().getContentAsString();
        JsonNode expected = objectMapper.valueToTree(request.document());
        JsonNode actual = objectMapper.readTree(active).path("data").path("document");
        assertThat(actual).isEqualTo(expected);

        mvc.perform(put("/admin/groupware/document-templates/{id}", id)
                        .header("X-User-Id", "40000000-0000-0000-0000-000000000845")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(delete("/admin/groupware/document-templates/{id}", id)
                        .header("X-User-Id", "40000000-0000-0000-0000-000000000845"))
                .andExpect(status().isOk());
        assertThat(repository.findAll()).isEmpty();
    }

    @Test
    void onlyOneActiveAndActivationIsIdempotent() {
        UUID first = service.create(request("GROUPWARE_SINGLETON", "첫 양식"), ACTOR).id();
        UUID second = service.create(request("GROUPWARE_SINGLETON", "둘째 양식"), ACTOR).id();

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
        UUID first = service.create(request("GROUPWARE_LOCK", "첫 양식"), ACTOR).id();
        UUID second = service.create(request("GROUPWARE_LOCK", "둘째 양식"), ACTOR).id();
        service.activate(first, "actor-a");
        DocumentTemplate stale = repository.findById(first).orElseThrow();

        service.activate(second, "actor-b");
        DocumentTemplate demoted = repository.findById(first).orElseThrow();
        assertThat(demoted.getStatus()).isEqualTo(DocumentTemplateStatus.DRAFT);
        assertThat(demoted.getLockVersion()).isGreaterThan(stale.getLockVersion());
        assertThat(demoted.getModifiedBy()).isEqualTo("actor-b");
        assertThat(demoted.getModifiedAt()).isNotNull();

        assertThat(org.assertj.core.api.Assertions.catchThrowable(() -> repository.saveAndFlush(
                        stale.rename("stale write"))))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void threeConcurrentActivations_leaveAtMostOneActive() throws Exception {
        List<UUID> ids = List.of(
                service.create(request("GROUPWARE_CONCURRENT", "A"), ACTOR).id(),
                service.create(request("GROUPWARE_CONCURRENT", "B"), ACTOR).id(),
                service.create(request("GROUPWARE_CONCURRENT", "C"), ACTOR).id());
        ExecutorService executor = Executors.newFixedThreadPool(3);
        try {
            List<Callable<Boolean>> calls = ids.stream()
                    .map(id -> (Callable<Boolean>) () -> {
                        try {
                            service.activate(id, ACTOR);
                            return true;
                        } catch (RuntimeException conflict) {
                            return false;
                        }
                    }).toList();
            List<Future<Boolean>> futures = executor.invokeAll(calls);
            assertThat(futures.stream().filter(DocumentTemplateIT::futureResult).count()).isGreaterThanOrEqualTo(1);
            assertThat(repository.findByDocTypeAndIsDeletedFalse("GROUPWARE_CONCURRENT"))
                    .filteredOn(template -> template.getStatus() == DocumentTemplateStatus.ACTIVE)
                    .hasSize(1);
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void reservedDocType_isRejected() {
        org.assertj.core.api.Assertions.assertThatThrownBy(
                        () -> service.create(request("GROUPWARE_DEFAULT", "예약"), ACTOR))
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

    @Test
    void migrationBackfill_keepsThirtyAndSkipsThirtyOneCharacterDerivedType() {
        UUID shortTemplate = UUID.randomUUID();
        UUID longTemplate = UUID.randomUUID();
        UUID shortLine = UUID.randomUUID();
        UUID longLine = UUID.randomUUID();
        String code30 = "A".repeat(30);
        String code31 = "B".repeat(31);
        jdbcTemplate.update("INSERT INTO approval_templates (id,code,name,active,display_order,created_at,created_by,is_deleted) "
                        + "VALUES (?,?,?,true,0,NOW(),?,false),(?,?,?,true,0,NOW(),?,false)",
                shortTemplate, code30, "30자 legacy", ACTOR,
                longTemplate, code31, "31자 legacy", ACTOR);
        insertRawApprovalLine(shortLine, shortTemplate, "2099/01/01-301");
        insertRawApprovalLine(longLine, longTemplate, "2099/01/01-302");

        jdbcTemplate.update("UPDATE approval_lines SET document_type='GROUPWARE_'||t.code "
                + "FROM approval_templates t WHERE approval_lines.template_id=t.id "
                + "AND approval_lines.document_type IS NULL AND length('GROUPWARE_'||t.code)<=40");

        assertThat(jdbcTemplate.queryForObject("SELECT document_type FROM approval_lines WHERE id=?",
                String.class, shortLine)).isEqualTo("GROUPWARE_" + code30);
        assertThat(jdbcTemplate.queryForObject("SELECT document_type FROM approval_lines WHERE id=?",
                String.class, longLine)).isNull();
    }

    private void insertRawTemplate(UUID id, String docType, String name, String status, String document) {
        jdbcTemplate.update("INSERT INTO document_templates (id,doc_type,name,revision,status,schema_version,lock_version,document,"
                        + "created_at,created_by,is_deleted) VALUES (?,?,?,?,?,?,?,?::jsonb,?,?,false)", id, docType, name, 1,
                status, (short) 1, 0L, document, java.sql.Timestamp.valueOf(java.time.LocalDateTime.now()), ACTOR);
    }

    private void insertRawApprovalLine(UUID id, UUID templateId, String approvalNo) {
        jdbcTemplate.update("INSERT INTO approval_lines (id,requester_id,title,content,status,approval_no,template_id,"
                        + "created_at,created_by,is_deleted,document_type) VALUES (?,?,?,?,?,?,?,?,?,false,NULL)",
                id, UUID.randomUUID(), "legacy", "legacy", "PENDING", approvalNo, templateId,
                java.sql.Timestamp.valueOf(java.time.LocalDateTime.now()), ACTOR);
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

    private static boolean futureResult(Future<Boolean> future) {
        try {
            return future.get();
        } catch (Exception ex) {
            return false;
        }
    }
}
