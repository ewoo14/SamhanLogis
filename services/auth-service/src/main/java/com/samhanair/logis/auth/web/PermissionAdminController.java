package com.samhanair.logis.auth.web;

import com.samhanair.logis.auth.service.DynamicPermissionService;
import com.samhanair.logis.auth.service.dto.PermissionDto;
import com.samhanair.logis.auth.web.dto.PermissionBatchUpdateRequest;
import com.samhanair.logis.auth.web.dto.PermissionUpdateRequest;
import com.samhanair.logis.common.dto.ApiResponse;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

// SP-D1 cycle 2: getMyPermissions endpoint 에서 X-User-Role 헤더를 사용한다.

/**
 * 동적 RBAC 권한 관리 API — SP-D1.
 *
 * <p>MASTER 전용 endpoint. 역할별 페이지 권한을 체크박스 형태로 override 가능.
 *
 * <p>권한 전략:
 * <ul>
 *   <li>이 endpoint 자체는 항상 {@code @PreAuthorize("hasRole('MASTER')")} 정적 가드.</li>
 *   <li>MASTER 권한 자체는 동적 override 불가 — 시스템 안전 장치.</li>
 *   <li>마스터가 설정한 override row 가 존재하면 다른 서비스에서 DB 권한 우선 적용.</li>
 * </ul>
 *
 * <p>UUID 비공개 정책: 응답에 UUID 필드는 포함하지 않는다.
 * roleCode + pageCode 비즈니스 식별자만 사용.
 *
 * <p>참고: auth-service 는 springdoc-openapi 의존성이 없으므로
 * Swagger {@code @Operation} / {@code @ApiResponses} 어노테이션은 사용하지 않는다.
 */
@RestController
@RequestMapping("/auth/admin/permissions")
@RequiredArgsConstructor
public class PermissionAdminController {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_ROLE_HEADER = "X-User-Role";

    private final DynamicPermissionService permissionService;

    /**
     * 전체 권한 매트릭스 조회 — 역할 × 페이지 (MASTER 전용).
     *
     * <p>구조: {@code Map<roleCode, Map<pageCode, PermissionDto>>}
     * DB override row 가 없는 조합은 {@code isOverride = false} 로 표시.
     *
     * @return 전체 매트릭스 ApiResponse
     */
    @GetMapping
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<Map<String, Map<String, PermissionDto>>> getMatrix() {
        return ApiResponse.ok(permissionService.getPermissionMatrix());
    }

    /**
     * 단일 권한 갱신 (MASTER 전용).
     *
     * <p>roleCode + pageCode 조합이 이미 있으면 update, 없으면 신규 insert.
     * canEdit=true 이면 canView 도 자동 true (도메인 메서드 {@code updatePermissions} 적용).
     *
     * @param request  갱신 요청 (roleCode / pageCode / canView / canEdit)
     * @param actorId  요청자 X-User-Id 헤더
     * @return 갱신된 PermissionDto
     */
    @PutMapping
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<PermissionDto> updatePermission(
            @Valid @RequestBody PermissionUpdateRequest request,
            @RequestHeader(value = USER_ID_HEADER, required = false) String actorId) {
        return ApiResponse.ok(
                permissionService.updatePermission(request, callerOrSystem(actorId)));
    }

    /**
     * 다건 권한 일괄 갱신 — 체크박스 다중 토글 (MASTER 전용).
     *
     * <p>최대 100건. 하나라도 실패 시 전체 롤백.
     *
     * @param request  일괄 갱신 요청 (1~100건)
     * @param actorId  요청자 X-User-Id 헤더
     * @return 갱신된 PermissionDto 목록
     */
    @PostMapping("/batch")
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<List<PermissionDto>> batchUpdate(
            @Valid @RequestBody PermissionBatchUpdateRequest request,
            @RequestHeader(value = USER_ID_HEADER, required = false) String actorId) {
        return ApiResponse.ok(
                permissionService.updatePermissionsBatch(request, callerOrSystem(actorId)));
    }

    /**
     * 단일 권한 override 삭제 (soft-delete, MASTER 전용).
     *
     * <p>삭제 후 해당 (roleCode, pageCode) 조합은 fallback 정책으로 복귀.
     * 주의: 완전히 DB에서 제거하지 않고 soft-delete 처리.
     *
     * @param roleCode 역할 코드
     * @param pageCode 페이지 코드
     * @param actorId  요청자 X-User-Id 헤더
     */
    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasRole('MASTER')")
    public void deletePermission(
            @RequestParam String roleCode,
            @RequestParam String pageCode,
            @RequestHeader(value = USER_ID_HEADER, required = false) String actorId) {
        permissionService.deletePermission(roleCode, pageCode, callerOrSystem(actorId));
    }

    /**
     * 현재 사용자 역할의 활성 권한 목록 조회 — 인증된 모든 사용자 접근 가능.
     *
     * <p>FE {@code GET /admin/permissions/my} 호출 대응 endpoint.
     * X-User-Role 헤더로 역할을 수신하여 해당 역할의 활성 override row 를 반환한다.
     *
     * <p>MASTER 역할의 경우 DB row 유무에 관계없이 모든 PageCode 에 대해 view+edit true 반환.
     * 비MASTER 역할은 DB override row 가 존재하는 항목만 반환 (row 없음 = fallback false — 점진 마이그레이션 안전).
     *
     * @param userRole 요청자 역할 (X-User-Role 헤더, api-gateway 에서 전파)
     * @return 활성 권한 목록 {@code List<PermissionDto>}
     */
    @GetMapping("/my")
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<List<PermissionDto>> getMyPermissions(
            @RequestHeader(value = USER_ROLE_HEADER, required = false) String userRole) {
        String roleCode = (userRole == null || userRole.isBlank()) ? "UNKNOWN" : userRole;
        return ApiResponse.ok(permissionService.getMyPermissions(roleCode));
    }

    /**
     * 단일 권한 조회 — 타 서비스(POC: accounting-service) 가 권한 체크 시 호출.
     *
     * <p>roleCode + pageCode + type(VIEW|EDIT) 파라미터로 해당 권한 여부를 반환.
     * 인증된 사용자(타 서비스 헤더 기반)이면 모두 호출 가능.
     * MASTER 전용 endpoint 가 아니므로 {@code @PreAuthorize} 는 authenticated 만 적용.
     *
     * @param roleCode 역할 코드
     * @param pageCode 페이지 코드
     * @param type     권한 유형 (VIEW 또는 EDIT, 기본값 EDIT)
     * @return 권한 허용 여부 {@code {"allowed": true/false}}
     */
    @GetMapping("/check")
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<PermissionCheckResponse> checkPermission(
            @RequestParam String roleCode,
            @RequestParam String pageCode,
            @RequestParam(defaultValue = "EDIT") String type) {
        boolean allowed = permissionService.canAccess(roleCode, pageCode, type);
        return ApiResponse.ok(new PermissionCheckResponse(allowed));
    }

    /**
     * 단일 권한 조회 응답 DTO.
     *
     * @param allowed 권한 부여 여부
     */
    public record PermissionCheckResponse(boolean allowed) {
    }

    private String callerOrSystem(String header) {
        return (header == null || header.isBlank()) ? "system" : header;
    }
}
