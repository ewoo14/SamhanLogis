package com.samhanair.logis.auth.service;

import com.samhanair.logis.auth.domain.GroupPagePermission;
import com.samhanair.logis.auth.domain.PageCode;
import com.samhanair.logis.auth.domain.PermissionGroup;
import com.samhanair.logis.auth.repository.GroupPagePermissionRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 권한그룹별 page×7-action 매트릭스 조회와 저장을 담당한다. */
@Service
@RequiredArgsConstructor
public class GroupPermissionService {

    private final PermissionGroupService permissionGroupService;
    private final GroupPagePermissionRepository groupPagePermissionRepository;
    private final EffectivePermissionMaterializer materializer;

    /**
     * 권한그룹의 전체 페이지 매트릭스를 조회한다.
     *
     * @param groupId 권한그룹 UUID
     * @return pageCode → 7-action matrix
     */
    @Transactional(readOnly = true)
    public Map<String, AccountPermissionService.ActionMatrix> getGroupMatrix(UUID groupId) {
        permissionGroupService.requireGroup(groupId);
        Map<String, GroupPagePermission> rows = groupPagePermissionRepository
                .findByGroupIdAndIsDeletedFalse(groupId).stream()
                .collect(Collectors.toMap(
                        GroupPagePermission::getPageCode,
                        permission -> permission,
                        (left, right) -> left,
                        LinkedHashMap::new));

        Map<String, AccountPermissionService.ActionMatrix> result = new LinkedHashMap<>();
        for (PageCode pageCode : PageCode.values()) {
            GroupPagePermission permission = rows.get(pageCode.getCode());
            result.put(pageCode.getCode(), permission == null
                    ? AccountPermissionService.ActionMatrix.none()
                    : AccountPermissionService.ActionMatrix.from(permission));
        }
        return result;
    }

    /**
     * 권한그룹 매트릭스를 upsert 하고 배속 계정들의 effective 권한을 재계산한다.
     *
     * @param groupId 그룹 UUID
     * @param updates 갱신할 페이지 권한 목록
     * @return 갱신 행 수
     */
    @Transactional
    public int updateGroupMatrix(UUID groupId, List<AccountPermissionService.AccountPermissionUpdate> updates) {
        PermissionGroup group = permissionGroupService.requireGroup(groupId);
        rejectBuiltinMutation(group);
        if (updates == null || updates.isEmpty()) {
            materializer.materializeForGroup(groupId);
            return 0;
        }

        Map<String, AccountPermissionService.ActionMatrix> normalized = new LinkedHashMap<>();
        for (AccountPermissionService.AccountPermissionUpdate update : updates) {
            validatePageCode(update.pageCode());
            validateActions(update.actions());
            normalized.put(update.pageCode(), update.actions());
        }

        for (Map.Entry<String, AccountPermissionService.ActionMatrix> entry : normalized.entrySet()) {
            GroupPagePermission permission = groupPagePermissionRepository
                    .findByGroupIdAndPageCodeAndIsDeletedFalse(groupId, entry.getKey())
                    .orElseGet(() -> GroupPagePermission.of(groupId, entry.getKey()));
            entry.getValue().applyTo(permission);
            groupPagePermissionRepository.save(permission);
        }
        materializer.materializeForGroup(groupId);
        return normalized.size();
    }

    /** 시스템/빌트인 권한그룹의 page×action 매트릭스는 운영 정책상 불변으로 유지한다. */
    private void rejectBuiltinMutation(PermissionGroup group) {
        if (group.isBuiltin() || group.isSystemMaster()) {
            throw new BusinessException(ErrorCode.CONFLICT, "시스템 권한그룹은 변경하거나 삭제할 수 없습니다.");
        }
    }

    private void validatePageCode(String pageCode) {
        if (pageCode == null || pageCode.isBlank() || !PageCode.isValid(pageCode)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "등록되지 않은 페이지 코드입니다: " + pageCode);
        }
    }

    private void validateActions(AccountPermissionService.ActionMatrix actions) {
        if (actions == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "권한 액션 값은 필수입니다.");
        }
    }
}
