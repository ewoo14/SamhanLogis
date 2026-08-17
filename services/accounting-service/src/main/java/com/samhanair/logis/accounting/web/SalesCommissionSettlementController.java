package com.samhanair.logis.accounting.web;

import com.samhanair.logis.accounting.service.SalesCommissionSettlementService;
import com.samhanair.logis.accounting.web.dto.CreateSalesCommissionSettlementRequest;
import com.samhanair.logis.accounting.web.dto.CalculateSalesCommissionSettlementRequest;
import com.samhanair.logis.accounting.web.dto.SalesCommissionSettlementResponse;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** 영업수수료 정산서 S4a REST API. */
@RestController
@RequiredArgsConstructor
@RequestMapping("/accounting/sales-commission-settlements")
public class SalesCommissionSettlementController {

    /** 정산 화면 전용 동적 권한 pageCode. */
    public static final String PAGE_CODE = "accounting.sales-commission-settlement";

    private final SalesCommissionSettlementService service;

    /** 정산서 목록을 조회한다. */
    @Operation(summary = "영업수수료 정산서 목록")
    @GetMapping
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<Page<SalesCommissionSettlementResponse>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(page, Math.min(size, 100));
        return ApiResponse.ok(service.list(pageable).map(SalesCommissionSettlementResponse::from));
    }

    /** 정산서 상세를 조회한다. */
    @Operation(summary = "영업수수료 정산서 상세")
    @GetMapping("/{id}")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<SalesCommissionSettlementResponse> getOne(@PathVariable UUID id) {
        return ApiResponse.ok(SalesCommissionSettlementResponse.from(service.getOne(id)));
    }

    /** 번호 없는 DRAFT 정산서를 생성한다. */
    @Operation(summary = "영업수수료 정산서 생성")
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.CREATE)
    public ApiResponse<SalesCommissionSettlementResponse> create(
            @Valid @RequestBody CreateSalesCommissionSettlementRequest request) {
        return ApiResponse.ok(SalesCommissionSettlementResponse.from(
                service.createDraft(request.settlementDate())));
    }

    /** DRAFT 정산서를 확정하고 settlementDate 기준 문서번호를 채번한다. */
    @Operation(summary = "영업수수료 정산서 확정")
    @PostMapping("/{id}/confirm")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<SalesCommissionSettlementResponse> confirm(@PathVariable UUID id) {
        return ApiResponse.ok(SalesCommissionSettlementResponse.from(service.confirm(id)));
    }

    /** 레거시 R-18 계산식으로 입력을 계산하고 DRAFT snapshot에 저장한다. */
    @Operation(summary = "영업수수료 정산 계산 및 저장")
    @PostMapping("/{id}/calculate")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<SalesCommissionSettlementResponse> calculate(
            @PathVariable UUID id,
            @Valid @RequestBody CalculateSalesCommissionSettlementRequest request) {
        return ApiResponse.ok(SalesCommissionSettlementResponse.from(
                service.calculate(id, request.rateContractVersion(), request.toInput(), request.requestSequence())));
    }
}
