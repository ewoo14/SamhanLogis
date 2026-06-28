package com.samhanair.logis.groupware.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.samhanair.logis.approval.ApprovalStatus;
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
     * GROUP 단계 멤버 → 서비스 approve 통과 / 비멤버 → 서비스 approve BusinessException(CONFLICT).
     *
     * <p>도메인 {@code line.approve()} 직접 호출 금지 — 서비스 경로를 통해
     * false-green 없이 GROUP 멤버십 판정을 검증한다.
     */
    @Test
    void groupStep_allows_groupMember_and_blocks_nonMember() {
        UUID memberActor = UUID.randomUUID();
        UUID nonMember = UUID.randomUUID();
        when(configClient.fetchRoles(DOCUMENT_TYPE)).thenReturn(configLine(List.of(
                new ResolvedRole(0, StepType.GROUP, null, groupId, "groupware.approvals"))));
        ApprovalLine line = approvalLineService.create(new ApprovalLineCreateRequest(
                requester, "그룹 결재", null, List.of(), template.getId(), Map.of()));

        UUID approvalId = line.getId();
        em.flush();
        em.clear();

        // 비멤버(다른 그룹만 보유) → CONFLICT
        assertThatThrownBy(() ->
                approvalLineService.approve(approvalId, nonMember, Set.of(UUID.randomUUID())))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));

        // 그룹 멤버 → APPROVED
        ApprovalLine approved = approvalLineService.approve(approvalId, memberActor, Set.of(groupId));
        assertThat(approved.getStatus()).isEqualTo(ApprovalStatus.APPROVED);
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
