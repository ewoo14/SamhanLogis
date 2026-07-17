package com.samhanair.logis.accounting.web;

import com.samhanair.logis.accounting.service.DepositorMappingService;
import com.samhanair.logis.accounting.web.dto.BankDepositorPartnerMappingHistoryResponse;
import com.samhanair.logis.accounting.web.dto.BankDepositorPartnerMappingRequest;
import com.samhanair.logis.accounting.web.dto.BankDepositorPartnerMappingResponse;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** 입금자명↔거래처 매핑 관리 endpoint. UUID 대신 정규화 business key를 사용한다. */
@RestController
@RequestMapping("/accounting/deposit-mappings")
@RequiredArgsConstructor
@Tag(name = "입금자명 매핑", description = "입금자명과 거래처의 자동 적용 매핑 관리")
public class BankDepositorPartnerMappingController {

    private final DepositorMappingService service;

    /** 활성 매핑 목록을 조회한다. */
    @GetMapping
    @RequirePermission(page = DepositorMappingService.PAGE_CODE, action = PermissionAction.VIEW)
    @Operation(summary = "입금자명 매핑 목록", description = "UUID 없이 raw/normalized 입금자명과 거래처 business key 반환")
    public ApiResponse<List<BankDepositorPartnerMappingResponse>> list() {
        return ApiResponse.ok(service.list());
    }

    /** 정규화 business key 하나의 변경 이력을 조회한다. */
    @GetMapping("/history")
    @RequirePermission(page = DepositorMappingService.PAGE_CODE, action = PermissionAction.VIEW)
    @Operation(summary = "입금자명 매핑 이력", description = "정규화 입금자명 기준 append-only 감사 이력")
    public ApiResponse<List<BankDepositorPartnerMappingHistoryResponse>> history(
            @RequestParam String normalizedName) {
        return ApiResponse.ok(service.history(normalizedName));
    }

    /** 매핑을 생성한다. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = DepositorMappingService.PAGE_CODE, action = PermissionAction.CREATE)
    @Operation(summary = "입금자명 매핑 생성", description = "partnerCode를 검증한 뒤 내부 partnerId로 저장")
    public ApiResponse<BankDepositorPartnerMappingResponse> create(
            @Valid @RequestBody BankDepositorPartnerMappingRequest request,
            @RequestHeader(value = "X-User-Id", required = false) String userId) {
        UUID actorId = parseActorId(userId);
        return ApiResponse.ok(service.create(request, actorId, actorName(actorId)), "입금자명 매핑이 등록되었습니다.");
    }

    /** 기존 정규화 key를 새 rawName/partnerCode로 수정한다. */
    @PutMapping("/{normalizedName}")
    @RequirePermission(page = DepositorMappingService.PAGE_CODE, action = PermissionAction.UPDATE)
    @Operation(summary = "입금자명 매핑 수정", description = "key rename 충돌은 409로 거부")
    public ApiResponse<BankDepositorPartnerMappingResponse> update(
            @PathVariable String normalizedName,
            @Valid @RequestBody BankDepositorPartnerMappingRequest request,
            @RequestHeader(value = "X-User-Id", required = false) String userId) {
        UUID actorId = parseActorId(userId);
        return ApiResponse.ok(service.update(normalizedName, request, actorId, actorName(actorId)),
                "입금자명 매핑이 수정되었습니다.");
    }

    /** 기존 정규화 key 매핑을 soft delete한다. */
    @DeleteMapping("/{normalizedName}")
    @RequirePermission(page = DepositorMappingService.PAGE_CODE, action = PermissionAction.DELETE)
    @Operation(summary = "입금자명 매핑 삭제", description = "hard delete 없이 markDeleted(actor) 수행")
    public ApiResponse<Void> delete(
            @PathVariable String normalizedName,
            @RequestParam(required = false) String reason,
            @RequestHeader(value = "X-User-Id", required = false) String userId) {
        UUID actorId = parseActorId(userId);
        service.delete(normalizedName, actorId, actorName(actorId), reason);
        return ApiResponse.ok(null, "입금자명 매핑이 삭제되었습니다.");
    }

    private static UUID parseActorId(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "유효한 사용자 식별자가 필요합니다.", ex);
        }
    }

    private static String actorName(UUID actorId) {
        return actorId == null ? "SYSTEM" : "사용자";
    }
}
