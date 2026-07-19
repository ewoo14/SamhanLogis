package com.samhanair.logis.groupware.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.samhanair.logis.approval.ApprovalStatus;
import com.samhanair.logis.approval.ApprovalStepStatus;
import com.samhanair.logis.approval.StepType;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.groupware.GroupwareServiceApplication;
import com.samhanair.logis.groupware.client.GroupwareApprovalLineConfigClient;
import com.samhanair.logis.groupware.client.UserClient;
import com.samhanair.logis.groupware.domain.ApprovalLine;
import com.samhanair.logis.groupware.domain.ApprovalTemplate;
import com.samhanair.logis.groupware.domain.ResolvedRole;
import com.samhanair.logis.groupware.dto.ApprovalLineCreateRequest;
import com.samhanair.logis.groupware.repository.ApprovalLineRepository;
import com.samhanair.logis.groupware.repository.ApprovalNumberSequenceRepository;
import com.samhanair.logis.groupware.repository.ApprovalTemplateFieldRepository;
import com.samhanair.logis.groupware.repository.ApprovalTemplateRepository;
import com.samhanair.logis.groupware.service.ApprovalLineService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/**
 * 중앙 결재선 config 기반 그룹웨어 ApprovalStep 인스턴스화 IT.
 *
 * <p>각 테스트는 DB flush + clear 후 재로드하여 영속 단계를 단언한다.
 * GROUP 단계 검증은 도메인 직접 호출이 아닌 서비스 경로({@link ApprovalLineService#approve})로
 * 수행하여 false-green 을 방지한다.
 */
@SpringBootTest(classes = GroupwareServiceApplication.class)
@Transactional
class ApprovalLineConfigInstantiationIT extends AbstractPostgresIT {

    private static final String DOCUMENT_TYPE = "GROUPWARE_EXPENSE_REPORT_IT";

    @Autowired private ApprovalLineService approvalLineService;
    @Autowired private ApprovalLineRepository approvalLineRepository;
    @Autowired private ApprovalTemplateRepository templateRepository;
    @Autowired private ApprovalTemplateFieldRepository fieldRepository;
    @Autowired private ApprovalNumberSequenceRepository numberSequenceRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    @PersistenceContext
    private EntityManager em;

    @MockBean private GroupwareApprovalLineConfigClient configClient;
    @MockBean private UserClient userClient;

    private UUID requester;
    private UUID representative;
    private UUID groupId;
    private ApprovalTemplate template;

    @BeforeEach
    void setUp() {
        approvalLineRepository.deleteAll();
        numberSequenceRepository.deleteAll();
        fieldRepository.deleteAll();
        templateRepository.deleteAll();
        requester = UUID.randomUUID();
        representative = UUID.randomUUID();
        groupId = UUID.randomUUID();
        template = templateRepository.saveAndFlush(
                ApprovalTemplate.create("EXPENSE_REPORT_IT", "지출결의서", "IT", true, 1));
        lenient().when(userClient.verifyBulk(anyList())).thenAnswer(inv -> {
            List<UUID> ids = inv.getArgument(0);
            java.util.Map<UUID, Boolean> result = new java.util.HashMap<>();
            ids.forEach(id -> result.put(id, true));
            return result;
        });
        lenient().when(userClient.resolveDisplayNames(anyList())).thenReturn(Map.of());
    }

    @Test
    void approvalLine_with60CharCode_persists70CharDocumentType_andDatabaseRejects71() {
        String code = "C".repeat(60);
        ApprovalTemplate longTemplate = templateRepository.saveAndFlush(
                ApprovalTemplate.create(code, "60자 결재유형", "IT", true, 2));
        when(configClient.fetchRoles("GROUPWARE_" + code))
                .thenReturn(GroupwareApprovalLineConfigClient.ConfigLine.unconfigured());

        ApprovalLine line = approvalLineService.create(new ApprovalLineCreateRequest(
                requester, "70자 documentType 결재", "본문", List.of(UUID.randomUUID()),
                longTemplate.getId(), Map.of()));
        em.flush();
        em.clear();

        ApprovalLine reloaded = approvalLineRepository.findById(line.getId()).orElseThrow();
        assertThat(reloaded.getDocumentType()).isEqualTo("GROUPWARE_" + code).hasSize(70);
        assertThatThrownBy(() -> ApprovalTemplate.create("C".repeat(61), "61자 결재유형", "IT", true, 3))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));

        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO approval_lines
                    (id, requester_id, title, content, status, approval_no,
                     created_at, created_by, is_deleted, document_type)
                VALUES (?, ?, ?, ?, 'PENDING', ?, NOW(), ?, FALSE, ?)
                """, UUID.randomUUID(), UUID.randomUUID(), "71자 직접 입력", "본문",
                "2099/01/01-848-71", "approval-line-config-it", "T".repeat(71)))
                .isInstanceOf(RuntimeException.class);
    }

    /**
     * 설정된 문서 유형은 config 역할과 수동 override 를 합산한 단계로 인스턴스화된다.
     * DB flush + clear 후 재로드하여 영속된 단계 순서·타입·식별자를 단언한다.
     */
    @Test
    void configuredDocument_instantiates_configRoles_and_requestOverride() {
        UUID overrideUser = UUID.randomUUID();
        when(configClient.fetchRoles(DOCUMENT_TYPE)).thenReturn(configLine(List.of(
                new ResolvedRole(0, StepType.CREATOR, null, null, null),
                new ResolvedRole(1, StepType.GROUP, null, groupId, "groupware.approvals"),
                new ResolvedRole(2, StepType.USER, representative, null, null))));

        ApprovalLine line = approvalLineService.create(new ApprovalLineCreateRequest(
                requester, "지출 결재", "본문", List.of(overrideUser), template.getId(), Map.of()));

        UUID savedId = line.getId();
        em.flush();
        em.clear();
        ApprovalLine reloaded = approvalLineRepository.findById(savedId).orElseThrow();

        assertThat(reloaded.getDocumentType()).isEqualTo(DOCUMENT_TYPE);
        assertThat(reloaded.getStepsView()).hasSize(4);
        assertThat(reloaded.getStepsView()).extracting(step -> step.getStepType())
                .containsExactly(StepType.USER, StepType.GROUP, StepType.USER, StepType.USER);
        assertThat(reloaded.getStepsView().get(0).getApproverUserId()).isEqualTo(requester);
        assertThat(reloaded.getStepsView().get(1).getApproverGroupId()).isEqualTo(groupId);
        assertThat(reloaded.getStepsView().get(1).getApproverUserId()).isNull();
        assertThat(reloaded.getStepsView().get(2).getApproverUserId()).isEqualTo(representative);
        assertThat(reloaded.getStepsView().get(3).getApproverUserId()).isEqualTo(overrideUser);
    }

    /**
     * GROUP 단계 비멤버 → 서비스 approve 시 BusinessException(CONFLICT) 단언.
     *
     * <p>예외 케이스를 성공 케이스와 같은 @Transactional 내에서 혼합하면
     * RuntimeException 발생 후 트랜잭션이 rollback-only 로 표시되어
     * 후속 assert 가 false-green 이 될 수 있다. TX 오염 방지를 위해 별도 @Test 로 분리한다.
     */
    @Test
    void groupStep_blocks_nonMember() {
        UUID nonMember = UUID.randomUUID();
        when(configClient.fetchRoles(DOCUMENT_TYPE)).thenReturn(configLine(List.of(
                new ResolvedRole(0, StepType.GROUP, null, groupId, "groupware.approvals"))));
        ApprovalLine line = approvalLineService.create(new ApprovalLineCreateRequest(
                requester, "그룹 결재 비멤버 차단", null, List.of(), template.getId(), Map.of()));

        UUID approvalId = line.getId();
        em.flush();
        em.clear();

        // 비멤버(다른 그룹만 보유) → CONFLICT
        assertThatThrownBy(() ->
                approvalLineService.approve(approvalId, nonMember, Set.of(UUID.randomUUID())))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    /**
     * GROUP 단계 멤버 → 서비스 approve 통과 + DB flush/clear 후 영속 상태 단언.
     *
     * <p>도메인 {@code line.approve()} 직접 호출 금지 — 서비스 경로를 통해
     * false-green 없이 GROUP 멤버십 판정을 검증한다.
     * TX 오염 방지를 위해 {@link #groupStep_blocks_nonMember()} 와 분리 운영한다.
     */
    @Test
    void groupStep_allows_groupMember() {
        UUID memberActor = UUID.randomUUID();
        when(configClient.fetchRoles(DOCUMENT_TYPE)).thenReturn(configLine(List.of(
                new ResolvedRole(0, StepType.GROUP, null, groupId, "groupware.approvals"))));
        ApprovalLine line = approvalLineService.create(new ApprovalLineCreateRequest(
                requester, "그룹 결재 멤버 승인", null, List.of(), template.getId(), Map.of()));

        UUID approvalId = line.getId();
        em.flush();
        em.clear();

        // 그룹 멤버 → APPROVED
        ApprovalLine approved = approvalLineService.approve(approvalId, memberActor, Set.of(groupId));
        assertThat(approved.getStatus()).isEqualTo(ApprovalStatus.APPROVED);

        em.flush();
        em.clear();
        ApprovalLine reloaded = approvalLineRepository.findById(approvalId).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(ApprovalStatus.APPROVED);
        assertThat(reloaded.getStepsView()).hasSize(1);
        assertThat(reloaded.getStepsView().get(0).getStatus()).isEqualTo(ApprovalStepStatus.APPROVED);
        assertThat(reloaded.getStepsView().get(0).getApprovedByUserId()).isEqualTo(memberActor);
    }

    /**
     * GROUP 단계 멤버가 반려하면 결재선이 REJECTED 로 전이된다.
     */
    @Test
    void groupStep_groupMember_reject_propagates_to_line_rejected() {
        UUID memberActor = UUID.randomUUID();
        when(configClient.fetchRoles(DOCUMENT_TYPE)).thenReturn(configLine(List.of(
                new ResolvedRole(0, StepType.GROUP, null, groupId, "groupware.approvals"))));
        ApprovalLine line = approvalLineService.create(new ApprovalLineCreateRequest(
                requester, "그룹 반려 결재", null, List.of(), template.getId(), Map.of()));

        UUID approvalId = line.getId();
        em.flush();
        em.clear();

        ApprovalLine rejected = approvalLineService.reject(
                approvalId, memberActor, Set.of(groupId), "사유 부족");
        assertThat(rejected.getStatus()).isEqualTo(ApprovalStatus.REJECTED);

        em.flush();
        em.clear();
        ApprovalLine reloaded = approvalLineRepository.findById(approvalId).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(ApprovalStatus.REJECTED);
        assertThat(reloaded.getStepsView()).hasSize(1);
        assertThat(reloaded.getStepsView().get(0).getStatus()).isEqualTo(ApprovalStepStatus.REJECTED);
        assertThat(reloaded.getStepsView().get(0).getApprovedByUserId()).isEqualTo(memberActor);
    }

    @Test
    void groupRole_with_singleUserOverride_instantiates_userStep() {
        when(configClient.fetchRoles(DOCUMENT_TYPE)).thenReturn(configLine(List.of(
                new ResolvedRole(0, StepType.USER, representative, null, null))));

        ApprovalLine line = approvalLineService.create(new ApprovalLineCreateRequest(
                requester, "1인 지정", null, List.of(), template.getId(), Map.of()));

        UUID savedId = line.getId();
        em.flush();
        em.clear();
        ApprovalLine reloaded = approvalLineRepository.findById(savedId).orElseThrow();

        assertThat(reloaded.getStepsView()).hasSize(1);
        assertThat(reloaded.getStepsView().get(0).getStepType()).isEqualTo(StepType.USER);
        assertThat(reloaded.getStepsView().get(0).getApproverUserId()).isEqualTo(representative);
    }

    @Test
    void unconfiguredDocument_keeps_manualChain_regression() {
        UUID manualApprover = UUID.randomUUID();
        when(configClient.fetchRoles(DOCUMENT_TYPE))
                .thenReturn(GroupwareApprovalLineConfigClient.ConfigLine.unconfigured());

        ApprovalLine line = approvalLineService.create(new ApprovalLineCreateRequest(
                requester, "수동 결재", null, List.of(manualApprover), template.getId(), Map.of()));

        UUID savedId = line.getId();
        em.flush();
        em.clear();
        ApprovalLine reloaded = approvalLineRepository.findById(savedId).orElseThrow();

        assertThat(reloaded.getStepsView()).hasSize(1);
        assertThat(reloaded.getStepsView().get(0).getStepType()).isEqualTo(StepType.USER);
        assertThat(reloaded.getStepsView().get(0).getApproverUserId()).isEqualTo(manualApprover);
    }

    private GroupwareApprovalLineConfigClient.ConfigLine configLine(List<ResolvedRole> roles) {
        return new GroupwareApprovalLineConfigClient.ConfigLine(true, roles);
    }
}
