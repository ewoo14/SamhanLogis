package com.samhanair.logis.auth.service;

import com.samhanair.logis.approval.StepType;
import com.samhanair.logis.auth.domain.ApprovalLineConfig;
import com.samhanair.logis.auth.domain.ApprovalLineApprover;
import com.samhanair.logis.auth.domain.ApproverType;
import com.samhanair.logis.auth.repository.AccountRepository;
import com.samhanair.logis.auth.repository.ApprovalLineApproverRepository;
import com.samhanair.logis.auth.repository.ApprovalLineConfigRepository;
import com.samhanair.logis.auth.repository.PermissionGroupRepository;
import com.samhanair.logis.auth.web.dto.ApprovalLineDefaultApproverView;
import com.samhanair.logis.auth.web.dto.ApprovalLineGroupOption;
import com.samhanair.logis.auth.web.dto.ApprovalLineRoleView;
import com.samhanair.logis.auth.web.dto.ApprovalLineRoleResolutionItem;
import com.samhanair.logis.auth.web.dto.ApprovalLineRoleResolutionResponse;
import com.samhanair.logis.auth.web.dto.ApprovalLineStructureView;
import com.samhanair.logis.auth.web.dto.ApproverView;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 결재라인 설정 — 전표종류별 역할 조회 + 역할별 권한 그룹/필수 갱신(선언적). */
@Service
@RequiredArgsConstructor
public class ApprovalLineConfigService {

    private static final int DOCUMENT_TYPE_MAX_LENGTH = 70;
    private static final String ACTOR = "approval-line-config";
    private static final Set<String> SEED_ACTORS = Set.of("v61-seed", "v63-seed", "v64-seed", "v75-seed");

    private final ApprovalLineConfigRepository repository;
    private final ApprovalLineApproverRepository approverRepository;
    private final PermissionGroupRepository groupRepository;
    private final AccountRepository accountRepository;

    /** 전표 종류별 결재 역할(sequence 순). */
    @Transactional(readOnly = true)
    public List<ApprovalLineRoleView> listRoles(String documentType) {
        return repository.findByDocumentTypeOrderBySequenceAsc(documentType).stream()
                .map(this::toView)
                .toList();
    }

    /** 서비스 간 결재선 인스턴스화용 역할 목록을 조회한다. */
    @Transactional(readOnly = true)
    public ApprovalLineRoleResolutionResponse resolveRoles(String documentType) {
        List<ApprovalLineConfig> roles = repository.findByDocumentTypeOrderBySequenceAsc(documentType);
        if (roles.isEmpty()) {
            return ApprovalLineRoleResolutionResponse.unconfigured();
        }
        return new ApprovalLineRoleResolutionResponse(true, roles.stream()
                .map(this::toResolutionItem)
                .toList());
    }

    /** 전표 인쇄 결재란 렌더용 구조(sequence/label/type/actionKey)만 조회한다. */
    @Transactional(readOnly = true)
    public List<ApprovalLineStructureView> listStructure(String documentType) {
        return repository.findByDocumentTypeOrderBySequenceAsc(documentType).stream()
                .map(role -> new ApprovalLineStructureView(
                        role.getSequence(),
                        role.getLabel(),
                        role.getStepType(),
                        role.getActionKey()))
                .toList();
    }

    /** 그룹웨어 생성 프리필용 USER 결재자를 sequence 순으로 조회한다. GROUP 결재자는 v1에서 제외한다. */
    @Transactional(readOnly = true)
    public List<ApprovalLineDefaultApproverView> listDefaultApprovers(String documentType) {
        return repository.findByDocumentTypeOrderBySequenceAsc(documentType).stream()
                .flatMap(role -> approverRepository.findByConfigRoleIdAndIsDeletedFalse(role.getId()).stream()
                        .filter(approver -> approver.getApproverType() == ApproverType.USER)
                        .map(approver -> new ApprovalLineDefaultApproverView(
                                role.getSequence(),
                                role.getLabel(),
                                approver.getApproverRefId(),
                                accountRepository.findActiveById(approver.getApproverRefId())
                                        .map(this::accountDisplayName)
                                        .orElse("(삭제된 사원)"))))
                .toList();
    }

    /** 결재 역할에 지정 가능한 권한그룹 목록. 시스템마스터 그룹은 결재자 그룹 후보에서 제외한다. */
    @Transactional(readOnly = true)
    public List<ApprovalLineGroupOption> listSelectableGroups() {
        return groupRepository.findByIsDeletedFalse().stream()
                .filter(group -> !group.isSystemMaster())
                .sorted(Comparator.comparing(group -> group.getName()))
                .map(group -> new ApprovalLineGroupOption(group.getId(), group.getName()))
                .toList();
    }

    /** 표시·서명용 결재 단계를 추가한다. action_key 는 null 이므로 authorize 게이트에는 연결되지 않는다. */
    @Transactional
    public ApprovalLineRoleView addStep(String documentType, String label) {
        if (documentType == null || documentType.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "전표 종류(documentType)를 입력해야 합니다");
        }
        String normalizedDocumentType = documentType.trim();
        if (normalizedDocumentType.length() > DOCUMENT_TYPE_MAX_LENGTH) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "전표 종류(documentType)는 " + DOCUMENT_TYPE_MAX_LENGTH + "자 이하여야 합니다");
        }
        int nextSequence = repository.findFirstByDocumentTypeOrderBySequenceDesc(normalizedDocumentType)
                .map(role -> role.getSequence() + 1)
                .orElse(0);
        ApprovalLineConfig role = ApprovalLineConfig.createDisplayStep(
                normalizedDocumentType, nextSequence, label);
        return toView(repository.save(role));
    }

    /** 결재 단계를 soft-delete 하고 자식 결재자도 cascade soft-delete 한다. CREATOR 는 삭제할 수 없다. */
    @Transactional
    public void deleteStep(UUID id) {
        ApprovalLineConfig role = repository.findById(id).orElse(null);
        if (role == null) {
            return;
        }
        if (role.getStepType() == StepType.CREATOR) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "작성자 역할은 삭제할 수 없습니다");
        }
        role.markDeleted(ACTOR);
        approverRepository.findByConfigRoleIdAndIsDeletedFalse(role.getId())
                .forEach(approver -> approver.markDeleted(ACTOR));
    }

    /** 역할 필수여부 갱신. CREATOR 역할은 자동 작성자라 변경을 거부한다. */
    @Transactional
    public ApprovalLineRoleView updateRole(UUID id, boolean required) {
        ApprovalLineConfig role = repository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "결재 역할을 찾을 수 없습니다: " + id));
        if (role.getStepType() == StepType.CREATOR) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "작성자 역할은 변경할 수 없습니다");
        }
        role.changeRequired(required);
        return toView(repository.save(role));
    }

    /** 결재 역할 단건 뷰 조회. add/remove 후 최신 approvers 배열 반환에 사용한다. */
    @Transactional(readOnly = true)
    public ApprovalLineRoleView getRoleView(UUID id) {
        ApprovalLineConfig role = repository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "결재 역할을 찾을 수 없습니다: " + id));
        return toView(role);
    }

    /**
     * 결재 역할 라벨(표시 명칭)을 변경한다.
     *
     * <p>CREATOR 역할의 라벨은 고정이므로 변경 요청 시 거부한다.
     * 빈 라벨은 도메인 메서드에서 거부된다.
     *
     * @param id    변경 대상 결재 역할 ID
     * @param label 새 라벨(공백 불가)
     * @return 갱신된 역할 뷰
     * @throws BusinessException 역할 미존재(NOT_FOUND) / CREATOR 역할(INVALID_INPUT) / 빈 라벨(INVALID_INPUT)
     */
    @Transactional
    public ApprovalLineRoleView renameRole(UUID id, String label) {
        ApprovalLineConfig role = repository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "결재 역할을 찾을 수 없습니다: " + id));
        if (role.getStepType() == StepType.CREATOR) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "작성자 역할은 변경할 수 없습니다");
        }
        role.rename(label);
        return toView(repository.save(role));
    }

    /**
     * 결재 역할 순서를 재할당한다(2-phase swap — unique 제약 중간 충돌 회피).
     *
     * <p>처리 절차:
     * <ol>
     *   <li>부분요청 가드: {@code orderedIds} 집합이 활성 역할 전체 ID 집합과 일치해야 함.</li>
     *   <li>CREATOR-first 가드: {@code orderedIds.get(0)}이 CREATOR 역할이어야 함.</li>
     *   <li>Phase 1 — 전 역할을 임시 음수 오프셋으로 이동({@code -(sequence+1)})하여
     *       unique 충돌 없이 공간을 비운다.</li>
     *   <li>Phase 2 — {@code orderedIds} 순서대로 0-base sequence 재할당.</li>
     * </ol>
     *
     * @param documentType 전표 종류 (SLIP_OUTBOUND 등)
     * @param orderedIds   새 순서로 나열된 역할 UUID 목록(첫 번째=작성자)
     * @return 갱신 후 sequence 순 역할 뷰 목록
     * @throws BusinessException documentType 공백(INVALID_INPUT) / 미존재 결재라인(NOT_FOUND) /
     *                           중복 ID(INVALID_INPUT) / 부분요청(INVALID_INPUT) /
     *                           CREATOR 비1순위(INVALID_INPUT)
     */
    @Transactional
    public List<ApprovalLineRoleView> reorderRoles(String documentType, List<UUID> orderedIds) {
        if (documentType == null || documentType.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "전표 종류(documentType)를 입력해야 합니다");
        }
        String normalizedDocumentType = documentType.trim();
        List<ApprovalLineConfig> active =
                repository.findByDocumentTypeOrderBySequenceAsc(normalizedDocumentType);
        if (active.isEmpty()) {
            throw new BusinessException(ErrorCode.NOT_FOUND,
                    "결재라인을 찾을 수 없습니다: " + normalizedDocumentType);
        }

        // 부분요청 가드: 집합 크기 + 동일성 검증
        Set<UUID> activeIds = new HashSet<>();
        Map<UUID, ApprovalLineConfig> byId = new HashMap<>();
        for (ApprovalLineConfig r : active) {
            activeIds.add(r.getId());
            byId.put(r.getId(), r);
        }
        if (new HashSet<>(orderedIds).size() != orderedIds.size()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "역할이 중복 전달되었습니다");
        }
        if (orderedIds.size() != activeIds.size() || !activeIds.containsAll(orderedIds)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "결재라인 역할 전체를 순서대로 전달해야 합니다");
        }

        // CREATOR-first 가드
        ApprovalLineConfig first = byId.get(orderedIds.get(0));
        if (first == null || first.getStepType() != StepType.CREATOR) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "작성자는 항상 첫 순서여야 합니다");
        }

        // Phase 1: 음수 오프셋으로 일괄 이동 (unique 제약 중간 충돌 회피)
        for (ApprovalLineConfig r : active) {
            r.changeSequence(-(r.getSequence() + 1));
        }
        repository.saveAllAndFlush(active);

        // Phase 2: orderedIds 순서대로 0-base sequence 재할당
        for (int i = 0; i < orderedIds.size(); i++) {
            byId.get(orderedIds.get(i)).changeSequence(i);
        }
        repository.saveAllAndFlush(active);

        return repository.findByDocumentTypeOrderBySequenceAsc(normalizedDocumentType).stream()
                .map(this::toView)
                .toList();
    }

    private ApprovalLineRoleView toView(ApprovalLineConfig role) {
        List<ApproverView> approvers = approverRepository.findByConfigRoleIdAndIsDeletedFalse(role.getId()).stream()
                .map(this::toApproverView)
                .toList();
        return new ApprovalLineRoleView(role.getId(), role.getSequence(), role.getLabel(),
                role.getStepType(), approvers, role.isRequired(),
                role.getActionKey() != null && !role.getActionKey().isBlank(),
                role.getCreatedBy() != null && SEED_ACTORS.contains(role.getCreatedBy()));
    }

    private ApproverView toApproverView(ApprovalLineApprover approver) {
        String displayName = switch (approver.getApproverType()) {
            case GROUP -> groupRepository.findByIdAndIsDeletedFalse(approver.getApproverRefId())
                    .map(group -> group.getName())
                    .orElse("(삭제된 그룹)");
            case USER -> accountRepository.findActiveById(approver.getApproverRefId())
                    .map(this::accountDisplayName)
                    .orElse("(삭제된 사원)");
        };
        return new ApproverView(
                approver.getId(),
                approver.getApproverType().name(),
                approver.getApproverRefId(),
                displayName);
    }

    private ApprovalLineRoleResolutionItem toResolutionItem(ApprovalLineConfig role) {
        List<ApprovalLineApprover> approvers =
                approverRepository.findByConfigRoleIdAndIsDeletedFalse(role.getId());
        List<UUID> userIds = approvers.stream()
                .filter(approver -> approver.getApproverType() == ApproverType.USER)
                .map(ApprovalLineApprover::getApproverRefId)
                .toList();
        UUID groupId = approvers.stream()
                .filter(approver -> approver.getApproverType() == ApproverType.GROUP)
                .map(ApprovalLineApprover::getApproverRefId)
                .findFirst()
                .orElse(role.getApproverGroupId());
        String requiredPageCode = role.getStepType() == StepType.GROUP
                ? blankToNull(role.getActionKey())
                : null;
        return new ApprovalLineRoleResolutionItem(
                role.getSequence(),
                role.getLabel(),
                role.getStepType(),
                groupId,
                userIds,
                requiredPageCode,
                role.isRequired());
    }

    private String accountDisplayName(com.samhanair.logis.auth.domain.Account account) {
        String department = account.getDepartmentName();
        if (department == null || department.isBlank()) {
            return account.getDisplayName();
        }
        return account.getDisplayName() + " (" + department + ")";
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
