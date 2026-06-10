package com.samhanair.logis.accounting.web;

import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.accounting.service.SupplierProfileService;
import com.samhanair.logis.accounting.web.dto.CreateSupplierProfileRequest;
import com.samhanair.logis.accounting.web.dto.PrintProfileResponse;
import com.samhanair.logis.accounting.web.dto.SupplierProfileResponse;
import com.samhanair.logis.accounting.web.dto.UpdateLogoRequest;
import com.samhanair.logis.accounting.web.dto.UpdateStampRequest;
import com.samhanair.logis.accounting.web.dto.UpdateSupplierProfileRequest;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.http.HttpHeaderConstants;
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
    // GET /api/v1/accounting/supplier-profiles/print-profile
    // =========================================================================

    /**
     * 인쇄용 공개 공급자 정보 조회 — 권한 게이트 없음 (JWT 인증만).
     *
     * <p>P1-C 결정: 거래명세서·세금계산서 인쇄 시 공급자 블록에 출력되는 공개 정보.
     * 인쇄물은 거래처에 전달되므로 회계 role 이 아닌 SALES 등 일반 role 에서도 인쇄 가능해야 한다.
     * {@code @RequirePermission} 을 붙이면 비회계 role 의 인쇄에서 계좌·인감이 silent 소실되므로
     * 의도적으로 권한 게이트를 생략한다.
     *
     * <p>반환되는 모든 정보는 인쇄물에 공개되는 데이터이므로 seed widening 아님.
     *
     * <p>주의: Spring MVC 리터럴 경로 우선 매칭 규칙 — {@code /print-profile} 은 리터럴 경로이므로
     * {@code /{id}} UUID 패턴보다 우선 매칭된다 (안전).
     *
     * <p>신뢰 경계 (사이클2 Fix):
     * <ul>
     *   <li>사내 JWT ({@code X-Is-Partner} 헤더 없음 또는 {@code false}) — 전 role 통과 (P1-C 보존)</li>
     *   <li>외부 파트너 JWT ({@code X-Is-Partner: true}) — 403 거절.
     *       api-gateway 가 partner-auth JWT 의 {@code partnerCode} claim 존재 시 헤더를 주입한다.
     *       외부 거래처 계정은 공급자(삼한) 인쇄 정보에 접근할 수 없음.</li>
     * </ul>
     *
     * @param isPartner api-gateway 주입 파트너 식별 헤더 ({@code X-Is-Partner}, optional)
     * @return 인쇄용 공급자 정보 (exposed=true 계좌 + 인감/로고 포함)
     * @throws BusinessException(FORBIDDEN) 외부 거래처 계정 접근 시
     */
    @GetMapping("/print-profile")
    @Operation(summary = "인쇄용 공급자 정보 조회",
               description = "거래명세서·세금계산서 인쇄 전용. 권한 게이트 없음 — JWT 인증만. "
                       + "exposed=true 계좌 + 인감 + 로고 포함. X-Is-Partner:true 시 403 거절.")
    public ApiResponse<PrintProfileResponse> getPrintProfile(
            @RequestHeader(value = HttpHeaderConstants.IS_PARTNER_HEADER, required = false)
            String isPartner) {
        if ("true".equalsIgnoreCase(isPartner)) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "외부 거래처 계정은 공급자 인쇄 정보에 접근할 수 없습니다.");
        }
        return ApiResponse.ok(service.getPrintProfile());
    }

    // =========================================================================
    // GET /api/v1/accounting/supplier-profiles/{id}
    // =========================================================================

    /**
     * 사업자 프로필 단건 상세 조회 (은행계좌 + 인감 + 로고 포함).
     *
     * <p>P1-B 신설 — 사업자 프로필 편집 화면에서 stamp/logo 포함 전체 응답 조회.
     *
     * @param id 조회 UUID
     * @return 상세 응답 (bankAccounts + stampPngBase64 + logoPngBase64 포함)
     */
    @GetMapping("/{id}")
    @RequirePermission(page = "accounting.supplier-profiles", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    @Operation(summary = "사업자 프로필 단건 상세 조회",
               description = "stamp + logo + bankAccounts 포함 전체 상세 응답")
    public ApiResponse<SupplierProfileResponse> getById(@PathVariable UUID id) {
        return ApiResponse.ok(service.getById(id));
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
     * {@code bankAccounts} 가 null 이 아니면 replace-all 시맨틱으로 계좌 교체.
     *
     * @param id          수정 대상 UUID (경로 파라미터)
     * @param req         수정 요청 DTO
     * @param actorUserId 수정 실행자 user-id (X-User-Id 헤더)
     * @return 수정된 사업자 프로필 (bankAccounts + hasStamp 포함)
     */
    @PutMapping("/{id}")
    @RequirePermission(page = "accounting.supplier-profiles", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    @Operation(summary = "사업자 프로필 수정", description = "null 필드는 기존 값 유지. bankAccounts 가 있으면 replace-all. isPrimary 변경은 PATCH /{id}/primary 사용")
    public ApiResponse<SupplierProfileResponse> update(
            @PathVariable UUID id,
            @RequestBody @Valid UpdateSupplierProfileRequest req,
            @RequestHeader("X-User-Id") String actorUserId,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        checkEditPermission(roleHeader);
        return ApiResponse.ok(service.update(id, req, actorUserId), "사업자 프로필이 수정되었습니다.");
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
    // PUT /api/v1/accounting/supplier-profiles/{id}/stamp
    // =========================================================================

    /**
     * 인감 PNG 등록/교체.
     *
     * <p>처리:
     * <ol>
     *   <li>base64 디코드 → 200KB 가드 → SHA-256 재계산 검증</li>
     *   <li>검증 통과 후 저장</li>
     * </ol>
     *
     * @param id          대상 사업자 프로필 UUID
     * @param req         인감 등록 요청 (stampPngBase64 + stampHash)
     * @return 갱신된 사업자 프로필 응답 (hasStamp=true)
     */
    @PutMapping("/{id}/stamp")
    @RequirePermission(page = "accounting.supplier-profiles", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    @Operation(summary = "인감 PNG 등록/교체",
               description = "Base64 PNG 업로드. ≤200KB + SHA-256 hash 검증. mismatch → 400")
    public ApiResponse<SupplierProfileResponse> registerStamp(
            @PathVariable UUID id,
            @RequestBody @Valid UpdateStampRequest req,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        checkEditPermission(roleHeader);
        return ApiResponse.ok(service.registerStamp(id, req), "인감이 등록되었습니다.");
    }

    // =========================================================================
    // DELETE /api/v1/accounting/supplier-profiles/{id}/stamp
    // =========================================================================

    /**
     * 인감 삭제.
     *
     * @param id 대상 사업자 프로필 UUID
     */
    @DeleteMapping("/{id}/stamp")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @RequirePermission(page = "accounting.supplier-profiles", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    @Operation(summary = "인감 삭제", description = "stampPng / stampHash 를 null 로 초기화")
    public void clearStamp(
            @PathVariable UUID id,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        checkEditPermission(roleHeader);
        service.clearStamp(id);
    }

    // =========================================================================
    // PUT /api/v1/accounting/supplier-profiles/{id}/logo
    // =========================================================================

    /**
     * 로고 PNG 등록/교체.
     *
     * <p>인감 등록({@code PUT /{id}/stamp})과 동일 패턴.
     * 처리: base64 디코드 → 200KB 가드 → PNG magic → SHA-256 재계산 검증 → 저장.
     *
     * @param id          대상 사업자 프로필 UUID
     * @param req         로고 등록 요청 (logoPngBase64 + logoHash)
     * @return 갱신된 사업자 프로필 응답 (hasLogo=true)
     */
    @PutMapping("/{id}/logo")
    @RequirePermission(page = "accounting.supplier-profiles", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    @Operation(summary = "로고 PNG 등록/교체",
               description = "Base64 PNG 업로드. ≤200KB + SHA-256 hash 검증. mismatch → 400")
    public ApiResponse<SupplierProfileResponse> registerLogo(
            @PathVariable UUID id,
            @RequestBody @Valid UpdateLogoRequest req,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        checkEditPermission(roleHeader);
        return ApiResponse.ok(service.registerLogo(id, req), "로고가 등록되었습니다.");
    }

    // =========================================================================
    // DELETE /api/v1/accounting/supplier-profiles/{id}/logo
    // =========================================================================

    /**
     * 로고 삭제.
     *
     * @param id 대상 사업자 프로필 UUID
     */
    @DeleteMapping("/{id}/logo")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @RequirePermission(page = "accounting.supplier-profiles", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    @Operation(summary = "로고 삭제", description = "logoPng / logoHash 를 null 로 초기화")
    public void clearLogo(
            @PathVariable UUID id,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        checkEditPermission(roleHeader);
        service.clearLogo(id);
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
