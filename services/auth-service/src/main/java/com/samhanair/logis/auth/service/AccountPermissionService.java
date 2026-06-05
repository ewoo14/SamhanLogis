package com.samhanair.logis.auth.service;

import com.samhanair.logis.auth.domain.AccountPagePermission;
import com.samhanair.logis.auth.domain.AccountPermissionOverride;
import com.samhanair.logis.auth.domain.GroupPagePermission;
import com.samhanair.logis.auth.domain.PageCode;
import com.samhanair.logis.auth.domain.RolePagePermissionTemplate;
import com.samhanair.logis.auth.repository.AccountPagePermissionRepository;
import com.samhanair.logis.auth.repository.AccountPermissionOverrideRepository;
import com.samhanair.logis.auth.repository.AccountRepository;
import com.samhanair.logis.auth.repository.RolePagePermissionTemplateRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 계정 단위 권한 조회/관리 서비스.
 *
 * <p>Phase 1 권한 재편에서 account_page_permissions 를 enforcement 소스로 사용한다.
 */
@Service
@RequiredArgsConstructor
public class AccountPermissionService {

    private final AccountPagePermissionRepository accountPermissionRepository;
    private final AccountPermissionOverrideRepository overrideRepository;
    private final RolePagePermissionTemplateRepository templateRepository;
    private final AccountRepository accountRepository;
    private final EffectivePermissionMaterializer materializer;

    /**
     * 단일 계정 권한 확인.
     *
     * @param accountId 계정 UUID
     * @param pageCode  페이지 코드
     * @param action    액션
     * @return 권한이 있으면 true
     */
    @Transactional(readOnly = true)
    public boolean check(UUID accountId, String pageCode, PermissionAction action) {
        if (accountId == null || pageCode == null || pageCode.isBlank() || action == null) {
            return false;
        }
        return accountPermissionRepository.findByAccountIdAndPageCode(accountId, pageCode)
                .map(permission -> permission.allows(action))
                .orElse(false);
    }

    /**
     * 계정의 pageCode → action 집합을 조회한다.
     *
     * @param accountId 계정 UUID
     * @return 권한 맵
     */
    @Transactional(readOnly = true)
    public Map<String, EnumSet<PermissionAction>> bulkLoad(UUID accountId) {
        if (accountId == null) {
            return Map.of();
        }
        List<AccountPagePermission> permissions =
                accountPermissionRepository.findByAccountIdOrderByPageCodeAsc(accountId);
        Map<String, EnumSet<PermissionAction>> result = new LinkedHashMap<>();
        for (AccountPagePermission permission : permissions) {
            EnumSet<PermissionAction> actions = EnumSet.noneOf(PermissionAction.class);
            for (PermissionAction action : PermissionAction.values()) {
                if (permission.allows(action)) {
                    actions.add(action);
                }
            }
            result.put(permission.getPageCode(), actions);
        }
        return result;
    }

    /**
     * MASTER 매트릭스의 계정 선택 목록.
     *
     * @return 계정 요약 목록
     */
    @Transactional(readOnly = true)
    public List<AccountSummary> listAccounts() {
        return accountRepository.findAll().stream()
                .map(account -> new AccountSummary(
                        account.getId(),
                        account.getDisplayName(),
                        account.getRole().name(),
                        account.isEnabled()))
                .collect(Collectors.toList());
    }

    /**
     * 단일 계정의 전체 page×7-action 매트릭스.
     *
     * @param accountId 계정 UUID
     * @return pageCode → 7-action boolean
     */
    @Transactional(readOnly = true)
    public Map<String, ActionMatrix> getAccountMatrix(UUID accountId) {
        Map<String, AccountPagePermission> rows = accountPermissionRepository
                .findByAccountIdOrderByPageCodeAsc(accountId).stream()
                .collect(Collectors.toMap(
                        AccountPagePermission::getPageCode,
                        permission -> permission,
                        (left, right) -> left,
                        LinkedHashMap::new));
        Map<String, ActionMatrix> result = new LinkedHashMap<>();
        for (PageCode pageCode : PageCode.values()) {
            AccountPagePermission permission = rows.get(pageCode.getCode());
            result.put(pageCode.getCode(), permission == null
                    ? ActionMatrix.none()
                    : ActionMatrix.from(permission));
        }
        return result;
    }

    /**
     * 단일 계정의 권한 override 매트릭스를 일괄 upsert 한다.
     *
     * <p>저장 대상은 {@code account_permission_overrides} 이며, 저장 후
     * {@code account_page_permissions} enforcement 캐시를 재계산한다.
     *
     * @param accountId 계정 UUID
     * @param updates   갱신 목록
     * @param actorId   변경자
     * @return 변경 행 수
     */
    @Transactional
    public int updateAccountMatrix(UUID accountId, List<AccountPermissionUpdate> updates, String actorId) {
        return updateAccountMatrix(accountId, updates, actorId, null);
    }

    /**
     * 단일 계정의 권한 override 매트릭스를 일괄 upsert 한다.
     *
     * <p>관리권위 page-code 는 MASTER 만 grant/revoke 할 수 있다. 이 봉쇄는
     * {@code system.permission-admin} 을 위임받은 비MASTER 의 자기상승/재위임을 막는다.
     *
     * @param accountId 계정 UUID
     * @param updates   갱신 목록
     * @param actorId   변경자
     * @param actorRole 요청자 역할 풀네임
     * @return 변경 행 수
     */
    @Transactional
    public int updateAccountMatrix(
            UUID accountId,
            List<AccountPermissionUpdate> updates,
            String actorId,
            String actorRole) {
        if (accountId == null || updates == null || updates.isEmpty()) {
            return 0;
        }
        requireAccount(accountId);
        int changed = 0;
        for (AccountPermissionUpdate update : updates) {
            validatePageCode(update.pageCode());
            ManagementPageMutationGuard.rejectManagementPageMutation(update.pageCode(), actorRole);
            validateActions(update.actions());
            AccountPermissionOverride override = overrideRepository
                    .findByAccountIdAndPageCodeAndIsDeletedFalse(accountId, update.pageCode())
                    .orElseGet(() -> AccountPermissionOverride.of(accountId, update.pageCode()));
            update.actions().applyTo(override);
            overrideRepository.save(override);
            changed++;
        }
        materializer.materializeForAccount(accountId);
        return changed;
    }

    /**
     * 역할 템플릿을 계정 권한으로 복사한다.
     *
     * @param accountId 계정 UUID
     * @param roleCode  템플릿 역할 코드
     * @param actorId   변경자
     * @return 변경 행 수
     */
    @Transactional
    public int applyTemplate(UUID accountId, String roleCode, String actorId) {
        return applyTemplate(accountId, roleCode, actorId, null);
    }

    /**
     * 역할 템플릿을 계정 권한으로 복사한다.
     *
     * @param accountId 계정 UUID
     * @param roleCode  템플릿 역할 코드
     * @param actorId   변경자
     * @param actorRole 요청자 역할 풀네임
     * @return 변경 행 수
     */
    @Transactional
    public int applyTemplate(UUID accountId, String roleCode, String actorId, String actorRole) {
        List<AccountPermissionUpdate> updates = templateRepository.findByRoleCodeOrderByPageCodeAsc(roleCode).stream()
                .map(template -> new AccountPermissionUpdate(
                        template.getPageCode(),
                        ActionMatrix.from(template)))
                .collect(Collectors.toList());
        return updateAccountMatrix(accountId, updates, actorId, actorRole);
    }

    /**
     * 다른 계정의 권한을 대상 계정에 복사한다.
     *
     * @param accountId        대상 계정
     * @param sourceAccountId  원본 계정
     * @param actorId          변경자
     * @return 변경 행 수
     */
    @Transactional
    public int copyFromAccount(UUID accountId, UUID sourceAccountId, String actorId) {
        return copyFromAccount(accountId, sourceAccountId, actorId, null);
    }

    /**
     * 다른 계정의 권한을 대상 계정에 복사한다.
     *
     * @param accountId        대상 계정
     * @param sourceAccountId  원본 계정
     * @param actorId          변경자
     * @param actorRole        요청자 역할 풀네임
     * @return 변경 행 수
     */
    @Transactional
    public int copyFromAccount(UUID accountId, UUID sourceAccountId, String actorId, String actorRole) {
        List<AccountPermissionUpdate> updates =
                accountPermissionRepository.findByAccountIdOrderByPageCodeAsc(sourceAccountId).stream()
                        .map(permission -> new AccountPermissionUpdate(
                                permission.getPageCode(),
                                ActionMatrix.from(permission)))
                        .collect(Collectors.toList());
        return updateAccountMatrix(accountId, updates, actorId, actorRole);
    }

    /**
     * 역할 템플릿 전체 조회.
     *
     * @return roleCode → pageCode → action matrix
     */
    @Transactional(readOnly = true)
    public Map<String, Map<String, ActionMatrix>> getTemplates() {
        Map<String, Map<String, ActionMatrix>> result = new LinkedHashMap<>();
        for (RolePagePermissionTemplate template : templateRepository.findAll()) {
            result.computeIfAbsent(template.getRoleCode(), ignored -> new LinkedHashMap<>())
                    .put(template.getPageCode(), ActionMatrix.from(template));
        }
        return result;
    }

    /**
     * 역할 템플릿을 일괄 upsert 한다.
     *
     * @param roleCode 역할 코드
     * @param updates  갱신 목록
     * @param actorId  변경자
     * @return 변경 행 수
     */
    @Transactional
    public int updateTemplate(String roleCode, List<AccountPermissionUpdate> updates, String actorId) {
        return updateTemplate(roleCode, updates, actorId, null);
    }

    /**
     * 역할 템플릿을 일괄 upsert 한다.
     *
     * <p>관리 page-code 는 비MASTER가 템플릿에 주입할 수 없다. 템플릿은 이후 MASTER apply 경로로
     * 계정 권한에 복사될 수 있으므로 직접 매트릭스와 같은 봉쇄 정책을 적용한다.
     *
     * @param roleCode  역할 코드
     * @param updates   갱신 목록
     * @param actorId   변경자
     * @param actorRole 요청자 role header 값
     * @return 변경 건수
     */
    @Transactional
    public int updateTemplate(
            String roleCode,
            List<AccountPermissionUpdate> updates,
            String actorId,
            String actorRole) {
        if (roleCode == null || roleCode.isBlank() || updates == null || updates.isEmpty()) {
            return 0;
        }
        int changed = 0;
        for (AccountPermissionUpdate update : updates) {
            validatePageCode(update.pageCode());
            ManagementPageMutationGuard.rejectManagementPageMutation(update.pageCode(), actorRole);
            validateActions(update.actions());
            RolePagePermissionTemplate template = templateRepository
                    .findByRoleCodeAndPageCode(roleCode, update.pageCode())
                    .orElseGet(() -> RolePagePermissionTemplate.of(roleCode, update.pageCode()));
            update.actions().applyTo(template);
            templateRepository.save(template);
            changed++;
        }
        return changed;
    }

    /**
     * 다계정 일괄 적용.
     *
     * @param request 요청
     * @param actorId 변경자
     * @return 변경 행 수
     */
    @Transactional
    public int bulkApply(BulkPermissionRequest request, String actorId) {
        return bulkApply(request, actorId, null);
    }

    /**
     * 다계정 일괄 적용.
     *
     * @param request   요청
     * @param actorId   변경자
     * @param actorRole 요청자 역할 풀네임
     * @return 변경 행 수
     */
    @Transactional
    public int bulkApply(BulkPermissionRequest request, String actorId, String actorRole) {
        if (request == null || request.accountIds() == null || request.accountIds().isEmpty()) {
            return 0;
        }
        int changed = 0;
        for (UUID accountId : request.accountIds()) {
            if ("template".equalsIgnoreCase(request.mode())) {
                changed += applyTemplate(accountId, request.roleCode(), actorId, actorRole);
            } else {
                changed += updateAccountMatrix(accountId, request.grants(), actorId, actorRole);
            }
        }
        return changed;
    }

    public record AccountSummary(UUID id, String displayName, String role, boolean enabled) {
    }

    public record AccountPermissionUpdate(String pageCode, ActionMatrix actions) {
    }

    public record BulkPermissionRequest(
            List<UUID> accountIds,
            String mode,
            String roleCode,
            List<AccountPermissionUpdate> grants) {
    }

    public record ActionMatrix(
            boolean view,
            boolean create,
            boolean update,
            boolean delete,
            boolean restore,
            boolean download,
            boolean print) {

        public static ActionMatrix none() {
            return new ActionMatrix(false, false, false, false, false, false, false);
        }

        public static ActionMatrix from(AccountPagePermission permission) {
            return new ActionMatrix(
                    permission.isCanView(),
                    permission.isCanCreate(),
                    permission.isCanUpdate(),
                    permission.isCanDelete(),
                    permission.isCanRestore(),
                    permission.isCanDownload(),
                    permission.isCanPrint());
        }

        public static ActionMatrix from(AccountPermissionOverride override) {
            return new ActionMatrix(
                    override.isCanView(),
                    override.isCanCreate(),
                    override.isCanUpdate(),
                    override.isCanDelete(),
                    override.isCanRestore(),
                    override.isCanDownload(),
                    override.isCanPrint());
        }

        public static ActionMatrix from(GroupPagePermission permission) {
            return new ActionMatrix(
                    permission.isCanView(),
                    permission.isCanCreate(),
                    permission.isCanUpdate(),
                    permission.isCanDelete(),
                    permission.isCanRestore(),
                    permission.isCanDownload(),
                    permission.isCanPrint());
        }

        public static ActionMatrix from(RolePagePermissionTemplate template) {
            return new ActionMatrix(
                    template.isCanView(),
                    template.isCanCreate(),
                    template.isCanUpdate(),
                    template.isCanDelete(),
                    template.isCanRestore(),
                    template.isCanDownload(),
                    template.isCanPrint());
        }

        public void applyTo(AccountPagePermission permission) {
            permission.setActions(view, create, update, delete, restore, download, print);
        }

        public void applyTo(AccountPermissionOverride override) {
            override.setActions(view, create, update, delete, restore, download, print);
        }

        public void applyTo(GroupPagePermission permission) {
            permission.setActions(view, create, update, delete, restore, download, print);
        }

        public void applyTo(RolePagePermissionTemplate template) {
            template.setActions(view, create, update, delete, restore, download, print);
        }
    }

    private void requireAccount(UUID accountId) {
        accountRepository.findById(accountId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "계정을 찾을 수 없습니다."));
    }

    private void validatePageCode(String pageCode) {
        if (pageCode == null || pageCode.isBlank() || !PageCode.isValid(pageCode)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "등록되지 않은 페이지 코드입니다: " + pageCode);
        }
    }

    private void validateActions(ActionMatrix actions) {
        if (actions == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "권한 액션 값은 필수입니다.");
        }
    }

    private void rejectManagementPageMutation(String pageCode, String actorRole) {
        if (PageCode.isManagementPageCode(pageCode) && !isMaster(actorRole)) {
            throw new BusinessException(
                    ErrorCode.FORBIDDEN,
                    "관리권위 page-code 는 MASTER 만 부여하거나 회수할 수 있습니다.");
        }
    }

    private boolean isMaster(String actorRole) {
        return "MASTER".equalsIgnoreCase(actorRole == null ? "" : actorRole.trim());
    }
}
