package com.samhanair.logis.user.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.security.Role;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.user.domain.Employee;
import com.samhanair.logis.user.repository.EmployeeRepository;
import com.samhanair.logis.user.service.EmployeeProvisioningService;
import com.samhanair.logis.user.service.OrgChartService;
import com.samhanair.logis.user.service.dto.EmployeeProjection;
import com.samhanair.logis.user.web.dto.CreateEmployeeRequest;
import com.samhanair.logis.user.web.dto.EmployeeResponse;
import com.samhanair.logis.user.web.dto.LookupRequest;
import com.samhanair.logis.user.web.dto.TerminateRequest;
import com.samhanair.logis.user.web.dto.UpdateEmployeeRequest;
import com.samhanair.logis.user.web.dto.UpdateRoleRequest;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Employee CRUD + lookup. Authorization is enforced by dynamic {@code @RequirePermission}
 * page grants from the gateway-provided account identity.
 *
 * <p>SP-D6-3 동적 권한 이중 가드:
 * <ul>
 *   <li>역할 변경/퇴사({@code updateRole}/{@code terminate})는 HR 고위험 작업이므로
 *       {@code hr.role-management} page-code 로 일반 직원관리와 분리한다. Phase B(D-PB-03)
 *       이후 MASTER 는 기본 seed 로 통과하고, MASTER 가 명시 위임한 그룹도 수행 가능하다.</li>
 *   <li>일반 직원 생성/수정 write → {@code @RequirePermission(page="admin.employees")} 유지.
 *       MANAGER 의 직원정보 관리 권한이 역할변경/퇴사로 확장되지 않도록 분리한다.</li>
 * </ul>
 */
@RestController
@RequestMapping("/users/employees")
@RequiredArgsConstructor
public class EmployeeController {

    private static final String CALLER_HEADER = "X-User-Id";
    private static final String ROLE_HEADER   = "X-User-Role";

    private final EmployeeProvisioningService provisioningService;
    private final OrgChartService orgChartService;
    private final EmployeeRepository employeeRepository;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = "admin.employees", action = PermissionAction.CREATE)
    public ApiResponse<EmployeeResponse> create(
            @Valid @RequestBody CreateEmployeeRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        return ApiResponse.ok(provisioningService.create(request, parseCaller(callerHeader)));
    }

    @GetMapping
    @RequirePermission(page = "admin.employees", action = PermissionAction.VIEW)
    public ApiResponse<List<EmployeeResponse>> list(
            @RequestParam(required = false) UUID departmentId,
            @RequestParam(required = false) Role role) {
        List<Employee> result;
        if (departmentId != null && role != null) {
            result = employeeRepository.findAllByDepartment_IdAndRoleSnapshot(departmentId, role);
        } else if (departmentId != null) {
            result = employeeRepository.findAllByDepartment_Id(departmentId);
        } else if (role != null) {
            result = employeeRepository.findAllByRoleSnapshot(role);
        } else {
            result = employeeRepository.findAll();
        }
        return ApiResponse.ok(result.stream().map(EmployeeResponse::from).toList());
    }

    @GetMapping("/{id}")
    @RequirePermission(page = "admin.employees", action = PermissionAction.VIEW)
    public ApiResponse<EmployeeResponse> getOne(@PathVariable UUID id) {
        Employee e = employeeRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다"));
        return ApiResponse.ok(EmployeeResponse.from(e));
    }

    @PostMapping("/lookup")
    public ApiResponse<List<EmployeeProjection>> lookup(@Valid @RequestBody LookupRequest request) {
        return ApiResponse.ok(orgChartService.lookup(request.ids()));
    }

    @PatchMapping("/{id}")
    @RequirePermission(page = "admin.employees", action = PermissionAction.UPDATE)
    public ApiResponse<EmployeeResponse> update(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateEmployeeRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        return ApiResponse.ok(provisioningService.update(id, request, parseCaller(callerHeader)));
    }

    @PatchMapping("/{id}/role")
    // Phase B(D-PB-03): 기본 MASTER-only seed, MASTER 명시 위임 그룹은 수행 가능.
    @RequirePermission(page = "hr.role-management", action = PermissionAction.UPDATE)
    public ApiResponse<EmployeeResponse> updateRole(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateRoleRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        return ApiResponse.ok(provisioningService.updateRole(id, request.role(), parseCaller(callerHeader)));
    }

    @PostMapping("/{id}/terminate")
    // Phase B(D-PB-03): 기본 MASTER-only seed, MASTER 명시 위임 그룹은 수행 가능.
    @RequirePermission(page = "hr.role-management", action = PermissionAction.DELETE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void terminate(
            @PathVariable UUID id,
            @Valid @RequestBody TerminateRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        provisioningService.terminate(id, request.terminationDate(), parseCaller(callerHeader));
    }

    private UUID parseCaller(String header) {
        if (header == null || header.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(header);
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }
}
