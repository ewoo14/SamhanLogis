package com.samhanair.logis.user.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.security.Role;
import com.samhanair.logis.user.domain.Employee;
import com.samhanair.logis.user.domain.RoleChangeHistory;
import com.samhanair.logis.user.repository.EmployeeRepository;
import com.samhanair.logis.user.repository.RoleChangeHistoryRepository;
import com.samhanair.logis.user.service.EmployeeSignatureService;
import com.samhanair.logis.user.service.EmployeeSignatureHandoffService;
import com.samhanair.logis.user.service.EmployeeProvisioningService;
import com.samhanair.logis.user.web.dto.AdminUserCreateRequest;
import com.samhanair.logis.user.web.dto.AdminUserCreateResponse;
import com.samhanair.logis.user.web.dto.AdminUserListResponse;
import com.samhanair.logis.user.web.dto.AdminUserRoleChangeRequest;
import com.samhanair.logis.user.web.dto.AdminUserUpdateRequest;
import com.samhanair.logis.user.web.dto.EmployeeResponse;
import com.samhanair.logis.user.web.dto.EmployeeSignatureResponse;
import com.samhanair.logis.user.web.dto.EmployeeSignatureUploadRequest;
import com.samhanair.logis.user.web.dto.RoleHistoryResponse;
import com.samhanair.logis.shared.audit.contract.AuditEventV2;
import com.samhanair.logis.shared.audit.publisher.AuditPublisher;
import com.samhanair.logis.security.department.Department;
import com.samhanair.logis.security.department.RequireDepartment;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
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
 * 사용자/권한 관리 admin endpoint — Phase 10 P0-5.
 *
 * <p>frontend {@code /admin/users} 페이지 backing. UUID 비공개 원칙 준수:
 * 응답 DTO 의 {@code id} 는 routing key 로만 사용하며, 화면 표시 라벨은
 * {@code fullName} / {@code loginId} 를 사용.
 *
 * <h2>Phase 12 인사 카테고리 가드</h2>
 * 모든 endpoint 는 {@code @RequireDepartment(EXECUTIVE_OFFICE)} 대표실 부서 가드를 유지하고,
 * 역할별 VIEW/EDIT cap 은 {@code @RequirePermission} 동적 권한으로 검증한다.
 *
 * <h2>Endpoint 목록</h2>
 * <ul>
 *   <li>{@code GET  /api/v1/admin/users} — 사용자 목록 (q/role/departmentId/page/size)</li>
 *   <li>{@code GET  /api/v1/admin/users/roles} — Role enum 목록</li>
 *   <li>{@code POST /api/v1/admin/users} — 신규 직원 등록 (임시 비밀번호 자동 생성)</li>
 *   <li>{@code PATCH /api/v1/admin/users/{id}} — 일반 정보 수정</li>
 *   <li>{@code PATCH /api/v1/admin/users/{id}/role} — 역할 변경 + 이력 적재</li>
 *   <li>{@code POST /api/v1/admin/users/{id}/disable} — 퇴사 처리 (Soft Delete)</li>
 *   <li>{@code POST /api/v1/admin/users/{id}/unlock} — 잠금 해제</li>
 *   <li>{@code GET  /api/v1/admin/users/{id}/role-history} — 역할 변경 이력</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/v1/admin/users")
public class AdminUserController {

    private static final String CALLER_HEADER = "X-User-Id";

    private final EmployeeProvisioningService provisioningService;
    private final EmployeeRepository employeeRepository;
    private final RoleChangeHistoryRepository roleHistoryRepository;
    private final EmployeeSignatureService signatureService;
    private final EmployeeSignatureHandoffService handoffService;
    private final AuditPublisher auditPublisher;

    @Autowired
    public AdminUserController(EmployeeProvisioningService provisioningService,
                               EmployeeRepository employeeRepository,
                               RoleChangeHistoryRepository roleHistoryRepository,
                               EmployeeSignatureService signatureService,
                               EmployeeSignatureHandoffService handoffService,
                               AuditPublisher auditPublisher) {
        this.provisioningService = provisioningService;
        this.employeeRepository = employeeRepository;
        this.roleHistoryRepository = roleHistoryRepository;
        this.signatureService = signatureService;
        this.handoffService = handoffService;
        this.auditPublisher = auditPublisher;
    }

    /** Legacy constructor retained for isolated controller tests and non-Spring callers. */
    public AdminUserController(EmployeeProvisioningService provisioningService,
                               EmployeeRepository employeeRepository,
                               RoleChangeHistoryRepository roleHistoryRepository,
                               EmployeeSignatureService signatureService,
                               EmployeeSignatureHandoffService handoffService) {
        this(provisioningService, employeeRepository, roleHistoryRepository,
                signatureService, handoffService, null);
    }

    // -------------------------------------------------------------------------
    // 목록 / 조회
    // -------------------------------------------------------------------------

    /**
     * 사용자 목록 조회 — q / role / departmentId / status 필터 + 페이지네이션.
     *
     * <p>{@code q} 는 fullName / loginId / email LIKE 부분 일치 (대소문자 무시).
     * frontend 검색창 1개로 3 컬럼 동시 검색. 필터 미입력 시 전체 조회.
     *
     * <p>{@code status} 값: {@code ACTIVE} (terminationDate IS NULL) /
     * {@code LOCKED} (terminationDate IS NOT NULL) / null (전체).
     *
     * @param page         0-based 페이지 번호 (기본값 0)
     * @param size         페이지 크기 (기본값 20)
     * @param q            검색어 (optional)
     * @param role         역할 필터 (optional)
     * @param departmentId 부서 UUID 필터 (optional)
     * @param status       상태 필터 — ACTIVE | LOCKED (optional)
     */
    @GetMapping
    @RequireDepartment(Department.EXECUTIVE_OFFICE)
    @RequirePermission(page = "admin.users", action = PermissionAction.VIEW)
    public ApiResponse<AdminUserListResponse> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Role role,
            @RequestParam(required = false) UUID departmentId,
            @RequestParam(required = false) String status) {
        String normalizedQ = (q == null || q.isBlank()) ? null : escapeLikeLiteral(q.trim());
        String normalizedStatus = (status == null || status.isBlank()) ? null : status.trim().toUpperCase();
        Page<Employee> result = employeeRepository.searchAdmin(
                normalizedQ, role, departmentId, normalizedStatus,
                PageRequest.of(page, size, Sort.by(Sort.Direction.ASC, "fullName")));
        return ApiResponse.ok(AdminUserListResponse.from(result));
    }

    private static String escapeLikeLiteral(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    /**
     * 전체 ROLE 목록 조회 — 사용자 관리 화면 dropdown 데이터.
     */
    @GetMapping("/roles")
    @RequireDepartment(Department.EXECUTIVE_OFFICE)
    @RequirePermission(page = "admin.users", action = PermissionAction.VIEW)
    public ApiResponse<List<Role>> listRoles() {
        return ApiResponse.ok(List.of(Role.values()));
    }

    // -------------------------------------------------------------------------
    // 신규 등록
    // -------------------------------------------------------------------------

    /**
     * 신규 직원 등록 (MASTER 전용) — 임시 비밀번호 자동 생성.
     *
     * <p>임시 비밀번호는 이 응답({@link AdminUserCreateResponse#temporaryPassword()})에서만
     * 1회 노출. 관리자가 직원에게 직접 전달. 첫 로그인 후 비밀번호 변경 강제.
     *
     * @param request      신규 직원 정보 (loginId / fullName / email / role / departmentId? / phoneNumber?)
     * @param callerHeader X-User-Id 헤더 (MASTER UUID)
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @RequireDepartment(Department.EXECUTIVE_OFFICE)
    @RequirePermission(page = "admin.users", action = PermissionAction.CREATE)
    public ApiResponse<AdminUserCreateResponse> create(
            @Valid @RequestBody AdminUserCreateRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(
                provisioningService.adminCreate(request, parseCaller(callerHeader)));
    }

    // -------------------------------------------------------------------------
    // 정보 수정
    // -------------------------------------------------------------------------

    /**
     * 직원 일반 정보 수정 (MASTER 전용) — fullName / email / phoneNumber / departmentId.
     *
     * <p>PATCH 시맨틱: null 필드는 변경 없음. 역할 변경은 {@code PATCH /{id}/role} 사용.
     *
     * @param id           대상 직원 UUID
     * @param request      수정 정보 (null 필드 = 변경 없음)
     * @param callerHeader X-User-Id 헤더
     */
    @PatchMapping("/{id}")
    @RequireDepartment(Department.EXECUTIVE_OFFICE)
    @RequirePermission(page = "admin.users", action = PermissionAction.UPDATE)
    public ApiResponse<EmployeeResponse> update(
            @PathVariable UUID id,
            @Valid @RequestBody AdminUserUpdateRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(
                provisioningService.adminUpdate(id, request, parseCaller(callerHeader)));
    }

    /**
     * 역할 변경 + 변경 이력 적재 (MASTER 전용).
     *
     * <p>동일 역할 재요청 시 이력 추가 없이 현재 상태 반환 (멱등).
     *
     * @param id           대상 직원 UUID
     * @param request      변경할 역할 + 사유
     * @param callerHeader X-User-Id 헤더
     */
    @PatchMapping("/{id}/role")
    @RequireDepartment(Department.EXECUTIVE_OFFICE)
    @RequirePermission(page = "admin.users", action = PermissionAction.UPDATE)
    public ApiResponse<EmployeeResponse> updateRole(
            @PathVariable UUID id,
            @Valid @RequestBody AdminUserRoleChangeRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        EmployeeResponse response = provisioningService.updateRole(
                id, request.newRole(), request.reason(), parseCaller(callerHeader));
        publishRoleChangeAudit(id, callerHeader, request);
        return ApiResponse.ok(response);
    }

    private void publishRoleChangeAudit(UUID employeeId, String callerHeader,
                                        AdminUserRoleChangeRequest request) {
        if (auditPublisher == null) return;
        try {
            auditPublisher.publishAfterCommit(AuditEventV2.mutation(
                    "user-service", "PATCH", "/api/v1/admin/users/{id}/role",
                    callerHeader, "EMPLOYEE_ROLE", employeeId.toString(), employeeId.toString(),
                    "Employee role changed", java.util.Map.of(
                            "newRole", request.newRole().name(), "reason", request.reason())));
        } catch (RuntimeException ex) {
            // Central audit is supplementary; a broker failure must not alter the committed role response.
        }
    }

    // -------------------------------------------------------------------------
    // 퇴사 / 잠금 해제
    // -------------------------------------------------------------------------

    /**
     * 퇴사 처리 (MASTER 전용) — Soft Delete.
     *
     * <p>employees 행 soft-delete + auth-service account disable. enable 으로 복구 불가.
     * (일시 비활성화는 기존 {@code PATCH /admin/users/{id}/disable} 경로 유지.)
     *
     * @param id           대상 직원 UUID
     * @param callerHeader X-User-Id 헤더
     */
    @PostMapping("/{id}/disable")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @RequireDepartment(Department.EXECUTIVE_OFFICE)
    @RequirePermission(page = "admin.users", action = PermissionAction.DELETE)
    public void disable(
            @PathVariable UUID id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        provisioningService.adminDisable(id, parseCaller(callerHeader));
    }

    /**
     * 잠금 해제 (MASTER 전용) — 로그인 5회 실패로 잠긴 계정 복구.
     *
     * <p>auth-service {@code lockedAt = null}, {@code failedLoginAttempts = 0} 으로 초기화.
     * 이미 잠금 해제 상태인 계정에 호출해도 멱등 처리.
     *
     * @param id           대상 직원 UUID
     * @param callerHeader X-User-Id 헤더
     */
    @PostMapping("/{id}/unlock")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @RequireDepartment(Department.EXECUTIVE_OFFICE)
    @RequirePermission(page = "admin.users", action = PermissionAction.UPDATE)
    public void unlock(
            @PathVariable UUID id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        provisioningService.adminUnlock(id, parseCaller(callerHeader));
    }

    // -------------------------------------------------------------------------
    // 이력
    // -------------------------------------------------------------------------

    /**
     * 역할 변경 이력 조회 — 매뉴얼 §4 변경 이력 탭.
     *
     * @param id 대상 직원 UUID
     */
    @GetMapping("/{id}/role-history")
    @RequireDepartment(Department.EXECUTIVE_OFFICE)
    @RequirePermission(page = "admin.users", action = PermissionAction.VIEW)
    public ApiResponse<List<RoleHistoryResponse>> roleHistory(@PathVariable UUID id) {
        List<RoleChangeHistory> rows =
                roleHistoryRepository.findAllByEmployeeIdOrderByCreatedAtDesc(id);
        return ApiResponse.ok(rows.stream().map(RoleHistoryResponse::from).toList());
    }

    // -------------------------------------------------------------------------
    // 서명(인감) - C1a
    // -------------------------------------------------------------------------

    /**
     * 사원 서명 등록/교체 (대표실 + admin.users UPDATE) - 업로드 또는 모바일 핸드오프 공통 저장.
     *
     * <p>서버 가드: PNG magic-byte + 50KB 이하(초과 422) + 클라 hash 재검증(불일치 400). 재등록 시
     * 기존 서명 교체. audit RECORD 1행 적재.
     *
     * @param id 대상 직원 UUID
     * @param request 서명 업로드 요청 (base64 + hash + channel)
     * @param callerHeader X-User-Id 헤더 (audit actor)
     * @return 등록 결과 (registered / signedAt / signatureChannel)
     */
    @PatchMapping("/{id}/signature")
    @RequireDepartment(Department.EXECUTIVE_OFFICE)
    @RequirePermission(page = "admin.users", action = PermissionAction.UPDATE)
    @org.springframework.transaction.annotation.Transactional
    public ApiResponse<EmployeeSignatureResponse> registerSignature(
            @PathVariable UUID id,
            @Valid @RequestBody EmployeeSignatureUploadRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        UUID caller = parseCaller(callerHeader);
        String callerUserId = caller == null ? null : caller.toString();
        EmployeeSignatureResponse response = signatureService.register(id, request, callerUserId);
        handoffService.revokeOpenTokens(id, callerUserId);
        return ApiResponse.ok(response);
    }

    /**
     * 사원 서명 무효화 (MASTER 한정 - admin.users DELETE seed 가 MASTER 만 허용).
     *
     * <p>등록된 서명 4필드 NULL + audit INVALIDATE 1행. 미등록 상태 무효화는 409.
     *
     * @param id 대상 직원 UUID
     * @param reason 무효화 사유 (필수)
     * @param callerHeader X-User-Id 헤더 (audit actor)
     */
    @DeleteMapping("/{id}/signature")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @RequireDepartment(Department.EXECUTIVE_OFFICE)
    @RequirePermission(page = "admin.users", action = PermissionAction.DELETE)
    @org.springframework.transaction.annotation.Transactional
    public void invalidateSignature(
            @PathVariable UUID id,
            @RequestParam(value = "reason") String reason,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        UUID caller = parseCaller(callerHeader);
        String callerUserId = caller == null ? "system" : caller.toString();
        signatureService.invalidate(id, reason, callerUserId);
        handoffService.revokeOpenTokens(id, callerUserId);
    }

    /**
     * 모바일 핸드오프 토큰 발급 — "모바일로 그리기" (slice C1b · spec §5.2).
     *
     * <p>동일 사원 미사용 토큰 무효화 후 신규 1회용 토큰 발급. desktop 이 QR + 복사링크 표시.
     */
    @PostMapping("/{id}/signature/handoff-token")
    @RequireDepartment(Department.EXECUTIVE_OFFICE)
    @RequirePermission(page = "admin.users", action = PermissionAction.UPDATE)
    public ApiResponse<com.samhanair.logis.user.web.dto.HandoffTokenResponse> issueHandoffToken(
            @PathVariable UUID id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        UUID caller = parseCaller(callerHeader);
        return ApiResponse.ok(handoffService.issueToken(id, caller == null ? null : caller.toString()));
    }

    /**
     * 핸드오프 토큰 상태 조회 — desktop 폴링 (2s, slice C1b · spec §5.2).
     */
    @GetMapping("/{id}/signature/handoff/{token}/status")
    @RequireDepartment(Department.EXECUTIVE_OFFICE)
    @RequirePermission(page = "admin.users", action = PermissionAction.VIEW)
    public ApiResponse<com.samhanair.logis.user.web.dto.HandoffStatusResponse> handoffStatus(
            @PathVariable UUID id,
            @PathVariable String token) {
        return ApiResponse.ok(handoffService.status(id, token));
    }

    // -------------------------------------------------------------------------
    // helper
    // -------------------------------------------------------------------------

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
