package com.samhanair.logis.auth.service;

import com.samhanair.logis.auth.domain.PermissionGroup;
import com.samhanair.logis.auth.repository.AccountGroupRepository;
import com.samhanair.logis.auth.repository.PermissionGroupRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 동적 권한그룹 생성, 이름 변경, 삭제 가드를 담당하는 서비스. */
@Service
@RequiredArgsConstructor
public class PermissionGroupService {

    private static final String ACTOR = "permission-group-service";

    private final PermissionGroupRepository permissionGroupRepository;
    private final AccountGroupRepository accountGroupRepository;

    /**
     * 활성 권한그룹 목록을 조회한다.
     *
     * @return 권한그룹 요약 목록
     */
    @Transactional(readOnly = true)
    public List<GroupSummary> listGroups() {
        return permissionGroupRepository.findByIsDeletedFalse().stream()
                .sorted(Comparator
                        .comparing(PermissionGroup::isSystemMaster).reversed()
                        .thenComparing(PermissionGroup::getName))
                .map(this::toSummary)
                .toList();
    }

    /**
     * 새 권한그룹을 생성한다.
     *
     * @param name        그룹 표시명
     * @param description 설명
     * @return 생성된 그룹 요약
     * @throws BusinessException 이름 중복 또는 입력 오류
     */
    @Transactional
    public GroupSummary create(String name, String description) {
        String normalizedName = requireName(name);
        rejectDuplicateName(normalizedName, null);
        try {
            PermissionGroup group = PermissionGroup.create(normalizedName, normalizeDescription(description));
            return toSummary(permissionGroupRepository.save(group));
        } catch (DataIntegrityViolationException ex) {
            throw new BusinessException(ErrorCode.CONFLICT, "이미 사용 중인 권한그룹 이름입니다.", ex);
        }
    }

    /**
     * 권한그룹 표시명을 변경한다. 빌트인 또는 시스템 MASTER 그룹은 변경할 수 없다.
     *
     * @param groupId     그룹 UUID
     * @param name        새 표시명
     * @param description 새 설명
     * @return 변경된 그룹 요약
     */
    @Transactional
    public GroupSummary rename(UUID groupId, String name, String description) {
        PermissionGroup group = requireGroup(groupId);
        rejectBuiltinMutation(group);
        String normalizedName = requireName(name);
        rejectDuplicateName(normalizedName, group.getId());
        try {
            group.rename(normalizedName, normalizeDescription(description));
            return toSummary(permissionGroupRepository.save(group));
        } catch (DataIntegrityViolationException ex) {
            throw new BusinessException(ErrorCode.CONFLICT, "이미 사용 중인 권한그룹 이름입니다.", ex);
        }
    }

    /**
     * 빈 권한그룹만 soft-delete 한다.
     *
     * @param groupId 삭제 대상 그룹 UUID
     */
    @Transactional
    public void softDelete(UUID groupId) {
        PermissionGroup group = requireGroup(groupId);
        rejectBuiltinMutation(group);
        long assignedAccounts = accountGroupRepository.countByGroupIdAndIsDeletedFalse(groupId);
        if (assignedAccounts > 0) {
            throw new BusinessException(ErrorCode.CONFLICT, "배속 계정이 있는 권한그룹은 삭제할 수 없습니다.");
        }
        group.markDeleted(ACTOR);
        permissionGroupRepository.save(group);
    }

    /** 권한그룹을 조회하고 없으면 404 를 반환한다. */
    @Transactional(readOnly = true)
    public PermissionGroup requireGroup(UUID groupId) {
        if (groupId == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "권한그룹 ID는 필수입니다.");
        }
        return permissionGroupRepository.findByIdAndIsDeletedFalse(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "권한그룹을 찾을 수 없습니다."));
    }

    private GroupSummary toSummary(PermissionGroup group) {
        return new GroupSummary(
                group.getId(),
                group.getName(),
                group.getDescription(),
                group.isBuiltin(),
                group.isSystemMaster(),
                accountGroupRepository.countByGroupIdAndIsDeletedFalse(group.getId()));
    }

    private void rejectDuplicateName(String name, UUID currentGroupId) {
        permissionGroupRepository.findByNameAndIsDeletedFalse(name)
                .filter(group -> currentGroupId == null || !group.getId().equals(currentGroupId))
                .ifPresent(group -> {
                    throw new BusinessException(ErrorCode.CONFLICT, "이미 사용 중인 권한그룹 이름입니다.");
                });
    }

    private void rejectBuiltinMutation(PermissionGroup group) {
        if (group.isBuiltin() || group.isSystemMaster()) {
            throw new BusinessException(ErrorCode.CONFLICT, "시스템 권한그룹은 변경하거나 삭제할 수 없습니다.");
        }
    }

    private String requireName(String name) {
        if (name == null || name.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "권한그룹 이름은 필수입니다.");
        }
        String normalized = name.trim();
        if (normalized.length() > 100) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "권한그룹 이름은 100자 이하입니다.");
        }
        return normalized;
    }

    private String normalizeDescription(String description) {
        if (description == null || description.isBlank()) {
            return null;
        }
        String normalized = description.trim();
        if (normalized.length() > 255) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "권한그룹 설명은 255자 이하입니다.");
        }
        return normalized;
    }

    /** 권한그룹 목록/상세 응답에 사용하는 요약 DTO. */
    public record GroupSummary(
            UUID id,
            String name,
            String description,
            boolean builtin,
            boolean systemMaster,
            long assignedAccountCount) {
    }
}
