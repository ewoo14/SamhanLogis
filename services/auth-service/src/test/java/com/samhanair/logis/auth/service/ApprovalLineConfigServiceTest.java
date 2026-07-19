package com.samhanair.logis.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.samhanair.logis.approval.StepType;
import com.samhanair.logis.auth.domain.Account;
import com.samhanair.logis.auth.domain.ApprovalLineApprover;
import com.samhanair.logis.auth.domain.ApprovalLineConfig;
import com.samhanair.logis.auth.domain.ApproverType;
import com.samhanair.logis.auth.domain.PermissionGroup;
import com.samhanair.logis.auth.repository.AccountRepository;
import com.samhanair.logis.auth.repository.ApprovalLineApproverRepository;
import com.samhanair.logis.auth.repository.ApprovalLineConfigRepository;
import com.samhanair.logis.auth.repository.PermissionGroupRepository;
import com.samhanair.logis.auth.web.dto.ApprovalLineDefaultApproverView;
import com.samhanair.logis.auth.web.dto.ApprovalLineRoleView;
import com.samhanair.logis.auth.web.dto.ApprovalLineStructureView;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.lang.reflect.Field;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ApprovalLineConfigServiceTest {

    @Mock ApprovalLineConfigRepository repository;
    @Mock ApprovalLineApproverRepository approverRepository;
    @Mock PermissionGroupRepository groupRepository;
    @Mock AccountRepository accountRepository;
    @InjectMocks ApprovalLineConfigService service;

    @BeforeEach
    void defaults() {
        lenient().when(approverRepository.findByConfigRoleIdAndIsDeletedFalse(any()))
                .thenReturn(List.of());
    }

    @Test
    void addStep_은_70자까지_허용하고_71자는_INVALID_INPUT으로_거부한다() {
        when(repository.save(any(ApprovalLineConfig.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        assertThat(service.addStep("D".repeat(70), "70자 역할").label()).isEqualTo("70자 역할");
        assertThatThrownBy(() -> service.addStep("D".repeat(71), "71자 역할"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT))
                .hasMessageContaining("70");
    }

    @Test
    void createDisplayStep_도_70자까지_허용하고_71자를_거부한다() {
        assertThat(ApprovalLineConfig.createDisplayStep("D".repeat(70), 0, "표시 역할")
                .getDocumentType()).hasSize(70);

        assertThatThrownBy(() -> ApprovalLineConfig.createDisplayStep("D".repeat(71), 0, "초과 역할"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("70");
    }

    /** 리플렉션으로 테스트 픽스처 엔티티 생성(생성자 protected). */
    static ApprovalLineConfig role(int seq, String label, StepType type) {
        try {
            var ctor = ApprovalLineConfig.class.getDeclaredConstructor();
            ctor.setAccessible(true);
            ApprovalLineConfig c = ctor.newInstance();
            set(c, "id", UUID.randomUUID());
            set(c, "documentType", "SLIP_OUTBOUND");
            set(c, "sequence", seq);
            set(c, "label", label);
            set(c, "stepType", type);
            set(c, "required", true);
            return c;
        } catch (Exception ex) { throw new RuntimeException(ex); }
    }
    static void set(Object o, String f, Object v) throws Exception {
        Field fld = ApprovalLineConfig.class.getDeclaredField(f); fld.setAccessible(true); fld.set(o, v);
    }

    @Test
    void listRoles_은_sequence순_역할을_반환한다() {
        when(repository.findByDocumentTypeOrderBySequenceAsc("SLIP_OUTBOUND"))
                .thenReturn(List.of(role(0, "작성자", StepType.CREATOR), role(1, "출고인", StepType.GROUP)));
        List<ApprovalLineRoleView> views = service.listRoles("SLIP_OUTBOUND");
        assertThat(views).hasSize(2);
        assertThat(views.get(0).label()).isEqualTo("작성자");
        assertThat(views.get(1).stepType()).isEqualTo(StepType.GROUP);
    }

    @Test
    void listStructure_은_결재자_없이_구조와_actionKey만_반환한다() throws Exception {
        ApprovalLineConfig creator = role(0, "작성자", StepType.CREATOR);
        ApprovalLineConfig dispatcher = role(1, "출고자", StepType.GROUP);
        ApprovalLineConfig inspector = role(2, "검수자", StepType.GROUP);
        set(dispatcher, "actionKey", "OUTBOUND_DISPATCH");
        set(inspector, "actionKey", "OUTBOUND_INSPECT");
        when(repository.findByDocumentTypeOrderBySequenceAsc("SLIP_OUTBOUND"))
                .thenReturn(List.of(creator, dispatcher, inspector));

        List<ApprovalLineStructureView> views = service.listStructure("SLIP_OUTBOUND");

        assertThat(views)
                .extracting(ApprovalLineStructureView::label)
                .containsExactly("작성자", "출고자", "검수자");
        assertThat(views)
                .extracting(ApprovalLineStructureView::actionKey)
                .containsExactly(null, "OUTBOUND_DISPATCH", "OUTBOUND_INSPECT");
    }

    @Test
    void listDefaultApprovers_는_USER결재자만_sequence순_표시명과_함께_반환한다() {
        UUID groupId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        ApprovalLineConfig groupOnlyRole = role(1, "검토자", StepType.GROUP);
        ApprovalLineConfig userRole = role(2, "승인자", StepType.GROUP);
        ApprovalLineApprover groupApprover =
                ApprovalLineApprover.create(groupOnlyRole.getId(), ApproverType.GROUP, groupId);
        ApprovalLineApprover userApprover =
                ApprovalLineApprover.create(userRole.getId(), ApproverType.USER, userId);

        when(repository.findByDocumentTypeOrderBySequenceAsc("GROUPWARE_EXPENSE_REPORT"))
                .thenReturn(List.of(groupOnlyRole, userRole));
        when(approverRepository.findByConfigRoleIdAndIsDeletedFalse(groupOnlyRole.getId()))
                .thenReturn(List.of(groupApprover));
        when(approverRepository.findByConfigRoleIdAndIsDeletedFalse(userRole.getId()))
                .thenReturn(List.of(userApprover));
        when(accountRepository.findActiveById(userId))
                .thenReturn(Optional.of(Account.createWithId(userId, "approver", "{noop}pw", "김승인")));

        List<ApprovalLineDefaultApproverView> views =
                service.listDefaultApprovers("GROUPWARE_EXPENSE_REPORT");

        assertThat(views).hasSize(1);
        assertThat(views.get(0).sequence()).isEqualTo(2);
        assertThat(views.get(0).label()).isEqualTo("승인자");
        assertThat(views.get(0).userId()).isEqualTo(userId);
        assertThat(views.get(0).displayName()).isEqualTo("김승인");
    }

    @Test
    void updateRole_은_GROUP역할의_필수여부만_갱신한다() {
        UUID id = UUID.randomUUID();
        ApprovalLineConfig group = role(1, "출고인", StepType.GROUP);
        when(repository.findById(id)).thenReturn(Optional.of(group));
        when(repository.save(group)).thenReturn(group);
        ApprovalLineRoleView view = service.updateRole(id, false);
        assertThat(view.approvers()).isEmpty();
        assertThat(view.required()).isFalse();
    }

    @Test
    void updateRole_은_CREATOR역할_변경을_거부한다() {
        UUID id = UUID.randomUUID();
        when(repository.findById(id)).thenReturn(Optional.of(role(0, "작성자", StepType.CREATOR)));
        assertThatThrownBy(() -> service.updateRole(id, true))
                .hasMessageContaining("작성자 역할은 변경할 수 없습니다");
    }

    @Test
    void updateRole_은_CREATOR역할의_필수여부변경도_거부한다() {
        UUID id = UUID.randomUUID();
        when(repository.findById(id)).thenReturn(Optional.of(role(0, "작성자", StepType.CREATOR)));
        assertThatThrownBy(() -> service.updateRole(id, false))
                .hasMessageContaining("작성자 역할은 변경할 수 없습니다");
    }

    @Test
    void assignGroup_은_GROUP이_아닌_역할을_INVALID_INPUT으로_거부한다() {
        ApprovalLineConfig creator = role(0, "작성자", StepType.CREATOR);

        assertThatThrownBy(() -> creator.assignGroup(UUID.randomUUID()))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assertThat(be.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT);
                    assertThat(be.getMessage()).isEqualTo("권한 그룹은 그룹 결재단계에만 지정할 수 있습니다: 작성자");
                });
    }

    @Test
    void updateRole_은_미존재시_404() {
        UUID id = UUID.randomUUID();
        when(repository.findById(id)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.updateRole(id, true))
                .hasMessageContaining("찾을 수 없습니다");
    }

    // ===== renameRole 테스트 =====

    @Test
    void renameRole_은_GROUP역할_라벨을_변경한다() {
        UUID id = UUID.randomUUID();
        ApprovalLineConfig outbound = role(1, "출고인", StepType.GROUP);
        when(repository.findById(id)).thenReturn(Optional.of(outbound));
        when(repository.save(outbound)).thenReturn(outbound);

        ApprovalLineRoleView view = service.renameRole(id, "출고담당");

        assertThat(view.label()).isEqualTo("출고담당");
    }

    @Test
    void renameRole_은_앞뒤_공백을_trim한다() {
        UUID id = UUID.randomUUID();
        ApprovalLineConfig outbound = role(1, "출고인", StepType.GROUP);
        when(repository.findById(id)).thenReturn(Optional.of(outbound));
        when(repository.save(outbound)).thenReturn(outbound);

        ApprovalLineRoleView view = service.renameRole(id, "  출고담당  ");

        assertThat(view.label()).isEqualTo("출고담당");
    }

    @Test
    void renameRole_은_blank_라벨을_거부한다() {
        UUID id = UUID.randomUUID();
        ApprovalLineConfig outbound = role(1, "출고인", StepType.GROUP);
        when(repository.findById(id)).thenReturn(Optional.of(outbound));

        assertThatThrownBy(() -> service.renameRole(id, "  "))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("라벨은 비어 있을 수 없습니다");
    }

    @Test
    void renameRole_은_null_라벨을_거부한다() {
        UUID id = UUID.randomUUID();
        ApprovalLineConfig outbound = role(1, "출고인", StepType.GROUP);
        when(repository.findById(id)).thenReturn(Optional.of(outbound));

        assertThatThrownBy(() -> service.renameRole(id, null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("라벨은 비어 있을 수 없습니다");
    }

    @Test
    void renameRole_은_CREATOR역할을_거부한다() {
        UUID id = UUID.randomUUID();
        when(repository.findById(id)).thenReturn(Optional.of(role(0, "작성자", StepType.CREATOR)));

        assertThatThrownBy(() -> service.renameRole(id, "새작성자"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("작성자 역할은 변경할 수 없습니다");
    }

    @Test
    void renameRole_은_미존재_역할에_NOT_FOUND를_반환한다() {
        UUID id = UUID.randomUUID();
        when(repository.findById(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.renameRole(id, "새라벨"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("찾을 수 없습니다");
    }

    // ===== reorderRoles 테스트 =====

    @Test
    void reorderRoles_는_blank_documentType을_거부한다() {
        assertThatThrownBy(() -> service.reorderRoles(" ", List.of(UUID.randomUUID())))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("전표 종류(documentType)를 입력해야 합니다");
    }

    @Test
    void reorderRoles_는_미존재_documentType을_거부한다() {
        when(repository.findByDocumentTypeOrderBySequenceAsc("UNKNOWN"))
                .thenReturn(List.of());

        assertThatThrownBy(() -> service.reorderRoles("UNKNOWN", List.of(UUID.randomUUID())))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("결재라인을 찾을 수 없습니다");
    }

    @Test
    void reorderRoles_는_순서를_재할당한다() {
        ApprovalLineConfig creator = role(0, "작성자", StepType.CREATOR);
        ApprovalLineConfig outbound = role(1, "출고인", StepType.GROUP);
        ApprovalLineConfig inspector = role(2, "검수인", StepType.GROUP);

        UUID creatorId = creator.getId();
        UUID outboundId = outbound.getId();
        UUID inspectorId = inspector.getId();

        List<ApprovalLineConfig> active = List.of(creator, outbound, inspector);
        // saveAllAndFlush 호출은 2회 → 각 호출마다 동일 리스트 반환
        when(repository.findByDocumentTypeOrderBySequenceAsc("SLIP_OUTBOUND"))
                .thenReturn(active)                  // 1차: 활성 조회
                .thenReturn(active);                 // 2차: 최종 재조회(결과 반환용)
        when(repository.saveAllAndFlush(anyList())).thenReturn(active);

        // 출고인 ↔ 검수인 swap: [creator, inspector, outbound]
        List<ApprovalLineRoleView> result = service.reorderRoles(
                "SLIP_OUTBOUND", List.of(creatorId, inspectorId, outboundId));

        // Phase 1 후 음수 오프셋 확인
        // Phase 2 후 sequence 재할당: creator=0, inspector=1, outbound=2
        // creator 는 항상 0 고정
        assertThat(creator.getSequence()).isEqualTo(0);
        assertThat(inspector.getSequence()).isEqualTo(1);
        assertThat(outbound.getSequence()).isEqualTo(2);
    }

    @Test
    void reorderRoles_는_CREATOR가_1순위_아니면_거부한다() {
        ApprovalLineConfig creator = role(0, "작성자", StepType.CREATOR);
        ApprovalLineConfig outbound = role(1, "출고인", StepType.GROUP);
        ApprovalLineConfig inspector = role(2, "검수인", StepType.GROUP);

        when(repository.findByDocumentTypeOrderBySequenceAsc("SLIP_OUTBOUND"))
                .thenReturn(List.of(creator, outbound, inspector));

        // 작성자가 첫 번째가 아닌 순서 요청 — outbound 가 첫 번째
        assertThatThrownBy(() -> service.reorderRoles("SLIP_OUTBOUND",
                List.of(outbound.getId(), creator.getId(), inspector.getId())))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("작성자는 항상 첫 순서여야 합니다");
    }

    @Test
    void reorderRoles_는_누락된_역할이_있으면_거부한다() {
        ApprovalLineConfig creator = role(0, "작성자", StepType.CREATOR);
        ApprovalLineConfig outbound = role(1, "출고인", StepType.GROUP);
        ApprovalLineConfig inspector = role(2, "검수인", StepType.GROUP);

        when(repository.findByDocumentTypeOrderBySequenceAsc("SLIP_OUTBOUND"))
                .thenReturn(List.of(creator, outbound, inspector));

        // 검수인 누락
        assertThatThrownBy(() -> service.reorderRoles("SLIP_OUTBOUND",
                List.of(creator.getId(), outbound.getId())))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("전체를 순서대로 전달해야 합니다");
    }

    @Test
    void reorderRoles_는_중복ID를_거부한다() {
        ApprovalLineConfig creator = role(0, "작성자", StepType.CREATOR);
        ApprovalLineConfig outbound = role(1, "출고인", StepType.GROUP);
        ApprovalLineConfig inspector = role(2, "검수인", StepType.GROUP);

        when(repository.findByDocumentTypeOrderBySequenceAsc("SLIP_OUTBOUND"))
                .thenReturn(List.of(creator, outbound, inspector));

        assertThatThrownBy(() -> service.reorderRoles("SLIP_OUTBOUND",
                List.of(creator.getId(), outbound.getId(), outbound.getId())))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("역할이 중복 전달되었습니다");
    }

    @Test
    void reorderRoles_는_잉여_ID가_포함되면_거부한다() {
        ApprovalLineConfig creator = role(0, "작성자", StepType.CREATOR);
        ApprovalLineConfig outbound = role(1, "출고인", StepType.GROUP);
        ApprovalLineConfig inspector = role(2, "검수인", StepType.GROUP);

        when(repository.findByDocumentTypeOrderBySequenceAsc("SLIP_OUTBOUND"))
                .thenReturn(List.of(creator, outbound, inspector));

        UUID extraId = UUID.randomUUID();
        assertThatThrownBy(() -> service.reorderRoles("SLIP_OUTBOUND",
                List.of(creator.getId(), outbound.getId(), inspector.getId(), extraId)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("전체를 순서대로 전달해야 합니다");
    }

    @Test
    void reorderRoles_는_타documentType_ID가_포함되면_거부한다() {
        ApprovalLineConfig creator = role(0, "작성자", StepType.CREATOR);
        ApprovalLineConfig outbound = role(1, "출고인", StepType.GROUP);
        ApprovalLineConfig inspector = role(2, "검수인", StepType.GROUP);

        when(repository.findByDocumentTypeOrderBySequenceAsc("SLIP_OUTBOUND"))
                .thenReturn(List.of(creator, outbound, inspector));

        UUID otherId = UUID.randomUUID(); // 다른 documentType 역할 ID
        assertThatThrownBy(() -> service.reorderRoles("SLIP_OUTBOUND",
                List.of(creator.getId(), outbound.getId(), otherId)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("전체를 순서대로 전달해야 합니다");
    }

    static PermissionGroup systemMasterGroup() {
        try {
            PermissionGroup group = PermissionGroup.create("마스터", null);
            Field fld = PermissionGroup.class.getDeclaredField("systemMaster");
            fld.setAccessible(true);
            fld.set(group, true);
            return group;
        } catch (Exception ex) { throw new RuntimeException(ex); }
    }
}
