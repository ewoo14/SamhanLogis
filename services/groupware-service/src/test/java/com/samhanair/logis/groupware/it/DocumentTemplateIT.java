package com.samhanair.logis.groupware.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doAnswer;
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
import com.samhanair.logis.groupware.dto.DocumentTemplateUpdateRequest;
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
import java.util.Map;
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
    @Autowired private com.samhanair.logis.groupware.service.DocumentTemplateRevisionService revisionService;
    @Autowired private DocumentTemplateService service;
    @Autowired private JdbcTemplate jdbcTemplate;

    @MockBean private UserClient userClient;
    @MockBean private DynamicPermissionClient dynamicPermissionClient;
    @SpyBean private DocumentTemplateService serviceSpy;
    @SpyBean private DocumentTemplateRevisionRepository revisionRepositorySpy;

    @BeforeEach
    void setUp() {
        // revision 이력은 운영 transaction에서 삭제하지 않는다. IT 격리 fixture만 TRUNCATE로 초기화한다.
        // FABLE5 R1 PM disposition: BEFORE UPDATE OR DELETE trigger는 append-only를 강제하지만
        // TRUNCATE에는 발화하지 않는다(row-level trigger의 정의상 한계) — 이 TRUNCATE는 그 append-only
        // 보장을 우회한다. 앱 경로에는 TRUNCATE가 없어 위협모델은 관리자 권한 수준으로 한정되므로,
        // TRUNCATE 가드(BEFORE TRUNCATE ... FOR EACH STATEMENT)는 이 IT 리셋과 충돌해 PM이 별건으로
        // 이월했다 — "DB가 append-only를 강제한다"는 표현은 UPDATE/DELETE에 한정된 것이지 TRUNCATE까지
        // 포함하는 게 아니다.
        jdbcTemplate.execute("TRUNCATE TABLE document_template_revisions, document_templates RESTART IDENTITY CASCADE");
        repository.deleteAll();
        repository.flush();
        lenient().when(dynamicPermissionClient.check(any(UUID.class), any(String.class), any())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canView(any(), any())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(any(), any())).thenReturn(true);
    }

    @AfterEach
    void tearDown() {
        // 이 TRUNCATE도 setUp()과 동일하게 append-only trigger(UPDATE/DELETE 전용)를 우회한다.
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
    void httpV2JsonbRoundTrip_preservesGeometryStyleBindingAndText() throws Exception {
        ObjectNode document = (ObjectNode) payload().deepCopy();
        var bodyElements = (com.fasterxml.jackson.databind.node.ArrayNode) document.at("/bands/1/elements");
        ObjectNode field = bodyElements.addObject();
        field.put("key", "field-doc-no");
        field.put("type", "FIELD");
        field.put("binding", "header.docNo");
        field.set("geometry", objectMapper.createObjectNode()
                .put("x", 10).put("y", 20).put("w", 60).put("h", 8));
        field.set("style", objectMapper.createObjectNode()
                .put("fontSize", 14).put("bold", true).put("align", "center").put("border", true));
        ObjectNode text = bodyElements.addObject();
        text.put("key", "text-title");
        text.put("type", "TEXT");
        text.put("text", "초안 제목");
        text.set("geometry", objectMapper.createObjectNode()
                .put("x", 5).put("y", 5).put("w", 90).put("h", 10));

        DocumentTemplateCreateRequest request = new DocumentTemplateCreateRequest(
                "GROUPWARE_V2_ROUNDTRIP", "v2 왕복 양식", (short) 2, document);
        String created = mvc.perform(post("/admin/groupware/document-templates")
                        .header("X-User-Id", "40000000-0000-0000-0000-000000000850")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.schemaVersion").value(2))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        UUID id = UUID.fromString(objectMapper.readTree(created).path("data").path("id").asText());

        mvc.perform(post("/admin/groupware/document-templates/{id}/activate", id)
                        .header("X-User-Id", "40000000-0000-0000-0000-000000000850"))
                .andExpect(status().isOk());

        mvc.perform(get("/groupware/document-templates/active")
                        .param("docType", "GROUPWARE_V2_ROUNDTRIP"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.schemaVersion").value(2))
                .andExpect(jsonPath("$.data.document.bands[1].elements[1].geometry.x").value(10))
                .andExpect(jsonPath("$.data.document.bands[1].elements[1].style.bold").value(true))
                .andExpect(jsonPath("$.data.document.bands[1].elements[1].binding").value("header.docNo"))
                .andExpect(jsonPath("$.data.document.bands[1].elements[2].text").value("초안 제목"))
                .andExpect(jsonPath("$.data.document.bands[1].elements[2].geometry.w").value(90));
    }

    @Test
    void httpExcelMode_isPreservedAcrossCreateGetUpdateAndRevision_andCannotChangeToWord() throws Exception {
        ObjectNode excelDocument = (ObjectNode) payload().deepCopy();
        excelDocument.put("mode", "EXCEL");
        DocumentTemplateCreateRequest createRequest = new DocumentTemplateCreateRequest(
                "GROUPWARE_MODE_ROUNDTRIP", "엑셀 방식 왕복", (short) 1, excelDocument);

        String created = mvc.perform(post("/admin/groupware/document-templates")
                        .header("X-User-Id", "40000000-0000-0000-0000-000000000903")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createRequest)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.document.mode").value("EXCEL"))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        UUID id = UUID.fromString(objectMapper.readTree(created).path("data").path("id").asText());

        mvc.perform(get("/admin/groupware/document-templates/{id}", id)
                        .header("X-User-Id", "40000000-0000-0000-0000-000000000903"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.document.mode").value("EXCEL"));

        mvc.perform(get("/groupware/document-templates/{templateId}/revisions/{revision}", id, 1))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.document.mode").value("EXCEL"));

        mvc.perform(put("/admin/groupware/document-templates/{id}", id)
                        .header("X-User-Id", "40000000-0000-0000-0000-000000000903")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new DocumentTemplateUpdateRequest(
                                createRequest.docType(), createRequest.name(), createRequest.schemaVersion(),
                                createRequest.document()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.document.mode").value("EXCEL"));

        ObjectNode wordDocument = (ObjectNode) payload().deepCopy();
        wordDocument.put("mode", "WORD");
        DocumentTemplateUpdateRequest wordRequest = new DocumentTemplateUpdateRequest(
                "GROUPWARE_MODE_ROUNDTRIP", "엑셀 방식 왕복", (short) 1, wordDocument);
        mvc.perform(put("/admin/groupware/document-templates/{id}", id)
                        .header("X-User-Id", "40000000-0000-0000-0000-000000000903")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(wordRequest)))
                .andExpect(status().isUnprocessableEntity());
    }

    /**
     * 🔴 BLOCKING-1 RED-first(실 HTTP): 속성 패널에서 style 을 부분 지정(fontSize 만)하는 것은 FE UI 의
     * 정상 경로다. 수정 전에는 create(201) 은 성공하지만 GET(재열람)·activate() 재검증이 동일 payload 를
     * 거부해 "저장은 됐는데 다시 열 수 없고 활성화도 안 되는" 모순이 있었다. 3 단계(create→get→activate) 전부
     * 성공하고, GET 응답에 style 의 미지정 필드가 명시적 null 로 남아있지 않아야 한다(FE parser 가
     * {@code !== undefined} 로 null 을 유효값 부재와 구분하지 못해 재열람이 깨졌던 경로).
     */
    @Test
    void blocking1_partialStyleSurvivesCreateGetAndActivate() throws Exception {
        UUID accountId = UUID.fromString("40000000-0000-0000-0000-000000000851");
        ObjectNode document = (ObjectNode) payload().deepCopy();
        var bodyElements = (com.fasterxml.jackson.databind.node.ArrayNode) document.at("/bands/1/elements");
        ObjectNode field = bodyElements.addObject();
        field.put("key", "field-partial-style");
        field.put("type", "FIELD");
        field.put("binding", "header.docNo");
        field.set("geometry", objectMapper.createObjectNode()
                .put("x", 0).put("y", 0).put("w", 50).put("h", 10));
        // 부분 지정 — fontSize 만. bold/align/border 는 아예 보내지 않는다(정상 UI 경로).
        field.set("style", objectMapper.createObjectNode().put("fontSize", 14));

        DocumentTemplateCreateRequest request = new DocumentTemplateCreateRequest(
                "GROUPWARE_PARTIAL_STYLE", "부분 style 양식", (short) 2, document);
        String created = mvc.perform(post("/admin/groupware/document-templates")
                        .header("X-User-Id", accountId.toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        UUID id = UUID.fromString(objectMapper.readTree(created).path("data").path("id").asText());

        String reloaded = mvc.perform(get("/admin/groupware/document-templates/{id}", id)
                        .header("X-User-Id", accountId.toString()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode reloadedStyle = objectMapper.readTree(reloaded)
                .path("data").path("document").path("bands").get(1).path("elements").get(1).path("style");
        assertThat(reloadedStyle.path("fontSize").asDouble()).isEqualTo(14.0);
        assertThat(reloadedStyle.has("bold")).as("미지정 style 필드가 명시적 null로 재열람 응답에 남으면 안 된다").isFalse();
        assertThat(reloadedStyle.has("align")).as("미지정 style 필드가 명시적 null로 재열람 응답에 남으면 안 된다").isFalse();
        assertThat(reloadedStyle.has("border")).as("미지정 style 필드가 명시적 null로 재열람 응답에 남으면 안 된다").isFalse();

        mvc.perform(post("/admin/groupware/document-templates/{id}/activate", id)
                        .header("X-User-Id", accountId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("ACTIVE"));
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
    void concurrentActivation_differentIds_keepsOneActive_andOnlyTypedConflictsIfAny() throws Exception {
        List<UUID> ids = List.of(
                service.create(request("GROUPWARE_CONCURRENT", "A")).id(),
                service.create(request("GROUPWARE_CONCURRENT", "B")).id(),
                service.create(request("GROUPWARE_CONCURRENT", "C")).id());
        List<ActivationOutcome> outcomes = runConcurrentActivations(ids);

        // PostgreSQL이 세 transaction을 순차 직렬화하는 허용 스케줄에서는 3건 모두 성공할 수 있다.
        // 실패가 반드시 발생한다고 단언하면 합법적인 스케줄을 flaky/실패로 오판한다.
        assertThat(outcomes.stream().filter(ActivationOutcome::success).count()).isBetween(1L, 3L);
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

    @Test
    void v12Backfill_marksAuditAsUnverified_insteadOfCopyingRevisionMutationAudit() {
        String schema = "ds3a_v12_backfill_probe";
        String url = POSTGRES.getJdbcUrl();
        String user = POSTGRES.getUsername();
        String password = POSTGRES.getPassword();
        UUID templateId = UUID.randomUUID();

        jdbcTemplate.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        jdbcTemplate.execute("CREATE SCHEMA " + schema);
        Flyway.configure().dataSource(url, user, password).schemas(schema)
                .locations("classpath:db/migration")
                .target(MigrationVersion.fromVersion("11")).load().migrate();

        jdbcTemplate.update("INSERT INTO " + schema + ".document_templates "
                        + "(id,doc_type,name,revision,status,schema_version,lock_version,document,"
                        + "created_at,created_by,modified_at,modified_by,is_deleted) "
                        + "VALUES (?,?,?,?,?,?,?,?::jsonb,?,?,?, ?,false)",
                templateId, "GROUPWARE_V12_AUDIT", "현재 양식", 3, "ACTIVE", (short) 1, 0L,
                "{\"paper\":\"A4_PORTRAIT\",\"bands\":[]}",
                java.sql.Timestamp.valueOf("2026-07-01 10:00:00"), "작성자-A",
                java.sql.Timestamp.valueOf("2026-07-20 10:00:00"), "활성화자-B");

        Flyway.configure().dataSource(url, user, password).schemas(schema)
                .locations("classpath:db/migration")
                .target(MigrationVersion.fromVersion("12")).load().migrate();

        Map<String, Object> backfill = jdbcTemplate.queryForMap(
                "SELECT created_at,created_by,modified_at,modified_by,is_backfilled "
                        + "FROM " + schema + ".document_template_revisions WHERE template_id=?", templateId);
        assertThat(backfill.get("created_by")).isEqualTo("V12_BACKFILL_UNVERIFIED");
        assertThat(backfill.get("is_backfilled")).isEqualTo(true);
        assertThat(backfill.get("modified_at")).isNull();
        assertThat(backfill.get("modified_by")).isNull();
    }

    @Test
    void concurrentRevisionSelfHeal_uniqueConflict_isTypedConflict_notGeneric500() throws Exception {
        UUID templateId = UUID.randomUUID();
        insertRawTemplate(templateId, "GROUPWARE_SELF_HEAL_RACE", "동시 self-heal", "DRAFT",
                "{\"paper\":\"A4_PORTRAIT\",\"bands\":[]}");
        DocumentTemplate template = repository.findById(templateId).orElseThrow();

        doAnswer(invocation -> java.util.Optional.empty())
                .when(revisionRepositorySpy)
                .findByTemplateIdAndRevisionAndIsDeletedFalse(templateId, 1);

        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<Throwable>> futures = List.of(1, 2).stream().map(ignored -> executor.submit(() -> {
                assertThat(start.await(10, TimeUnit.SECONDS)).isTrue();
                try {
                    revisionService.ensureCurrentRevision(template);
                    return null;
                } catch (Throwable failure) {
                    return failure;
                }
            })).toList();
            start.countDown();
            List<Throwable> failures = futures.stream().map(DocumentTemplateIT::throwable).toList();

            assertThat(failures).anyMatch(failure -> failure == null);
            assertThat(failures).anyMatch(failure -> failure instanceof BusinessException business
                    && business.getErrorCode() == ErrorCode.CONFLICT);
            assertThat(jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM document_template_revisions WHERE template_id=? AND revision=1",
                    Integer.class, templateId)).isEqualTo(1);
        } finally {
            executor.shutdownNow();
        }
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

    private static Throwable throwable(Future<Throwable> future) {
        try {
            return future.get();
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            return ex;
        } catch (ExecutionException ex) {
            return ex.getCause();
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
