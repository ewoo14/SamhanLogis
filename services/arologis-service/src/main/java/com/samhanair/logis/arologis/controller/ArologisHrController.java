package com.samhanair.logis.arologis.controller;

import com.samhanair.logis.arologis.domain.auth.AdminUserRole;
import com.samhanair.logis.arologis.service.ArologisDepartmentService;
import com.samhanair.logis.arologis.service.ArologisEmployeeService;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 아로로지스 HR admin API.
 *
 * <p>UUID 비공개 가드: 직원 식별자는 loginId, 부서 식별자는 departmentCode 만 사용한다.
 */
@RestController
@RequestMapping("/admin/arologis/hr")
@RequiredArgsConstructor
public class ArologisHrController {

    private static final String USER_ID_HEADER = "X-User-Id";

    private final ArologisEmployeeService employeeService;
    private final ArologisDepartmentService departmentService;

    /** 직원 목록 조회. */
    @Operation(summary = "아로로지스 직원 목록 조회")
    @GetMapping("/employees")
    @RequirePermission(page = "arologis.hr.employees", action = PermissionAction.VIEW)
    public ApiResponse<List<ArologisEmployeeService.EmployeeView>> listEmployees(
            @RequestParam(required = false) String departmentCode,
            @RequestParam(required = false) Boolean activeOnly) {
        return ApiResponse.ok(employeeService.list(departmentCode, activeOnly));
    }

    /** 직원 생성 + AdminUser 자동 provisioning. */
    @Operation(summary = "아로로지스 직원 생성")
    @PostMapping("/employees")
    @RequirePermission(page = "arologis.hr.employees", action = PermissionAction.CREATE)
    public ApiResponse<ArologisEmployeeService.ProvisionedEmployee> createEmployee(
            @Valid @RequestBody CreateEmployeeRequest request,
            @RequestHeader(value = USER_ID_HEADER, required = false) String actor) {
        return ApiResponse.ok(employeeService.createEmployee(request.toCommand(), actor));
    }

    /** 직원 기본 정보 수정. */
    @Operation(summary = "아로로지스 직원 수정")
    @PutMapping("/employees/{loginId}")
    @RequirePermission(page = "arologis.hr.employees", action = PermissionAction.UPDATE)
    public ApiResponse<ArologisEmployeeService.EmployeeView> updateEmployee(
            @PathVariable String loginId,
            @Valid @RequestBody UpdateEmployeeRequest request) {
        return ApiResponse.ok(employeeService.update(loginId, request.toCommand()));
    }

    /** 직원 롤 변경. */
    @Operation(summary = "아로로지스 직원 롤 변경")
    @PutMapping("/employees/{loginId}/role")
    @RequirePermission(page = "arologis.hr.employees", action = PermissionAction.UPDATE)
    public ApiResponse<ArologisEmployeeService.EmployeeView> changeRole(
            @PathVariable String loginId,
            @Valid @RequestBody ChangeRoleRequest request,
            @RequestHeader(value = USER_ID_HEADER, required = false) String actor) {
        return ApiResponse.ok(employeeService.changeRole(loginId, request.role(), request.reason(), actor));
    }

    /** 직원 퇴직 처리. */
    @Operation(summary = "아로로지스 직원 퇴직 처리")
    @PutMapping("/employees/{loginId}/terminate")
    @RequirePermission(page = "arologis.hr.employees", action = PermissionAction.DELETE)
    public ApiResponse<ArologisEmployeeService.EmployeeView> terminate(
            @PathVariable String loginId,
            @Valid @RequestBody TerminateEmployeeRequest request,
            @RequestHeader(value = USER_ID_HEADER, required = false) String actor) {
        return ApiResponse.ok(employeeService.terminate(loginId, request.terminationDate(), actor));
    }

    /** 직원 롤 변경 이력 조회. */
    @Operation(summary = "아로로지스 직원 롤 변경 이력 조회")
    @GetMapping("/employees/{loginId}/role-histories")
    @RequirePermission(page = "arologis.hr.employees", action = PermissionAction.VIEW)
    public ApiResponse<List<ArologisEmployeeService.RoleHistoryView>> roleHistories(
            @PathVariable String loginId) {
        return ApiResponse.ok(employeeService.roleHistories(loginId));
    }

    /** 부서 목록 조회. */
    @Operation(summary = "아로로지스 부서 목록 조회")
    @GetMapping("/departments")
    @RequirePermission(page = "arologis.hr.departments", action = PermissionAction.VIEW)
    public ApiResponse<List<ArologisDepartmentService.DepartmentView>> listDepartments() {
        return ApiResponse.ok(departmentService.list());
    }

    /** 부서 생성. */
    @Operation(summary = "아로로지스 부서 생성")
    @PostMapping("/departments")
    @RequirePermission(page = "arologis.hr.departments", action = PermissionAction.CREATE)
    public ApiResponse<ArologisDepartmentService.DepartmentView> createDepartment(
            @Valid @RequestBody CreateDepartmentRequest request) {
        return ApiResponse.ok(departmentService.create(request.toCommand()));
    }

    /** 부서 수정. */
    @Operation(summary = "아로로지스 부서 수정")
    @PutMapping("/departments/{code}")
    @RequirePermission(page = "arologis.hr.departments", action = PermissionAction.UPDATE)
    public ApiResponse<ArologisDepartmentService.DepartmentView> updateDepartment(
            @PathVariable String code,
            @Valid @RequestBody UpdateDepartmentRequest request) {
        return ApiResponse.ok(departmentService.update(code, request.toCommand()));
    }

    /** 부서 soft-delete. */
    @Operation(summary = "아로로지스 부서 삭제")
    @PutMapping("/departments/{code}/delete")
    @RequirePermission(page = "arologis.hr.departments", action = PermissionAction.DELETE)
    public ApiResponse<Void> deleteDepartment(
            @PathVariable String code,
            @RequestHeader(value = USER_ID_HEADER, required = false) String actor) {
        departmentService.delete(code, actor);
        return ApiResponse.ok(null);
    }

    /** 직원 생성 요청. */
    public record CreateEmployeeRequest(
            @NotBlank @Size(max = 64) String loginId,
            @NotBlank @Size(max = 100) String fullName,
            @Size(max = 30) String position,
            @NotBlank @Size(max = 64) String departmentCode,
            @NotNull @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate hireDate,
            @Size(max = 100) String email,
            @Size(max = 20) String phone,
            @NotNull AdminUserRole role) {
        ArologisEmployeeService.CreateEmployeeCommand toCommand() {
            return new ArologisEmployeeService.CreateEmployeeCommand(
                    loginId, fullName, position, departmentCode, hireDate, email, phone, role);
        }
    }

    /** 직원 수정 요청. */
    public record UpdateEmployeeRequest(
            @NotBlank @Size(max = 100) String fullName,
            @Size(max = 30) String position,
            @NotBlank @Size(max = 64) String departmentCode,
            @Size(max = 100) String email,
            @Size(max = 20) String phone) {
        ArologisEmployeeService.UpdateEmployeeCommand toCommand() {
            return new ArologisEmployeeService.UpdateEmployeeCommand(
                    fullName, position, departmentCode, email, phone);
        }
    }

    /** 롤 변경 요청. */
    public record ChangeRoleRequest(
            @NotNull AdminUserRole role,
            @Size(max = 500) String reason) {
    }

    /** 퇴직 요청. */
    public record TerminateEmployeeRequest(
            @NotNull @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate terminationDate) {
    }

    /** 부서 생성 요청. */
    public record CreateDepartmentRequest(
            @NotBlank @Size(max = 64) String code,
            @NotBlank @Size(max = 100) String name,
            int displayOrder) {
        ArologisDepartmentService.CreateDepartmentCommand toCommand() {
            return new ArologisDepartmentService.CreateDepartmentCommand(code, name, displayOrder);
        }
    }

    /** 부서 수정 요청. */
    public record UpdateDepartmentRequest(
            @NotBlank @Size(max = 100) String name,
            int displayOrder) {
        ArologisDepartmentService.UpdateDepartmentCommand toCommand() {
            return new ArologisDepartmentService.UpdateDepartmentCommand(name, displayOrder);
        }
    }
}
