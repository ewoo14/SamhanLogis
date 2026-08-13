package com.samhanair.logis.partner.tab.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.partner.tab.dto.PartnerContactRequest;
import com.samhanair.logis.partner.tab.dto.PartnerContactResponse;
import com.samhanair.logis.partner.tab.dto.PartnerFullRequest;
import com.samhanair.logis.partner.tab.dto.PartnerFullResponse;
import com.samhanair.logis.partner.tab.dto.PartnerPriceDiscountRequest;
import com.samhanair.logis.partner.tab.dto.PartnerPriceDiscountResponse;
import com.samhanair.logis.partner.tab.dto.PartnerShippingAddressRequest;
import com.samhanair.logis.partner.tab.dto.PartnerShippingAddressResponse;
import com.samhanair.logis.partner.tab.service.Partner4TabService;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.security.permission.PermissionAction;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.security.Principal;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 거래처 4탭 UI Backend endpoint.
 *
 * <p>P0-6 거래처 등록/조회 4탭 (기본정보 / 단가-할인정책 / 배송지 / 담당자) 을 지원하는 REST endpoint.
 * 인증 = X-User-* 헤더 (gateway 경유) + {@code @PreAuthorize} 권한 가드.
 *
 * <p>전략:
 * <ul>
 *   <li>full endpoint ({@code GET/POST/PATCH /{partnerCode}/full}) — 단일 round-trip, FE 초기 로드용</li>
 *   <li>탭별 개별 endpoint — 탭 전환 시 lazy 조회 또는 단건 추가/삭제 UX 지원</li>
 * </ul>
 *
 * <p>UUID 비공개 가드 (memory feedback_uuid_no_user_visibility) — path variable 은 partnerCode 사용.
 * 배송지/담당자 삭제 시에만 서브엔티티 UUID 를 path variable 로 노출 (FE 응답에서 수신한 id).
 */
@RestController
@RequestMapping("/api/v1/partners")
@RequiredArgsConstructor
public class Partner4TabController {

    private final Partner4TabService partner4TabService;

    // ================================================================
    // 4탭 일괄 full endpoint
    // ================================================================

    /**
     * 거래처 4탭 전체 데이터 일괄 조회.
     *
     * <p>단일 round-trip 으로 기본정보 + 단가/할인 정책 + 배송지 목록 + 담당자 목록을 반환.
     *
     * @param partnerCode 거래처 코드
     * @return 4탭 전체 응답
     */
    @Operation(summary = "거래처 4탭 일괄 조회", description = "SALES / MANAGER / MASTER 권한 필요. 단일 round-trip.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "권한 없음"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "거래처 미존재")
    })
    @GetMapping("/{partnerCode}/full")
    @RequirePermission(page = "partners.4tab", action = PermissionAction.VIEW)
    public ApiResponse<PartnerFullResponse> getFull(@PathVariable String partnerCode) {
        return ApiResponse.ok(partner4TabService.getFull(partnerCode));
    }

    /**
     * 거래처 4탭 일괄 등록.
     *
     * <p>Partner 신규 등록 + 단가/할인 정책 + 배송지 + 담당자를 동일 TX 에서 저장.
     * partnerCode / bizNo 는 body 에 포함 (신규 등록이므로 path 미사용).
     *
     * @param req 4탭 일괄 등록 요청
     * @return 등록된 4탭 응답
     */
    @Operation(summary = "거래처 4탭 일괄 등록", description = "SALES / MANAGER / MASTER 권한 필요. partnerCode / bizNo / name 필수.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "등록 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "필수값 누락"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "권한 없음"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "partnerCode 또는 bizNo 중복")
    })
    @PostMapping("/full")
    @RequirePermission(page = "partners.4tab", action = PermissionAction.CREATE)
    public ResponseEntity<ApiResponse<PartnerFullResponse>> registerFull(
            @Valid @RequestBody PartnerFullRequest req,
            @RequestHeader(value = "X-User-Name", required = false) String userName,
            Principal principal) {
        // 거래처 버전이력 actorName null 결함 수정 — 4탭 일괄 등록 시 revision actor(표시명) 전달.
        // [UUID 비공개 가드] header 인증 환경에서 Principal.getName() 은 X-User-Id(계정 UUID)가
        // 들어온다. UUID 를 actorName 으로 노출하면 버전이력 화면에 raw UUID 가 새어나가므로
        // ([[uuid-no-user-visibility]]), 표시명은 X-User-Name 헤더(updateFull 경로와 일관)를 우선 사용하고,
        // 없으면 Principal 식별자가 UUID 가 아닐 때만 사용한다(UUID 면 null → service 가 system 폴백).
        String actorName = (userName != null && !userName.isBlank())
                ? userName
                : displayNameOrNull(principal != null ? principal.getName() : null);
        PartnerFullResponse resp = partner4TabService.registerFull(req, actorName);
        return ResponseEntity.status(201).body(ApiResponse.ok(resp));
    }

    /**
     * 거래처 4탭 일괄 수정.
     *
     * <p>기존 배송지 / 담당자 soft-delete 후 요청 목록으로 재등록.
     * 단가/할인 정책은 UPSERT. 기본정보는 name 이 입력된 경우만 반영.
     *
     * @param partnerCode 거래처 코드 (path variable)
     * @param req         4탭 수정 요청
     * @return 수정된 4탭 응답
     */
    @Operation(summary = "거래처 4탭 일괄 수정", description = "MANAGER / MASTER 권한 필요.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "수정 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "권한 없음"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "거래처 미존재")
    })
    @PatchMapping("/{partnerCode}/full")
    @RequirePermission(page = "partners.4tab.edit", action = PermissionAction.UPDATE)
    public ApiResponse<PartnerFullResponse> updateFull(@PathVariable String partnerCode,
                                                        @Valid @RequestBody PartnerFullRequest req,
                                                        @RequestHeader(value = "X-User-Name", required = false) String userName,
                                                        Principal principal) {
        // 권한 재편 Phase 2.3 — 4탭 일괄 수정 시 revision actor(표시명) 전달.
        // [UUID 비공개 가드] header 인증 환경에서 Principal.getName() 은 X-User-Id(계정 UUID)가
        // 들어온다. UUID 를 actorName 으로 노출하면 버전이력 화면에 raw UUID 가 새어나가므로
        // ([[uuid-no-user-visibility]]), 표시명은 X-User-Name 헤더(RESTORE 경로와 일관)를 우선 사용하고,
        // 없으면 Principal 식별자가 UUID 가 아닐 때만 사용한다(UUID 면 null → service 가 system 폴백).
        String actorName = (userName != null && !userName.isBlank())
                ? userName
                : displayNameOrNull(principal != null ? principal.getName() : null);
        return ApiResponse.ok(partner4TabService.updateFull(partnerCode, req, null, actorName));
    }

    /**
     * Principal 식별자를 사용자 표시명으로 안전 변환 — UUID 형태면 {@code null}.
     *
     * <p>UUID 비공개 원칙상 계정 UUID 가 actorName 으로 노출되지 않도록 차단한다. 실제 표시명이
     * 전파되는 경우(비-UUID 문자열)에만 그대로 사용한다.
     */
    static String displayNameOrNull(String principalName) {
        if (ActorDisplayName.isUuid(principalName)) {
            return null;
        }
        if (principalName == null || principalName.isBlank()) {
            return null;
        }
        try {
            java.util.UUID.fromString(principalName.trim());
            return null; // UUID → 비공개
        } catch (IllegalArgumentException notUuid) {
            return principalName;
        }
    }

    // ================================================================
    // 단가/할인 정책 탭 (탭 2)
    // ================================================================

    /**
     * 거래처 단가/할인 정책 조회 (탭 2).
     *
     * @param partnerCode 거래처 코드
     * @return 단가/할인 정책 응답 (미등록 시 basicDiscountRate=0 empty 응답)
     */
    @Operation(summary = "거래처 단가/할인 정책 조회", description = "SALES / MANAGER / MASTER 권한 필요.")
    @GetMapping("/{partnerCode}/price-discount")
    @RequirePermission(page = "partners.4tab", action = PermissionAction.VIEW)
    public ApiResponse<PartnerPriceDiscountResponse> getPriceDiscount(
            @PathVariable String partnerCode) {
        return ApiResponse.ok(partner4TabService.getPriceDiscount(partnerCode));
    }

    /**
     * 거래처 단가/할인 정책 UPSERT (탭 2).
     *
     * <p>기존 정책 존재 시 update, 미존재 시 create.
     *
     * @param partnerCode 거래처 코드
     * @param req         단가/할인 정책 요청
     * @return 갱신된 단가/할인 정책 응답
     */
    @Operation(summary = "거래처 단가/할인 정책 UPSERT", description = "MANAGER / MASTER 권한 필요.")
    @PutMapping("/{partnerCode}/price-discount")
    @RequirePermission(page = "partners.4tab.edit", action = PermissionAction.UPDATE)
    public ApiResponse<PartnerPriceDiscountResponse> upsertPriceDiscount(
            @PathVariable String partnerCode,
            @Valid @RequestBody PartnerPriceDiscountRequest req) {
        return ApiResponse.ok(partner4TabService.upsertPriceDiscountTab(partnerCode, req));
    }

    // ================================================================
    // 배송지 탭 (탭 3)
    // ================================================================

    /**
     * 거래처 배송지 목록 조회 (탭 3).
     *
     * @param partnerCode 거래처 코드
     * @return 배송지 목록
     */
    @Operation(summary = "거래처 배송지 목록 조회", description = "SALES / MANAGER / MASTER 권한 필요.")
    @GetMapping("/{partnerCode}/shipping-addresses")
    @RequirePermission(page = "partners.4tab", action = PermissionAction.VIEW)
    public ApiResponse<List<PartnerShippingAddressResponse>> getShippingAddresses(
            @PathVariable String partnerCode) {
        return ApiResponse.ok(partner4TabService.getShippingAddresses(partnerCode));
    }

    /**
     * 거래처 배송지 단건 추가 (탭 3).
     *
     * <p>isDefault = true 시 기존 기본 배송지를 자동 해제.
     *
     * @param partnerCode 거래처 코드
     * @param req         배송지 등록 요청
     * @return 등록된 배송지 응답
     */
    @Operation(summary = "거래처 배송지 추가", description = "MANAGER / MASTER 권한 필요. isDefault=true 시 기존 기본 배송지 자동 해제.")
    @PostMapping("/{partnerCode}/shipping-addresses")
    @RequirePermission(page = "partners.4tab.edit", action = PermissionAction.CREATE)
    public ResponseEntity<ApiResponse<PartnerShippingAddressResponse>> addShippingAddress(
            @PathVariable String partnerCode,
            @Valid @RequestBody PartnerShippingAddressRequest req) {
        PartnerShippingAddressResponse resp = partner4TabService.addShippingAddress(partnerCode, req);
        return ResponseEntity.status(201).body(ApiResponse.ok(resp));
    }

    /**
     * 거래처 배송지 soft-delete (탭 3).
     *
     * @param partnerCode 거래처 코드
     * @param addrId      삭제할 배송지 UUID
     * @param principal   인증 principal (actor 추출용)
     * @return 204 No Content
     */
    @Operation(summary = "거래처 배송지 삭제 (soft-delete)", description = "MANAGER / MASTER 권한 필요.")
    @DeleteMapping("/{partnerCode}/shipping-addresses/{addrId}")
    @RequirePermission(page = "partners.4tab.edit", action = PermissionAction.DELETE)
    public ResponseEntity<Void> deleteShippingAddress(@PathVariable String partnerCode,
                                                       @PathVariable UUID addrId,
                                                       Principal principal) {
        String actor = principal != null ? principal.getName() : "system";
        partner4TabService.deleteShippingAddress(partnerCode, addrId, actor);
        return ResponseEntity.noContent().build();
    }

    // ================================================================
    // 담당자 탭 (탭 4)
    // ================================================================

    /**
     * 거래처 담당자 목록 조회 (탭 4).
     *
     * @param partnerCode 거래처 코드
     * @return 담당자 목록
     */
    @Operation(summary = "거래처 담당자 목록 조회", description = "SALES / MANAGER / MASTER 권한 필요.")
    @GetMapping("/{partnerCode}/contacts")
    @RequirePermission(page = "partners.4tab", action = PermissionAction.VIEW)
    public ApiResponse<List<PartnerContactResponse>> getContacts(@PathVariable String partnerCode) {
        return ApiResponse.ok(partner4TabService.getContacts(partnerCode));
    }

    /**
     * 거래처 담당자 단건 추가 (탭 4).
     *
     * <p>isPrimary = true 시 기존 주 담당자를 자동 해제.
     *
     * @param partnerCode 거래처 코드
     * @param req         담당자 등록 요청
     * @return 등록된 담당자 응답
     */
    @Operation(summary = "거래처 담당자 추가", description = "MANAGER / MASTER 권한 필요. isPrimary=true 시 기존 주 담당자 자동 해제.")
    @PostMapping("/{partnerCode}/contacts")
    @RequirePermission(page = "partners.4tab.edit", action = PermissionAction.CREATE)
    public ResponseEntity<ApiResponse<PartnerContactResponse>> addContact(
            @PathVariable String partnerCode,
            @Valid @RequestBody PartnerContactRequest req) {
        PartnerContactResponse resp = partner4TabService.addContact(partnerCode, req);
        return ResponseEntity.status(201).body(ApiResponse.ok(resp));
    }

    /**
     * 거래처 담당자 soft-delete (탭 4).
     *
     * @param partnerCode 거래처 코드
     * @param contactId   삭제할 담당자 UUID
     * @param principal   인증 principal (actor 추출용)
     * @return 204 No Content
     */
    @Operation(summary = "거래처 담당자 삭제 (soft-delete)", description = "MANAGER / MASTER 권한 필요.")
    @DeleteMapping("/{partnerCode}/contacts/{contactId}")
    @RequirePermission(page = "partners.4tab.edit", action = PermissionAction.DELETE)
    public ResponseEntity<Void> deleteContact(@PathVariable String partnerCode,
                                               @PathVariable UUID contactId,
                                               Principal principal) {
        String actor = principal != null ? principal.getName() : "system";
        partner4TabService.deleteContact(partnerCode, contactId, actor);
        return ResponseEntity.noContent().build();
    }
}
