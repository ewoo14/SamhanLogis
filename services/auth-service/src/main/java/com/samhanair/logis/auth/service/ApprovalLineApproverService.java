package com.samhanair.logis.auth.service;

import com.samhanair.logis.approval.StepType;
import com.samhanair.logis.auth.domain.Account;
import com.samhanair.logis.auth.domain.ApprovalLineApprover;
import com.samhanair.logis.auth.domain.ApproverType;
import com.samhanair.logis.auth.repository.AccountRepository;
import com.samhanair.logis.auth.repository.ApprovalLineApproverRepository;
import com.samhanair.logis.auth.repository.ApprovalLineConfigRepository;
import com.samhanair.logis.auth.repository.PermissionGroupRepository;
import com.samhanair.logis.auth.web.dto.AccountSearchResult;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 결재 역할별 다중 결재자 추가/삭제와 개인 사원 검색을 담당한다. */
@Service
@RequiredArgsConstructor
public class ApprovalLineApproverService {

    private static final int MAX_SEARCH_LIMIT = 50;
    private static final String ACTOR = "approval-line-config";

    private final ApprovalLineConfigRepository roleRepository;
    private final ApprovalLineApproverRepository approverRepository;
    private final PermissionGroupRepository groupRepository;
    private final AccountRepository accountRepository;

    /** 결재 역할에 그룹 또는 개인 결재자 1명을 추가한다. */
    @Transactional
    public ApprovalLineApprover addApprover(UUID roleId, ApproverType type, UUID refId) {
        if (type == null || refId == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "결재자 유형과 참조 ID를 입력해야 합니다");
        }
        var role = roleRepository.findById(roleId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "결재 역할을 찾을 수 없습니다: " + roleId));
        if (role.getStepType() == StepType.CREATOR) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "작성자 역할은 변경할 수 없습니다");
        }
        validateReference(type, refId);
        if (approverRepository.existsByConfigRoleIdAndApproverTypeAndApproverRefIdAndIsDeletedFalse(
                roleId, type, refId)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "이미 지정된 결재자입니다");
        }
        return approverRepository.save(ApprovalLineApprover.create(roleId, type, refId));
    }

    /** 결재 역할에서 결재자 1명을 soft-delete 한다. */
    @Transactional
    public void removeApprover(UUID roleId, UUID approverId) {
        var role = roleRepository.findById(roleId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "결재 역할을 찾을 수 없습니다: " + roleId));
        if (role.getStepType() == StepType.CREATOR) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "작성자 역할은 변경할 수 없습니다");
        }
        var approver = approverRepository.findByIdAndIsDeletedFalse(approverId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "결재자를 찾을 수 없습니다: " + approverId));
        if (!roleId.equals(approver.getConfigRoleId())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "결재 역할과 결재자가 일치하지 않습니다");
        }
        approver.markDeleted(ACTOR);
    }

    /** 활성 계정을 표시명 contains 로 검색한다. */
    @Transactional(readOnly = true)
    public List<AccountSearchResult> searchUsers(String q, int limit) {
        String keyword = q == null ? "" : escapeLikeLiteral(q.trim());
        int safeLimit = Math.max(1, Math.min(limit, MAX_SEARCH_LIMIT));
        return accountRepository.searchActiveByDisplayName(keyword, PageRequest.of(0, safeLimit)).stream()
                .map(account -> new AccountSearchResult(account.getId(), accountDisplayName(account)))
                .toList();
    }

    private static String escapeLikeLiteral(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private void validateReference(ApproverType type, UUID refId) {
        switch (type) {
            case GROUP -> {
                var group = groupRepository.findByIdAndIsDeletedFalse(refId)
                        .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_INPUT,
                                "존재하지 않는 권한 그룹입니다: " + refId));
                if (group.isSystemMaster()) {
                    throw new BusinessException(ErrorCode.INVALID_INPUT,
                            "시스템 마스터 그룹은 결재 그룹으로 지정할 수 없습니다");
                }
            }
            case USER -> {
                accountRepository.findActiveById(refId)
                        .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_INPUT,
                                "존재하지 않는 사원입니다: " + refId));
                // GROUP 결재자가 system-master 그룹을 거부하는 것과 대칭 — 개인 결재자도 시스템 마스터 계정 거부.
                if (groupRepository.existsByAccountIdAndSystemMasterTrue(refId)) {
                    throw new BusinessException(ErrorCode.INVALID_INPUT,
                            "시스템 마스터 계정은 결재자로 지정할 수 없습니다");
                }
            }
        }
    }

    private String accountDisplayName(Account account) {
        String department = account.getDepartmentName();
        if (department == null || department.isBlank()) {
            return account.getDisplayName();
        }
        return account.getDisplayName() + " (" + department + ")";
    }
}
