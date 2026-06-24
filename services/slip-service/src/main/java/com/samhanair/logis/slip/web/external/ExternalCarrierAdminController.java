package com.samhanair.logis.slip.web.external;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.dto.external.CreateExternalCarrierRequest;
import com.samhanair.logis.slip.dto.external.ExternalCarrierResponse;
import com.samhanair.logis.slip.dto.external.UpdateExternalCarrierRequest;
import com.samhanair.logis.slip.service.external.ExternalCarrierService;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 외부기사/배송사 마스터 admin API. */
@RestController
@RequestMapping("/admin/external-carriers")
@RequiredArgsConstructor
public class ExternalCarrierAdminController {

    private static final String CALLER_HEADER = "X-User-Id";

    private final ExternalCarrierService service;

    /** 외부기사/배송사 목록/검색. UUID 는 내부 라우팅용이며 화면 식별자는 name/phone 이다. */
    @GetMapping
    @RequirePermission(page = DispatchPageCodes.EXTERNAL_CARRIERS, action = PermissionAction.VIEW)
    public ApiResponse<Page<ExternalCarrierResponse>> list(
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        Pageable pageable = PageRequest.of(page, size);
        return ApiResponse.ok(service.search(q, pageable));
    }

    /** 외부기사/배송사 단건 조회. */
    @GetMapping("/{id}")
    @RequirePermission(page = DispatchPageCodes.EXTERNAL_CARRIERS, action = PermissionAction.VIEW)
    public ApiResponse<ExternalCarrierResponse> getOne(@PathVariable UUID id) {
        return ApiResponse.ok(service.getOne(id));
    }

    /** 외부기사/배송사 신규 등록. */
    @PostMapping
    @RequirePermission(page = DispatchPageCodes.EXTERNAL_CARRIERS, action = PermissionAction.CREATE)
    public ApiResponse<ExternalCarrierResponse> create(
            @Valid @RequestBody CreateExternalCarrierRequest request
    ) {
        return ApiResponse.ok(service.create(request));
    }

    /** 외부기사/배송사 부분 수정. */
    @PatchMapping("/{id}")
    @RequirePermission(page = DispatchPageCodes.EXTERNAL_CARRIERS, action = PermissionAction.UPDATE)
    public ApiResponse<ExternalCarrierResponse> update(
            @PathVariable UUID id,
            @RequestBody UpdateExternalCarrierRequest request
    ) {
        return ApiResponse.ok(service.update(id, request));
    }

    /** 외부기사/배송사 soft-delete. */
    @DeleteMapping("/{id}")
    @RequirePermission(page = DispatchPageCodes.EXTERNAL_CARRIERS, action = PermissionAction.DELETE)
    public ApiResponse<Void> delete(
            @PathVariable UUID id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerId
    ) {
        service.delete(id, callerId);
        return ApiResponse.ok(null);
    }

    /** soft-deleted 외부기사/배송사를 복구한다. */
    @PostMapping("/{id}/restore")
    @RequirePermission(page = DispatchPageCodes.EXTERNAL_CARRIERS, action = PermissionAction.RESTORE)
    public ApiResponse<ExternalCarrierResponse> restore(@PathVariable UUID id) {
        return ApiResponse.ok(service.restore(id));
    }
}
