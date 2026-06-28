package com.samhanair.logis.groupware.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.samhanair.logis.approval.ApprovalStatus;
import com.samhanair.logis.approval.StepType;
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

/** 중앙 결재선 config 기반 그룹웨어 ApprovalStep 인스턴스화 IT. */
@SpringBootTest(classes = GroupwareServiceApplication.class)
@Transactional
class ApprovalLineConfigInstantiationIT extends AbstractPostgresIT {

    private static final String DOCUMENT_TYPE = "GROUPWARE_EXPENSE_REPORT_IT";

    @Autowired private ApprovalLineService approvalLineService;
    @Autowired private ApprovalLineRepository approvalLineRepository;
    @Autowired private ApprovalTemplateRepository templateRepository;
    @Autowired private ApprovalTemplateFieldRepository fieldRepository;
    @Autowired private ApprovalNumberSequenceRepository numberSequenceRepository;

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
    void configuredDocument_instantiates_configRoles_and_requestOverride() {
        UUID overrideUser = UUID.randomUUID();
        when(configClient.fetchRoles(DOCUMENT_TYPE)).thenReturn(configLine(List.of(
                new ResolvedRole(0, StepType.CREATOR, null, null, null),
                new ResolvedRole(1, StepType.GROUP, null, groupId, "groupware.approvals"),
                new ResolvedRole(2, StepType.USER, representative, null, null))));

        ApprovalLine line = approvalLineService.create(new ApprovalLineCreateRequest(
                requester, "지출 결재", "본문", List.of(overrideUser), template.getId(), Map.of()));

        assertThat(line.getDocumentType()).isEqualTo(DOCUMENT_TYPE);
        assertThat(line.getStepsView()).hasSize(4);
        assertThat(line.getStepsView()).extracting(step -> step.getStepType())
                .containsExactly(StepType.USER, StepType.GROUP, StepType.USER, StepType.USER);
        assertThat(line.getStepsView().get(0).getApproverUserId()).isEqualTo(requester);
        assertThat(line.getStepsView().get(1).getApproverGroupId()).isEqualTo(groupId);
        assertThat(line.getStepsView().get(2).getApproverUserId()).isEqualTo(representative);
        assertThat(line.getStepsView().get(3).getApproverUserId()).isEqualTo(overrideUser);
    }

    @Test
    void groupStep_allows_groupMember_and_blocks_nonMember() {
        UUID actor = UUID.randomUUID();
        when(configClient.fetchRoles(DOCUMENT_TYPE)).thenReturn(configLine(List.of(
                new ResolvedRole(0, StepType.GROUP, null, groupId, "groupware.approvals"))));
        ApprovalLine line = approvalLineService.create(new ApprovalLineCreateRequest(
                requester, "그룹 결재", null, List.of(), template.getId(), Map.of()));

        assertThatThrownBy(() -> line.approve(actor, Set.of(UUID.randomUUID()), Set.of()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("결재자가 아닙니다");

        line.approve(actor, Set.of(groupId), Set.of());

        assertThat(line.getStatus()).isEqualTo(ApprovalStatus.APPROVED);
    }

    @Test
    void groupRole_with_singleUserOverride_instantiates_userStep() {
        when(configClient.fetchRoles(DOCUMENT_TYPE)).thenReturn(configLine(List.of(
                new ResolvedRole(0, StepType.USER, representative, null, null))));

        ApprovalLine line = approvalLineService.create(new ApprovalLineCreateRequest(
                requester, "1인 지정", null, List.of(), template.getId(), Map.of()));

        assertThat(line.getStepsView()).hasSize(1);
        assertThat(line.getStepsView().get(0).getStepType()).isEqualTo(StepType.USER);
        assertThat(line.getStepsView().get(0).getApproverUserId()).isEqualTo(representative);
    }

    @Test
    void unconfiguredDocument_keeps_manualChain_regression() {
        UUID manualApprover = UUID.randomUUID();
        when(configClient.fetchRoles(DOCUMENT_TYPE))
                .thenReturn(GroupwareApprovalLineConfigClient.ConfigLine.unconfigured());

        ApprovalLine line = approvalLineService.create(new ApprovalLineCreateRequest(
                requester, "수동 결재", null, List.of(manualApprover), template.getId(), Map.of()));

        assertThat(line.getStepsView()).hasSize(1);
        assertThat(line.getStepsView().get(0).getStepType()).isEqualTo(StepType.USER);
        assertThat(line.getStepsView().get(0).getApproverUserId()).isEqualTo(manualApprover);
    }

    private GroupwareApprovalLineConfigClient.ConfigLine configLine(List<ResolvedRole> roles) {
        return new GroupwareApprovalLineConfigClient.ConfigLine(true, roles);
    }
}
