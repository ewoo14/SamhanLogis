package com.samhanair.logis.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.auth.domain.RolePagePermission;
import com.samhanair.logis.auth.domain.PageCode;
import com.samhanair.logis.auth.repository.RolePagePermissionRepository;
import com.samhanair.logis.auth.service.dto.PermissionDto;
import com.samhanair.logis.auth.web.dto.PermissionBatchUpdateRequest;
import com.samhanair.logis.auth.web.dto.PermissionUpdateRequest;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * DynamicPermissionService 단위 테스트.
 *
 * <p>DB override 우선 전략 및 fallback 동작, 도메인 메서드 적용,
 * pageCode 유효성 검증, 권한 갱신/삭제 시나리오를 검증한다.
 */
@ExtendWith(MockitoExtension.class)
class DynamicPermissionServiceTest {

    @Mock
    private RolePagePermissionRepository repository;

    @InjectMocks
    private DynamicPermissionService service;

    private static final String ROLE_ACCOUNTANT = "ACCOUNTANT";
    private static final String ROLE_SALES = "SALES";
    private static final String PAGE_EMIT_NTS = "accounting.tax-invoice.emit-nts";
    private static final String PAGE_DISPATCH = "dispatch.board";
    private static final String ACTOR_ID = "a0000000-0000-0000-0000-000000000001";

    // -----------------------------------------------------------------------
    // canView / canEdit / canAccess
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("DB override row 존재 + canView=true → canView 반환")
    void canView_whenOverrideExists_returnsDbValue() {
        RolePagePermission perm = RolePagePermission.create(ROLE_ACCOUNTANT, PAGE_EMIT_NTS, true, true);
        when(repository.findByRoleCodeAndPageCode(ROLE_ACCOUNTANT, PAGE_EMIT_NTS))
                .thenReturn(Optional.of(perm));

        assertThat(service.canView(ROLE_ACCOUNTANT, PAGE_EMIT_NTS)).isTrue();
    }

    @Test
    @DisplayName("DB override row 없음 → canView fallback false")
    void canView_whenNoOverride_returnsFalse() {
        when(repository.findByRoleCodeAndPageCode(ROLE_SALES, PAGE_EMIT_NTS))
                .thenReturn(Optional.empty());

        assertThat(service.canView(ROLE_SALES, PAGE_EMIT_NTS)).isFalse();
    }

    @Test
    @DisplayName("DB override canView=true, canEdit=false → canEdit false")
    void canEdit_whenOverrideViewOnlyExists_returnsFalse() {
        RolePagePermission perm = RolePagePermission.create(ROLE_ACCOUNTANT, PAGE_EMIT_NTS, true, false);
        when(repository.findByRoleCodeAndPageCode(ROLE_ACCOUNTANT, PAGE_EMIT_NTS))
                .thenReturn(Optional.of(perm));

        assertThat(service.canEdit(ROLE_ACCOUNTANT, PAGE_EMIT_NTS)).isFalse();
    }

    @Test
    @DisplayName("canAccess VIEW — canView true 이면 true 반환")
    void canAccess_view_returnsTrue() {
        RolePagePermission perm = RolePagePermission.create(ROLE_ACCOUNTANT, PAGE_DISPATCH, true, false);
        when(repository.findByRoleCodeAndPageCode(ROLE_ACCOUNTANT, PAGE_DISPATCH))
                .thenReturn(Optional.of(perm));

        assertThat(service.canAccess(ROLE_ACCOUNTANT, PAGE_DISPATCH, "VIEW")).isTrue();
    }

    @Test
    @DisplayName("canAccess 잘못된 permissionType → INVALID_INPUT BusinessException")
    void canAccess_invalidPermissionType_throwsException() {
        // repository 호출 없이 switch 분기에서 즉시 예외 발생 — stub 불필요
        assertThatThrownBy(() -> service.canAccess(ROLE_ACCOUNTANT, PAGE_DISPATCH, "ADMIN"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assertThat(be.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT);
                    assertThat(be.getMessage())
                            .isEqualTo("permissionType 은 VIEW 또는 EDIT 이어야 합니다: ADMIN");
                });
    }

    // -----------------------------------------------------------------------
    // updatePermission
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("override row 없을 때 updatePermission → 신규 RolePagePermission 생성")
    void updatePermission_whenNoExisting_createsNew() {
        PermissionUpdateRequest request = new PermissionUpdateRequest(
                ROLE_SALES, PAGE_DISPATCH, true, true);
        when(repository.findByRoleCodeAndPageCode(ROLE_SALES, PAGE_DISPATCH))
                .thenReturn(Optional.empty());
        when(repository.save(any(RolePagePermission.class))).thenAnswer(inv -> inv.getArgument(0));

        PermissionDto result = service.updatePermission(request, ACTOR_ID);

        assertThat(result.roleCode()).isEqualTo(ROLE_SALES);
        assertThat(result.pageCode()).isEqualTo(PAGE_DISPATCH);
        assertThat(result.canView()).isTrue();
        assertThat(result.canEdit()).isTrue();
        assertThat(result.isOverride()).isTrue();
    }

    @Test
    @DisplayName("override row 존재 시 updatePermission → 기존 row 도메인 메서드로 갱신")
    void updatePermission_whenExisting_updatesViadomainMethod() {
        RolePagePermission existing = RolePagePermission.create(ROLE_SALES, PAGE_DISPATCH, true, true);
        PermissionUpdateRequest request = new PermissionUpdateRequest(
                ROLE_SALES, PAGE_DISPATCH, false, false);
        when(repository.findByRoleCodeAndPageCode(ROLE_SALES, PAGE_DISPATCH))
                .thenReturn(Optional.of(existing));
        when(repository.save(any(RolePagePermission.class))).thenAnswer(inv -> inv.getArgument(0));

        PermissionDto result = service.updatePermission(request, ACTOR_ID);

        assertThat(result.canView()).isFalse();
        assertThat(result.canEdit()).isFalse();
    }

    @Test
    @DisplayName("canEdit=true 설정 시 canView 도 자동 true — 도메인 규칙")
    void updatePermission_canEditTrue_forcesCanViewTrue() {
        PermissionUpdateRequest request = new PermissionUpdateRequest(
                ROLE_ACCOUNTANT, PAGE_EMIT_NTS, false, true); // canView=false 이지만 canEdit=true
        when(repository.findByRoleCodeAndPageCode(ROLE_ACCOUNTANT, PAGE_EMIT_NTS))
                .thenReturn(Optional.empty());
        when(repository.save(any(RolePagePermission.class))).thenAnswer(inv -> inv.getArgument(0));

        PermissionDto result = service.updatePermission(request, ACTOR_ID);

        // 도메인 메서드 updatePermissions: canEdit=true → canView 자동 true
        assertThat(result.canEdit()).isTrue();
        assertThat(result.canView()).isTrue();
    }

    @Test
    @DisplayName("미등록 pageCode → INVALID_INPUT 예외")
    void updatePermission_invalidPageCode_throwsBusinessException() {
        PermissionUpdateRequest request = new PermissionUpdateRequest(
                ROLE_ACCOUNTANT, "unknown.page.code", true, true);

        assertThatThrownBy(() -> service.updatePermission(request, ACTOR_ID))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));

        verify(repository, never()).save(any());
    }

    // -----------------------------------------------------------------------
    // updatePermissionsBatch
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("batch 갱신 — 2건 성공")
    void updatePermissionsBatch_twoItems_succeeds() {
        PermissionBatchUpdateRequest request = new PermissionBatchUpdateRequest(List.of(
                new PermissionUpdateRequest(ROLE_ACCOUNTANT, PAGE_EMIT_NTS, true, true),
                new PermissionUpdateRequest(ROLE_SALES, PAGE_DISPATCH, true, false)
        ));
        when(repository.findByRoleCodeAndPageCode(any(), any())).thenReturn(Optional.empty());
        when(repository.save(any(RolePagePermission.class))).thenAnswer(inv -> inv.getArgument(0));

        List<PermissionDto> results = service.updatePermissionsBatch(request, ACTOR_ID);

        assertThat(results).hasSize(2);
    }

    // -----------------------------------------------------------------------
    // deletePermission (soft-delete)
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("deletePermission — 활성 row 존재 시 markDeleted 호출")
    void deletePermission_whenExists_callsMarkDeleted() {
        RolePagePermission perm = RolePagePermission.create(ROLE_SALES, PAGE_DISPATCH, true, true);
        when(repository.findByRoleCodeAndPageCode(ROLE_SALES, PAGE_DISPATCH))
                .thenReturn(Optional.of(perm));
        when(repository.save(any(RolePagePermission.class))).thenAnswer(inv -> inv.getArgument(0));

        service.deletePermission(ROLE_SALES, PAGE_DISPATCH, ACTOR_ID);

        // soft-delete 적용 확인
        assertThat(perm.getIsDeleted()).isTrue();
        assertThat(perm.getDeletedBy()).isEqualTo(ACTOR_ID);
    }

    @Test
    @DisplayName("deletePermission — row 없으면 NOT_FOUND 예외")
    void deletePermission_whenNotFound_throwsNotFoundException() {
        when(repository.findByRoleCodeAndPageCode(ROLE_SALES, PAGE_DISPATCH))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.deletePermission(ROLE_SALES, PAGE_DISPATCH, ACTOR_ID))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.NOT_FOUND));
    }

    // -----------------------------------------------------------------------
    // getPermissionMatrix
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("getMyPermissions MASTER — 모든 PageCode가 7-action 전권")
    void getMyPermissions_master_returnsAllActionsForEveryPageCode() {
        List<PermissionDto> permissions = service.getMyPermissions("MASTER");

        assertThat(permissions).hasSize(PageCode.values().length);
        assertThat(permissions).allSatisfy(permission -> {
            assertThat(permission.roleCode()).isEqualTo("MASTER");
            assertThat(permission.canView()).isTrue();
            assertThat(permission.canEdit()).isTrue();
            assertThat(permission.isOverride()).isTrue();
        });
        assertThat(permissions).extracting(PermissionDto::pageCode)
                .containsExactlyInAnyOrderElementsOf(
                        java.util.Arrays.stream(PageCode.values()).map(PageCode::getCode).toList());
    }

    @Test
    @DisplayName("getPermissionMatrix — DB rows 없으면 전체 매트릭스 isOverride=false")
    void getPermissionMatrix_whenNoDbRows_allFallback() {
        when(repository.findAllOrderByRoleCodeAndPageCode()).thenReturn(List.of());

        Map<String, Map<String, PermissionDto>> matrix = service.getPermissionMatrix();

        assertThat(matrix).containsKeys("MASTER", "DEVELOPER", "MANAGER", "ACCOUNTANT",
                "SALES", "WAREHOUSE", "DISPATCH", "INVENTORY", "STAFF", "DRIVER", "PARTNER");
        assertThat(matrix).hasSize(11);
        // 모든 행 isOverride=false
        matrix.values().forEach(pageMap ->
                pageMap.values().forEach(dto ->
                        assertThat(dto.isOverride()).isFalse()));
    }

    @Test
    @DisplayName("getPermissionMatrix — DEVELOPER/PARTNER 도 GUI 매트릭스 fallback 행을 받는다")
    void getPermissionMatrix_includesDeveloperAndPartnerFallbackRows() {
        when(repository.findAllOrderByRoleCodeAndPageCode()).thenReturn(List.of());

        Map<String, Map<String, PermissionDto>> matrix = service.getPermissionMatrix();

        assertThat(matrix.get("DEVELOPER").get("messenger.send"))
                .extracting(PermissionDto::roleCode, PermissionDto::pageCode,
                        PermissionDto::canView, PermissionDto::canEdit, PermissionDto::isOverride)
                .containsExactly("DEVELOPER", "messenger.send", false, false, false);
        assertThat(matrix.get("PARTNER").get("sales.partner-order.list"))
                .extracting(PermissionDto::roleCode, PermissionDto::pageCode,
                        PermissionDto::canView, PermissionDto::canEdit, PermissionDto::isOverride)
                .containsExactly("PARTNER", "sales.partner-order.list", false, false, false);
    }

    @Test
    @DisplayName("getPermissionMatrix — DB row 있으면 해당 조합 isOverride=true")
    void getPermissionMatrix_whenDbRowExists_markedAsOverride() {
        RolePagePermission perm = RolePagePermission.create(
                ROLE_ACCOUNTANT, PAGE_EMIT_NTS, true, true);
        when(repository.findAllOrderByRoleCodeAndPageCode()).thenReturn(List.of(perm));

        Map<String, Map<String, PermissionDto>> matrix = service.getPermissionMatrix();

        PermissionDto dto = matrix.get(ROLE_ACCOUNTANT).get(PAGE_EMIT_NTS);
        assertThat(dto.isOverride()).isTrue();
        assertThat(dto.canView()).isTrue();
        assertThat(dto.canEdit()).isTrue();
    }

    // -----------------------------------------------------------------------
    // RolePagePermission 도메인 메서드 체인 검증
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("도메인 메서드 체인: grantEdit → canView 자동 true")
    void domainMethod_grantEdit_forcesCacnViewTrue() {
        RolePagePermission perm = RolePagePermission.create("WAREHOUSE", "inbound.inspection", false, false);

        perm.grantEdit();

        assertThat(perm.isCanView()).isTrue();
        assertThat(perm.isCanEdit()).isTrue();
    }

    @Test
    @DisplayName("도메인 메서드 체인: revokeView → canEdit 도 false")
    void domainMethod_revokeView_alsoRevokesEdit() {
        RolePagePermission perm = RolePagePermission.create("DISPATCH", "dispatch.board", true, true);

        perm.revokeView();

        assertThat(perm.isCanView()).isFalse();
        assertThat(perm.isCanEdit()).isFalse();
    }

    @Test
    @DisplayName("도메인 메서드 체인: revokeEdit → canView 유지")
    void domainMethod_revokeEdit_keepsView() {
        RolePagePermission perm = RolePagePermission.create("ACCOUNTANT", PAGE_EMIT_NTS, true, true);

        perm.revokeEdit();

        assertThat(perm.isCanView()).isTrue();
        assertThat(perm.isCanEdit()).isFalse();
    }
}
