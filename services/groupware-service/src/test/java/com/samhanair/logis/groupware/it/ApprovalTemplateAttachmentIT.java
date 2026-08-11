package com.samhanair.logis.groupware.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.hamcrest.Matchers.containsInAnyOrder;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.groupware.GroupwareServiceApplication;
import com.samhanair.logis.groupware.client.UserClient;
import com.samhanair.logis.groupware.domain.ApprovalAttachmentType;
import com.samhanair.logis.groupware.domain.ApprovalFieldType;
import com.samhanair.logis.groupware.domain.ApprovalLine;
import com.samhanair.logis.groupware.domain.ApprovalReferenceDocType;
import com.samhanair.logis.groupware.domain.ApprovalTemplate;
import com.samhanair.logis.groupware.domain.ApprovalTemplateField;
import com.samhanair.logis.groupware.dto.ApprovalLineCreateRequest;
import com.samhanair.logis.groupware.dto.ApprovalAttachmentRequest;
import com.samhanair.logis.groupware.dto.ApprovalTemplateRequest;
import com.samhanair.logis.groupware.repository.ApprovalAttachmentRepository;
import com.samhanair.logis.groupware.repository.ApprovalLineRepository;
import com.samhanair.logis.groupware.repository.ApprovalNumberSequenceRepository;
import com.samhanair.logis.groupware.repository.ApprovalTemplateFieldRepository;
import com.samhanair.logis.groupware.repository.ApprovalTemplateRepository;
import com.samhanair.logis.groupware.service.ApprovalLineService;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * 결재유형 템플릿 빌더와 결재 첨부 기능 통합 테스트.
 *
 * <p>실 PostgreSQL + Flyway schema 에서 템플릿 스키마 검증, 첨부 잠금, collab field overlay 를 검증한다.
 */
@SpringBootTest(classes = GroupwareServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "groupware-user", authorities = {"ROLE_MANAGER"})
class ApprovalTemplateAttachmentIT extends AbstractPostgresIT {

    private static final String ACTOR_ID = "40000000-0000-0000-0000-000000000501";

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private ApprovalLineService approvalLineService;
    @Autowired private ApprovalLineRepository approvalLineRepository;
    @Autowired private ApprovalTemplateRepository templateRepository;
    @Autowired private ApprovalTemplateFieldRepository fieldRepository;
    @Autowired private ApprovalAttachmentRepository attachmentRepository;
    @Autowired private ApprovalNumberSequenceRepository numberSequenceRepository;

    @MockBean private UserClient userClient;
    @MockBean private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUp() {
        attachmentRepository.deleteAll();
        approvalLineRepository.deleteAll();
        numberSequenceRepository.deleteAll();
        fieldRepository.deleteAll();
        templateRepository.deleteAll();
        lenient().when(dynamicPermissionClient.canView(any(), any())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(any(), any())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(any(UUID.class), any(String.class), any(PermissionAction.class)))
                .thenReturn(true);
        lenient().when(userClient.exists(any())).thenReturn(true);
        lenient().when(userClient.verifyBulk(anyList())).thenAnswer(inv -> {
            List<UUID> ids = inv.getArgument(0);
            java.util.Map<UUID, Boolean> result = new java.util.HashMap<>();
            ids.forEach(id -> result.put(id, true));
            return result;
        });
        lenient().when(userClient.resolveDisplayNames(anyList())).thenReturn(java.util.Map.of());
    }

    /** 템플릿 CRUD 는 fields replace-set 과 active 목록 조회를 지원한다. */
    @Test
    void templateCrud_replacesFieldsAndListsActiveTemplates() throws Exception {
        ApprovalTemplateRequest create = new ApprovalTemplateRequest(
                "EXPENSE_CUSTOM", "맞춤 지출결의서", "테스트 양식", true, 10,
                List.of(
                        new ApprovalTemplateRequest.Field("amount", "금액", ApprovalFieldType.NUMBER,
                                true, 1, null, "숫자 입력"),
                        new ApprovalTemplateRequest.Field("spentAt", "지출일", ApprovalFieldType.DATE,
                                true, 2, null, null)));

        String created = mvc.perform(post("/admin/groupware/approval-templates")
                        .header("X-User-Id", ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(create)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.code").value("EXPENSE_CUSTOM"))
                .andExpect(jsonPath("$.data.fields.length()").value(2))
                .andReturn().getResponse().getContentAsString();
        UUID templateId = UUID.fromString(objectMapper.readTree(created).path("data").path("id").asText());

        ApprovalTemplateRequest update = new ApprovalTemplateRequest(
                "EXPENSE_CUSTOM", "맞춤 지출결의서 v2", "교체됨", true, 20,
                List.of(new ApprovalTemplateRequest.Field("memo", "메모", ApprovalFieldType.TEXTAREA,
                        false, 1, null, "선택 입력")));

        mvc.perform(put("/admin/groupware/approval-templates/{id}", templateId)
                        .header("X-User-Id", ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(update)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.name").value("맞춤 지출결의서 v2"))
                .andExpect(jsonPath("$.data.fields.length()").value(1))
                .andExpect(jsonPath("$.data.fields[0].fieldKey").value("memo"));

        mvc.perform(get("/admin/groupware/approval-templates/active")
                        .header("X-User-Id", ACTOR_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].code").value("EXPENSE_CUSTOM"));

        mvc.perform(delete("/admin/groupware/approval-templates/{id}", templateId)
                        .header("X-User-Id", ACTOR_ID))
                .andExpect(status().isOk());

        // soft-delete 검증: findById 는 em.find(PK) 라 @SQLRestriction/L1 캐시를 우회할 수 있어
        // 부적합 → @SQLRestriction(is_deleted=false) 이 적용되는 HQL findAll 로 확인.
        assertThat(templateRepository.findAll()).isEmpty();
    }

    /** 결재 생성 시 required, NUMBER, DATE, SELECT, 미정의 fieldKey 를 템플릿 스키마로 검증한다. */
    @Test
    void createApproval_withTemplateFieldValues_validatesSchema() throws Exception {
        ApprovalTemplate template = seedExpenseTemplate();

        ApprovalLineCreateRequest ok = new ApprovalLineCreateRequest(
                UUID.randomUUID(), "지출 결재", null, List.of(UUID.randomUUID()),
                template.getId(), Map.of(
                        "amount", "10000",
                        "spentAt", "2026-06-14",
                        "account", "복리후생비"));
        mvc.perform(post("/admin/groupware/approvals")
                        .header("X-User-Id", ACTOR_ID)
                        .header("X-User-Department", "대표실")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(ok)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.templateId").value(template.getId().toString()))
                .andExpect(jsonPath("$.data.templateName").value("지출결의서"))
                .andExpect(jsonPath("$.data.fieldValues.amount").value("10000"));

        for (Map<String, String> invalidValues : List.of(
                Map.of("spentAt", "2026-06-14", "account", "복리후생비"),
                Map.of("amount", "abc", "spentAt", "2026-06-14", "account", "복리후생비"),
                Map.of("amount", "10000", "spentAt", "20260614", "account", "복리후생비"),
                Map.of("amount", "10000", "spentAt", "2026-06-14", "account", "미등록"),
                Map.of("amount", "10000", "spentAt", "2026-06-14", "unknown", "x"))) {
            ApprovalLineCreateRequest bad = new ApprovalLineCreateRequest(
                    UUID.randomUUID(), "검증 실패", null, List.of(UUID.randomUUID()),
                    template.getId(), invalidValues);
            mvc.perform(post("/admin/groupware/approvals")
                            .header("X-User-Id", ACTOR_ID)
                            .header("X-User-Department", "대표실")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(bad)))
                    .andExpect(status().isBadRequest());
        }
    }

    /** 결재 첨부는 참조/파일 추가, 목록, 삭제를 지원하고 종료 결재에는 409 로 잠긴다. */
    @Test
    void attachments_supportReferencesFilesAndLocking() throws Exception {
        ApprovalLine approval = seedApproval("첨부 결재");

        mvc.perform(post("/admin/groupware/approvals/{approvalId}/attachments", approval.getId())
                        .header("X-User-Id", ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "attachmentType", ApprovalAttachmentType.SLIP_REF.name(),
                                "label", "출고전표",
                                "displayOrder", 1,
                                "refSlipNo", "2026/06/14-1",
                                "refSlipType", "SLIP_OUTBOUND"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.attachmentType").value("SLIP_REF"))
                .andExpect(jsonPath("$.data.refDocType").value("OUTBOUND_SLIP"))
                .andExpect(jsonPath("$.data.refDocNo").value("2026/06/14-1"));

        mvc.perform(post("/admin/groupware/approvals/{approvalId}/attachments", approval.getId())
                        .header("X-User-Id", ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "attachmentType", ApprovalAttachmentType.SLIP_REF.name(),
                                "refDocType", ApprovalReferenceDocType.JOURNAL.name(),
                                "label", "분개장",
                                "displayOrder", 2,
                                "refDocNo", "2026/06/14-2",
                                "refDocLabel", "운송료 매출"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.attachmentType").value("SLIP_REF"))
                .andExpect(jsonPath("$.data.refDocType").value("JOURNAL"))
                .andExpect(jsonPath("$.data.refDocNo").value("2026/06/14-2"))
                .andExpect(jsonPath("$.data.refDocLabel").value("운송료 매출"));

        MockMultipartFile file = new MockMultipartFile(
                "file", "receipt.pdf", "application/pdf", "PDF".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        mvc.perform(multipart("/admin/groupware/approvals/{approvalId}/attachments/file", approval.getId())
                        .file(file)
                        .header("X-User-Id", ACTOR_ID)
                        .param("label", "영수증")
                        .param("displayOrder", "2"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.attachmentType").value("FILE"))
                .andExpect(jsonPath("$.data.fileName").value("receipt.pdf"));

        String listBody = mvc.perform(get("/admin/groupware/approvals/{approvalId}/attachments", approval.getId())
                        .header("X-User-Id", ACTOR_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(3))
                .andReturn().getResponse().getContentAsString();
        UUID attachmentId = UUID.fromString(objectMapper.readTree(listBody).path("data").get(0).path("id").asText());

        mvc.perform(delete("/admin/groupware/approvals/{approvalId}/attachments/{attachmentId}",
                        approval.getId(), attachmentId)
                        .header("X-User-Id", ACTOR_ID))
                .andExpect(status().isOk());

        ApprovalLine approved = seedApprovedApproval();
        mvc.perform(post("/admin/groupware/approvals/{approvalId}/attachments", approved.getId())
                        .header("X-User-Id", ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "attachmentType", ApprovalAttachmentType.PARTNER_LEDGER_REF.name(),
                                "label", "거래처원장",
                                "refPartnerCode", "1234567890",
                                "refPartnerName", "삼한상사",
                                "refPeriod", "2026-06"))))
                .andExpect(status().isConflict());
    }

    /** 기존 6종 참조가 실제 저장·조회 응답에서 attachment_type/ref_doc_type을 보존한다. */
    @Test
    void existingSixReferenceTypes_areSavedAndRenderedWithStableAttachmentTypes() throws Exception {
        ApprovalLine approval = seedApproval("기존 6종 참조 회귀");

        addReferenceAndAssert(approval, new ApprovalAttachmentRequest(
                ApprovalAttachmentType.SLIP_REF, "출고전표", 1,
                "2026/08/11-1", "SLIP_OUTBOUND", null, null, null,
                null, null, null), "OUTBOUND_SLIP", "2026/08/11-1", "SLIP_REF");
        addReferenceAndAssert(approval, new ApprovalAttachmentRequest(
                ApprovalAttachmentType.SLIP_REF, "입고전표", 2,
                "2026/08/11-2", "SLIP_INBOUND", null, null, null,
                null, null, null), "INBOUND_SLIP", "2026/08/11-2", "SLIP_REF");
        addReferenceAndAssert(approval, new ApprovalAttachmentRequest(
                ApprovalAttachmentType.SLIP_REF, "분개장", 3,
                null, null, null, null, null,
                ApprovalReferenceDocType.JOURNAL, "2026/08/11-3", "운송료"),
                "JOURNAL", "2026/08/11-3", "SLIP_REF");
        addReferenceAndAssert(approval, new ApprovalAttachmentRequest(
                ApprovalAttachmentType.SLIP_REF, "세금계산서", 4,
                null, null, null, null, null,
                ApprovalReferenceDocType.TAX_INVOICE, "2026/08/11-4", "삼한상사"),
                "TAX_INVOICE", "2026/08/11-4", "SLIP_REF");
        addReferenceAndAssert(approval, new ApprovalAttachmentRequest(
                ApprovalAttachmentType.SLIP_REF, "거래명세서", 5,
                null, null, null, null, null,
                ApprovalReferenceDocType.STATEMENT, "2026/08/11-5", "삼한상사"),
                "STATEMENT", "2026/08/11-5", "SLIP_REF");
        addReferenceAndAssert(approval, new ApprovalAttachmentRequest(
                ApprovalAttachmentType.PARTNER_LEDGER_REF, "거래처원장", 6,
                null, null, "P-001", "삼한상사", "2026-08",
                null, null, null), "PARTNER_LEDGER", null, "PARTNER_LEDGER_REF");

        mvc.perform(get("/admin/groupware/approvals/{approvalId}/attachments", approval.getId())
                        .header("X-User-Id", ACTOR_ID))
                .andDo(org.springframework.test.web.servlet.result.MockMvcResultHandlers.print())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(6))
                .andExpect(jsonPath("$.data[0].attachmentType").value("SLIP_REF"))
                .andExpect(jsonPath("$.data[0].refDocType").value("OUTBOUND_SLIP"))
                .andExpect(jsonPath("$.data[1].refDocType").value("INBOUND_SLIP"))
                .andExpect(jsonPath("$.data[2].refDocType").value("JOURNAL"))
                .andExpect(jsonPath("$.data[3].refDocType").value("TAX_INVOICE"))
                .andExpect(jsonPath("$.data[4].refDocType").value("STATEMENT"))
                .andExpect(jsonPath("$.data[5].attachmentType").value("PARTNER_LEDGER_REF"))
                .andExpect(jsonPath("$.data[5].refDocType").value("PARTNER_LEDGER"));
    }

    /** 정산서 참조를 실제 POST 경로로 저장한 뒤 같은 번호로 역방향 조회한다. */
    @Test
    void salesCommissionSettlementReference_roundTripsFromAttachmentToApprovals() throws Exception {
        ApprovalLine approval = seedApproval("영업수수료 정산 지출결의");

        mvc.perform(post("/admin/groupware/approvals/{approvalId}/attachments", approval.getId())
                        .header("X-User-Id", ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "attachmentType", "SLIP_REF",
                                "label", "영업수수료 정산서",
                                "displayOrder", 1,
                                "refDocType", "SALES_COMMISSION_SETTLEMENT",
                                "refDocNo", "2026/08/11-9001",
                                "refDocLabel", "영업수수료 정산"))))
                .andDo(org.springframework.test.web.servlet.result.MockMvcResultHandlers.print())
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.attachmentType").value("SLIP_REF"))
                .andExpect(jsonPath("$.data.refDocType").value("SALES_COMMISSION_SETTLEMENT"))
                .andExpect(jsonPath("$.data.refDocNo").value("2026/08/11-9001"));

        mvc.perform(get("/admin/groupware/approval-references")
                        .header("X-User-Id", ACTOR_ID)
                        .param("refDocType", "SALES_COMMISSION_SETTLEMENT")
                        .param("refDocNo", "2026/08/11-9001"))
                .andDo(org.springframework.test.web.servlet.result.MockMvcResultHandlers.print())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].approvalNo").value(approval.getApprovalNo()))
                .andExpect(jsonPath("$.data[0].title").value("영업수수료 정산 지출결의"))
                .andExpect(jsonPath("$.data[0].status").value("PENDING"));
    }

    /** 같은 정산서 번호를 여러 결재가 참조할 수 있고, 반려 상태는 조회에만 반영한다. */
    @Test
    void sameSettlementReference_canBeAttachedToMultipleApprovals_andRejectedStatusIsReadable() throws Exception {
        ApprovalLine pending = seedApproval("정산 다중 참조 대기");
        ApprovalLine rejected = seedApproval("정산 다중 참조 반려");
        String settlementNo = "2026/08/11-9002";

        addSettlementReference(pending, settlementNo);
        addSettlementReference(rejected, settlementNo);
        rejected.reject(rejected.getStepsView().get(0).getApproverUserId(), "검토 반려");
        approvalLineRepository.saveAndFlush(rejected);

        mvc.perform(get("/admin/groupware/approval-references")
                        .header("X-User-Id", ACTOR_ID)
                        .param("refDocType", ApprovalReferenceDocType.SALES_COMMISSION_SETTLEMENT.name())
                        .param("refDocNo", settlementNo))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[*].status", containsInAnyOrder("PENDING", "REJECTED")));
    }

    /** 번호 없는 DRAFT, 40자 초과 번호는 거부하고, 원장에 없는 번호의 존재 검증은 첨부 책임으로 만들지 않는다. */
    @Test
    void settlementReference_validatesNumberBoundary_andDoesNotInventSourceExistenceCheck() throws Exception {
        ApprovalLine approval = seedApproval("정산 참조 경계");
        String basePath = "/admin/groupware/approvals/{approvalId}/attachments";

        mvc.perform(post(basePath, approval.getId())
                        .header("X-User-Id", ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "attachmentType", "SLIP_REF",
                                "refDocType", "SALES_COMMISSION_SETTLEMENT",
                                "label", "번호 없는 정산서"))))
                .andExpect(status().isBadRequest());

        mvc.perform(post(basePath, approval.getId())
                        .header("X-User-Id", ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "attachmentType", "SLIP_REF",
                                "refDocType", "SALES_COMMISSION_SETTLEMENT",
                                "refDocNo", "x".repeat(41),
                                "label", "긴 번호"))))
                .andExpect(status().isBadRequest());

        mvc.perform(post(basePath, approval.getId())
                        .header("X-User-Id", ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "attachmentType", "SLIP_REF",
                                "refDocType", "SALES_COMMISSION_SETTLEMENT",
                                "refDocNo", "2099/01/01-unknown",
                                "label", "미존재 번호"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.refDocNo").value("2099/01/01-unknown"));
    }

    /** 참조 첨부를 삭제하면 역방향 결재 목록에서도 제외한다. */
    @Test
    void deletedSettlementReference_isExcludedFromReverseLookup() throws Exception {
        ApprovalLine approval = seedApproval("삭제된 정산 참조");
        String settlementNo = "2026/08/11-9003";
        String created = addSettlementReference(approval, settlementNo);
        UUID attachmentId = UUID.fromString(objectMapper.readTree(created).path("data").path("id").asText());

        mvc.perform(delete("/admin/groupware/approvals/{approvalId}/attachments/{attachmentId}",
                        approval.getId(), attachmentId)
                        .header("X-User-Id", ACTOR_ID))
                .andExpect(status().isOk());

        mvc.perform(get("/admin/groupware/approval-references")
                        .header("X-User-Id", ACTOR_ID)
                        .param("refDocType", ApprovalReferenceDocType.SALES_COMMISSION_SETTLEMENT.name())
                        .param("refDocNo", settlementNo))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(0));
    }

    private String addSettlementReference(ApprovalLine approval, String settlementNo) throws Exception {
        return mvc.perform(post("/admin/groupware/approvals/{approvalId}/attachments", approval.getId())
                        .header("X-User-Id", ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "attachmentType", "SLIP_REF",
                                "label", "영업수수료 정산서",
                                "displayOrder", 1,
                                "refDocType", "SALES_COMMISSION_SETTLEMENT",
                                "refDocNo", settlementNo,
                                "refDocLabel", "영업수수료 정산"))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    private void addReferenceAndAssert(ApprovalLine approval, ApprovalAttachmentRequest request,
                                       String refDocType, String refDocNo,
                                       String attachmentType) throws Exception {
        mvc.perform(post("/admin/groupware/approvals/{approvalId}/attachments", approval.getId())
                        .header("X-User-Id", ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andDo(org.springframework.test.web.servlet.result.MockMvcResultHandlers.print())
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.attachmentType").value(attachmentType))
                .andExpect(jsonPath("$.data.refDocType").value(refDocType));
        if (refDocNo == null) {
            mvc.perform(get("/admin/groupware/approvals/{approvalId}/attachments", approval.getId())
                            .header("X-User-Id", ACTOR_ID))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data[5].refDocNo").doesNotExist());
        } else {
            mvc.perform(get("/admin/groupware/approvals/{approvalId}/attachments", approval.getId())
                            .header("X-User-Id", ACTOR_ID))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data[?(@.refDocNo == '" + refDocNo + "')].refDocNo").value(refDocNo));
        }
    }

    /** collab 수정완료는 field.{key} overlay 를 허용하고 템플릿 스키마 위반은 400 으로 거부한다. */
    @Test
    void collabEdit_allowsTemplateFieldOverlayAndRejectsInvalidField() throws Exception {
        ApprovalTemplate template = seedExpenseTemplate();
        ApprovalLine approval = approvalLineService.create(new ApprovalLineCreateRequest(
                UUID.randomUUID(), "필드 결재", null, List.of(UUID.randomUUID()),
                template.getId(), Map.of(
                        "amount", "1000",
                        "spentAt", "2026-06-14",
                        "account", "복리후생비")));

        mvc.perform(post("/admin/groupware/approvals/{approvalId}/collab/edits", approval.getId())
                        .header("X-User-Id", ACTOR_ID)
                        .header("X-User-Name", "필드수정자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"field.amount\":{\"after\":\"2000\"}}"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.approval.fieldValues.amount").value("2000"));

        mvc.perform(post("/admin/groupware/approvals/{approvalId}/collab/edits", approval.getId())
                        .header("X-User-Id", ACTOR_ID)
                        .header("X-User-Name", "필드수정자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"field.unknown\":{\"after\":\"x\"}}"))))
                .andExpect(status().isBadRequest());
    }

    private ApprovalLine seedApproval(String title) {
        ApprovalLine approval = approvalLineService.create(new ApprovalLineCreateRequest(
                UUID.randomUUID(), title, "본문", List.of(UUID.randomUUID()), null, null));
        return approvalLineRepository.saveAndFlush(approval);
    }

    private ApprovalLine seedApprovedApproval() {
        UUID approver = UUID.randomUUID();
        ApprovalLine approval = approvalLineService.create(new ApprovalLineCreateRequest(
                UUID.randomUUID(), "승인완료 결재", "본문", List.of(approver), null, null));
        approval.approve(approver);
        return approvalLineRepository.saveAndFlush(approval);
    }

    private ApprovalTemplate seedExpenseTemplate() {
        // V5 Flyway 시드(EXPENSE_REPORT)와 code 충돌 회피 — Hibernate flush 가 INSERT 를 setUp
        // 의 pending DELETE 보다 먼저 실행해 partial unique index 충돌이 나므로 고유 code 사용.
        ApprovalTemplate template = templateRepository.saveAndFlush(
                ApprovalTemplate.create("EXPENSE_REPORT_IT", "지출결의서", "지출 결재", true, 1));
        fieldRepository.saveAll(List.of(
                ApprovalTemplateField.create(template, "amount", "금액", ApprovalFieldType.NUMBER,
                        true, 1, null, null),
                ApprovalTemplateField.create(template, "spentAt", "지출일", ApprovalFieldType.DATE,
                        true, 2, null, null),
                ApprovalTemplateField.create(template, "account", "계정과목", ApprovalFieldType.SELECT,
                        true, 3, "[\"복리후생비\",\"여비교통비\"]", null)));
        return template;
    }
}
