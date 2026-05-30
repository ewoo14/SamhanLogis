package com.samhanair.logis.accounting.web;

import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.accounting.service.SupplierProfileService;
import com.samhanair.logis.accounting.web.dto.CreateSupplierProfileRequest;
import com.samhanair.logis.accounting.web.dto.SupplierProfileResponse;
import com.samhanair.logis.accounting.web.dto.UpdateSupplierProfileRequest;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 사업자 프로필 CRUD Endpoint.
 *
 * <p>GAS 하드코딩 공급자 정보를 회계 카테고리 "사업자 양식" 메뉴에서 수정 가능하도록 전환한 API.
 * 기본값은 기존 GAS 하드코딩 값 (Flyway V14 seed) 이다.
 *
 * <p>권한 매트릭스:
 * <ul>
 *   <li>GET  (list/primary) — ACCOUNTANT / MANAGER / MASTER</li>
 *   <li>POST / PUT / DELETE — MANAGER / MASTER</li>
 *   <li>PATCH /{id}/primary — MANAGER / MASTER</li>
 * </ul>
 *
 * <p>UUID 비공개 원칙 — 사용자 노출 식별자는 {@code businessNumber} / {@code companyName}.
 * UUID 는 PUT/PATCH/DELETE 경로 파라미터로만 사용.
 *
 * <p>SP-D6-7 동적 권한: {@code accounting.supplier-profiles} 페이지 코드.
 */
@Slf4j
@RestController
@RequestMapping("/accounting/supplier-profiles")
@RequiredArgsConstructor
@Tag(name = "사업자 프로필", description = "홈택스 세금계산서 공급자 정보 관리 (사업자 양식)")
public class SupplierProfileController {

    /** SP-D6-7 — 공급자 프로필 페이지 코드. */
    private static final String PAGE_CODE = "accounting.supplier-profiles";
    private static final String ROLE_HEADER = "X-User-Role";

    private final SupplierProfileService service;
    private final DynamicPermissionClient dynamicPermissionClient;

    // =========================================================================
    // GET /api/v1/accounting/supplier-profiles
    // =========================================================================

    /**
     * 전체 사업자 프로필 목록 조회.
     *
     * <p>일반적으로 1개 row 이지만 다중 사업자 대비용 목록 API.
     *
     * @return 전체 사업자 프로필 목록
     */
    @GetMapping
    @RequirePermission(page = "accounting.supplier-profiles", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    @Operation(summary = "사업자 프로필 목록 조회", description = "활성 사업자 프로필 전체 목록 반환 (보통 1건)")
    public ApiResponse<List<SupplierProfileResponse>> list() {
        return ApiResponse.ok(service.listAll());
    }

    // =========================================================================
    // GET /api/v1/accounting/supplier-profiles/primary
    // =========================================================================

    /**
     * 기본 사업자(isPrimary=true) 단건 조회.
     *
     * <p>{@link com.samhanair.logis.accounting.service.TaxInvoiceBatchService} 홈택스 양식 변환 시
     * 사용하는 공급자 정보 단건 조회 endpoint.
     *
     * @return 기본 사업자 프로필
     */
    @GetMapping("/primary")
    @RequirePermission(page = "accounting.supplier-profiles", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    @Operation(summary = "기본 사업자 단건 조회", description = "isPrimary=true 사업자 단건 반환")
    public ApiResponse<SupplierProfileResponse> getPrimary() {
        return ApiResponse.ok(service.getPrimary());
    }

    // =========================================================================
    // POST /api/v1/accounting/supplier-profiles
    // =========================================================================

    /**
     * 신규 사업자 프로필 등록.
     *
     * <p>다중 사업자 대비용. {@code isPrimary=true} 요청 시 기존 primary 자동 해제.
     *
     * @param req 등록 요청 DTO
     * @return 등록된 사업자 프로필 (HTTP 201)
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = "accounting.supplier-profiles", action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    @Operation(summary = "사업자 프로필 신규 등록", description = "다중 사업자 대비용. isPrimary=true 시 기존 primary 해제")
    public ApiResponse<SupplierProfileResponse> create(
            @RequestBody @Valid CreateSupplierProfileRequest req,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        checkEditPermission(roleHeader);
        return ApiResponse.ok(service.create(req), "사업자 프로필이 등록되었습니다.");
    }

    // =========================================================================
    // PUT /api/v1/accounting/supplier-profiles/{id}
    // =========================================================================

    /**
     * 사업자 프로필 수정.
     *
     * <p>null 필드는 기존 값 유지 (부분 업데이트 패턴).
     *
     * @param id  수정 대상 UUID (경로 파라미터)
     * @param req 수정 요청 DTO
     * @return 수정된 사업자 프로필
     */
    @PutMapping("/{id}")
    @RequirePermission(page = "accounting.supplier-profiles", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    @Operation(summary = "사업자 프로필 수정", description = "null 필드는 기존 값 유지. isPrimary 변경은 PATCH /{id}/primary 사용")
    public ApiResponse<SupplierProfileResponse> update(
            @PathVariable UUID id,
            @RequestBody @Valid UpdateSupplierProfileRequest req,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        checkEditPermission(roleHeader);
        return ApiResponse.ok(service.update(id, req), "사업자 프로필이 수정되었습니다.");
    }

    // =========================================================================
    // PATCH /api/v1/accounting/supplier-profiles/{id}/primary
    // =========================================================================

    /**
     * 기본 사업자 전환.
     *
     * <p>지정 id 를 primary 로 설정하고 기존 primary 를 해제한다.
     *
     * @param id 기본으로 설정할 사업자 UUID
     * @return 갱신된 사업자 프로필
     */
    @PatchMapping("/{id}/primary")
    @RequirePermission(page = "accounting.supplier-profiles", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    @Operation(summary = "기본 사업자 전환", description = "기존 primary 해제 후 지정 사업자를 primary 로 설정")
    public ApiResponse<SupplierProfileResponse> setPrimary(@PathVariable UUID id) {
        return ApiResponse.ok(service.setPrimary(id), "기본 사업자가 변경되었습니다.");
    }

    // =========================================================================
    // DELETE /api/v1/accounting/supplier-profiles/{id}
    // =========================================================================

    /**
     * 사업자 프로필 Soft Delete.
     *
     * <p>primary 사업자는 삭제 불가 (HTTP 409 Conflict).
     *
     * @param id          삭제 대상 UUID
     * @param actorUserId 삭제 실행자 user-id (X-User-Id 헤더)
     */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @RequirePermission(page = "accounting.supplier-profiles", action = com.samhanair.logis.security.permission.PermissionAction.DELETE)
    @Operation(summary = "사업자 프로필 삭제 (Soft Delete)", description = "primary 사업자는 삭제 불가 (409 반환)")
    public void delete(
            @PathVariable UUID id,
            @RequestHeader("X-User-Id") String actorUserId,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        checkEditPermission(roleHeader);
        service.delete(id, actorUserId);
    }

    // =========================================================================
    // SP-D2 동적 권한 헬퍼
    // =========================================================================

    /**
     * SP-D6-7 동적 EDIT 권한 검증 — 공급자 프로필 페이지 코드.
     *
     * @param actorRole 요청자 role
     */
    private void checkEditPermission(String actorRole) {
        if (actorRole == null || actorRole.isBlank()) {
            return;
        }
        boolean canEdit = dynamicPermissionClient.canEdit(actorRole, PAGE_CODE);
        if (!canEdit) {
            boolean canView = dynamicPermissionClient.canView(actorRole, PAGE_CODE);
            if (canView) {
                log.warn("[SP-D2] 동적 권한 차단 (view-only override) — roleCode={} pageCode={}", actorRole, PAGE_CODE);
                throw new BusinessException(ErrorCode.FORBIDDEN,
                        "동적 권한 설정에 의해 사업자 프로필 편집 권한이 차단되었습니다.");
            }
            log.debug("[SP-D2] 동적 권한 override 없음 (fallback) — roleCode={} pageCode={}", actorRole, PAGE_CODE);
        }
    }
}
