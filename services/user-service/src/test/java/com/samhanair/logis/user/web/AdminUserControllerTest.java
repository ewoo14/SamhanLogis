package com.samhanair.logis.user.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.security.Role;
import com.samhanair.logis.user.domain.Department;
import com.samhanair.logis.user.domain.Employee;
import com.samhanair.logis.user.repository.EmployeeRepository;
import com.samhanair.logis.user.repository.RoleChangeHistoryRepository;
import com.samhanair.logis.user.service.EmployeeSignatureHandoffService;
import com.samhanair.logis.user.service.EmployeeSignatureService;
import com.samhanair.logis.user.service.EmployeeProvisioningService;
import com.samhanair.logis.user.web.dto.AdminUserCreateRequest;
import com.samhanair.logis.user.web.dto.AdminUserCreateResponse;
import com.samhanair.logis.user.web.dto.AdminUserListResponse;
import com.samhanair.logis.user.web.dto.AdminUserRoleChangeRequest;
import com.samhanair.logis.user.web.dto.AdminUserUpdateRequest;
import com.samhanair.logis.user.web.dto.EmployeeResponse;
import com.samhanair.logis.user.web.dto.RoleHistoryResponse;
import com.samhanair.logis.shared.audit.contract.AuditEventV2;
import com.samhanair.logis.shared.audit.publisher.AuditPublisher;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * AdminUserController 단위 테스트 — Phase 10 P0-5 보강.
 *
 * <p>Spring Context 없이 controller 를 직접 생성하여 endpoint 로직과 응답 형태를 검증.
 * 외부 의존 (ProvisioningService / Repository) 은 Mockito mock 으로 격리.
 */
class AdminUserControllerTest {

    private final EmployeeProvisioningService provisioningService =
            mock(EmployeeProvisioningService.class);
    private final EmployeeRepository employeeRepository =
            mock(EmployeeRepository.class);
    private final RoleChangeHistoryRepository roleHistoryRepository =
            mock(RoleChangeHistoryRepository.class);
    private final EmployeeSignatureService signatureService =
            mock(EmployeeSignatureService.class);
    private final EmployeeSignatureHandoffService handoffService =
            mock(EmployeeSignatureHandoffService.class);
    private final AuditPublisher auditPublisher = mock(AuditPublisher.class);

    private final AdminUserController controller = new AdminUserController(
            provisioningService, employeeRepository, roleHistoryRepository, signatureService, handoffService,
            auditPublisher);

    // -------------------------------------------------------------------------
    // list
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("list — 페이지네이션 응답에 items / total / page / size 포함")
    void list_returns_paginated_response() {
        Department dept = Department.create("SALES_1", "영업1팀", 2);
        UUID deptId = UUID.randomUUID();
        ReflectionTestUtils.setField(dept, "id", deptId);
        Employee emp = Employee.create(UUID.randomUUID(), "kim01", "김영업", "사원",
                Role.SALES, dept, false, LocalDate.of(2026, 1, 1), null, null);
        Page<Employee> page = new PageImpl<>(List.of(emp), PageRequest.of(0, 20), 1L);
        when(employeeRepository.searchAdmin(any(), any(), any(), any(), any())).thenReturn(page);

        ApiResponse<AdminUserListResponse> response =
                controller.list(0, 20, "김", Role.SALES, deptId, null);

        assertThat(response.isSuccess()).isTrue();
        AdminUserListResponse body = response.getData();
        assertThat(body.items()).hasSize(1);
        assertThat(body.items().get(0).fullName()).isEqualTo("김영업");
        assertThat(body.total()).isEqualTo(1);
        assertThat(body.page()).isEqualTo(0);
        assertThat(body.size()).isEqualTo(20);
    }

    @Test
    @DisplayName("list — LIKE wildcard를 repository에 literal escape하여 전달")
    void list_escapes_like_wildcards_before_repository_call() {
        when(employeeRepository.searchAdmin(any(), any(), any(), any(), any()))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        controller.list(0, 20, "LUNA%_\\", null, null, null);

        verify(employeeRepository).searchAdmin(eq("LUNA\\%\\_\\\\"), any(), any(), any(), any());
    }

    // -------------------------------------------------------------------------
    // listRoles
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("listRoles — 10 ROLE 모두 반환 (MASTER/DISPATCH/STAFF/DRIVER 포함)")
    void listRoles_returns_all_ten_roles() {
        ApiResponse<List<Role>> response = controller.listRoles();
        assertThat(response.getData()).hasSize(10)
                .contains(Role.MASTER, Role.MANAGER, Role.DISPATCH, Role.STAFF, Role.DRIVER);
    }

    // -------------------------------------------------------------------------
    // create (POST /api/v1/admin/users)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("create — 서비스 adminCreate 호출 + 임시 비밀번호 포함 응답 반환")
    void create_delegates_to_service_and_returns_response() {
        UUID deptId = UUID.randomUUID();
        AdminUserCreateRequest req = new AdminUserCreateRequest(
                "newuser01", "신규직원", "new@samhan.com", Role.SALES, deptId, "010-1234-5678");

        AdminUserCreateResponse mockResponse = new AdminUserCreateResponse(
                UUID.randomUUID(), "newuser01", "신규직원", Role.SALES,
                deptId, "영업팀", "new@samhan.com", "010-1234-5678", "TmpPass01", true);
        when(provisioningService.adminCreate(any(), any())).thenReturn(mockResponse);

        ApiResponse<AdminUserCreateResponse> result = controller.create(req, null);

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData().loginId()).isEqualTo("newuser01");
        assertThat(result.getData().temporaryPassword()).isEqualTo("TmpPass01");
        assertThat(result.getData().passwordChangeRequired()).isTrue();
        verify(provisioningService).adminCreate(eq(req), any());
    }

    // -------------------------------------------------------------------------
    // update (PATCH /api/v1/admin/users/{id})
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("update — 서비스 adminUpdate 호출 후 수정된 EmployeeResponse 반환")
    void update_delegates_to_service() {
        UUID empId = UUID.randomUUID();
        UUID deptId = UUID.randomUUID();
        AdminUserUpdateRequest req = new AdminUserUpdateRequest(
                "수정된이름", "updated@samhan.com", "010-9999-0000", deptId);

        EmployeeResponse mockResp = new EmployeeResponse(
                empId, "user01", "수정된이름", "사원", Role.SALES,
                deptId, "영업팀", false, LocalDate.of(2026, 1, 1), null,
                "updated@samhan.com", "010-9999-0000");
        when(provisioningService.adminUpdate(any(), any(), any())).thenReturn(mockResp);

        ApiResponse<EmployeeResponse> result = controller.update(empId, req, null);

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData().fullName()).isEqualTo("수정된이름");
        verify(provisioningService).adminUpdate(eq(empId), eq(req), any());
    }

    // -------------------------------------------------------------------------
    // updateRole (PATCH /api/v1/admin/users/{id}/role)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("updateRole — newRole + reason 으로 서비스 updateRole 호출")
    void updateRole_delegates_to_service_with_reason() {
        UUID empId = UUID.randomUUID();
        UUID deptId = UUID.randomUUID();
        AdminUserRoleChangeRequest req = new AdminUserRoleChangeRequest(Role.MANAGER, "팀장 승진");

        EmployeeResponse mockResp = new EmployeeResponse(
                empId, "user01", "홍길동", "팀장", Role.MANAGER,
                deptId, "영업팀", false, LocalDate.of(2026, 1, 1), null, null, null);
        when(provisioningService.updateRole(any(), any(), any(), any())).thenReturn(mockResp);

        ApiResponse<EmployeeResponse> result = controller.updateRole(empId, req, null);

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData().role()).isEqualTo(Role.MANAGER);
        verify(provisioningService).updateRole(eq(empId), eq(Role.MANAGER), eq("팀장 승진"), any());
    }

    @Test
    void updateRole_publishesCentralAuditEvent() {
        UUID empId = UUID.randomUUID();
        AdminUserRoleChangeRequest req = new AdminUserRoleChangeRequest(Role.MANAGER, "role change");
        EmployeeResponse mockResp = new EmployeeResponse(
                empId, "user01", "Kim", "Staff", Role.MANAGER,
                UUID.randomUUID(), "Sales", false, LocalDate.of(2026, 1, 1), null, null, null);
        when(provisioningService.updateRole(any(), any(), any(), any())).thenReturn(mockResp);

        ApiResponse<EmployeeResponse> result = controller.updateRole(empId, req, "actor-id");

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData()).isSameAs(mockResp);
        var event = org.mockito.ArgumentCaptor.forClass(AuditEventV2.class);
        verify(auditPublisher).publishAfterCommit(event.capture());
        assertThat(event.getValue().serviceName()).isEqualTo("user-service");
        assertThat(event.getValue().httpMethod()).isEqualTo("PATCH");
        assertThat(event.getValue().routeTemplate()).isEqualTo("/api/v1/admin/users/{id}/role");
        assertThat(event.getValue().resourceType()).isEqualTo("EMPLOYEE_ROLE");
        assertThat(event.getValue().resourceId()).isEqualTo(empId.toString());
    }

    @Test
    void updateRole_isFailSoftWhenAuditPublishingFails() {
        UUID empId = UUID.randomUUID();
        AdminUserRoleChangeRequest req = new AdminUserRoleChangeRequest(Role.MANAGER, "role change");
        EmployeeResponse mockResp = new EmployeeResponse(
                empId, "user01", "Kim", "Staff", Role.MANAGER,
                UUID.randomUUID(), "Sales", false, LocalDate.of(2026, 1, 1), null, null, null);
        when(provisioningService.updateRole(any(), any(), any(), any())).thenReturn(mockResp);
        doThrow(new RuntimeException("rabbit down")).when(auditPublisher).publishAfterCommit(any());

        ApiResponse<EmployeeResponse> result = controller.updateRole(empId, req, "actor-id");

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData()).isSameAs(mockResp);
        verify(provisioningService).updateRole(eq(empId), eq(Role.MANAGER), eq("role change"), any());
    }

    // -------------------------------------------------------------------------
    // disable (POST /api/v1/admin/users/{id}/disable)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("disable — 서비스 adminDisable 호출 (204 No Content)")
    void disable_delegates_to_service() {
        UUID empId = UUID.randomUUID();

        controller.disable(empId, null);

        verify(provisioningService).adminDisable(eq(empId), any());
    }

    // -------------------------------------------------------------------------
    // unlock (POST /api/v1/admin/users/{id}/unlock)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("unlock — 서비스 adminUnlock 호출 (204 No Content)")
    void unlock_delegates_to_service() {
        UUID empId = UUID.randomUUID();

        controller.unlock(empId, null);

        verify(provisioningService).adminUnlock(eq(empId), any());
    }

    // -------------------------------------------------------------------------
    // roleHistory (GET /api/v1/admin/users/{id}/role-history)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("roleHistory — 빈 이력 조회 시 빈 리스트 반환")
    void roleHistory_empty_list() {
        UUID empId = UUID.randomUUID();
        when(roleHistoryRepository.findAllByEmployeeIdOrderByCreatedAtDesc(empId))
                .thenReturn(List.of());

        ApiResponse<List<RoleHistoryResponse>> result = controller.roleHistory(empId);

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData()).isEmpty();
    }
}
