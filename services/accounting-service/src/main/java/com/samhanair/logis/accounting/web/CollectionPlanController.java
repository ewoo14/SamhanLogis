package com.samhanair.logis.accounting.web;

import com.samhanair.logis.accounting.domain.PlanStatus;
import com.samhanair.logis.accounting.service.CollectionPlanService;
import com.samhanair.logis.accounting.web.dto.CollectionPlanForecastResponse;
import com.samhanair.logis.accounting.web.dto.CollectionPlanResponse;
import com.samhanair.logis.accounting.web.dto.CollectionPlanSuggestionResponse;
import com.samhanair.logis.accounting.web.dto.CreateCollectionPlanRequest;
import com.samhanair.logis.accounting.web.dto.UpdateCollectionPlanStatusRequest;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 수금계획 CRUD/제안/예측 endpoint.
 *
 * <p>PageCode 는 받을어음/수금계획 공용 채권관리 코드인 {@code accounting.receivables} 를 사용한다.
 */
@RestController
@RequestMapping("/accounting/collection-plans")
@RequiredArgsConstructor
@Tag(name = "수금계획", description = "회계 보고 스위트 G-2 수금계획 등록/목록/상태전이/자동제안/예측")
public class CollectionPlanController {

    private static final String PAGE_CODE = "accounting.receivables";

    private final CollectionPlanService service;

    /** 수금계획 등록. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.CREATE)
    @Operation(summary = "수금계획 등록", description = "partnerCode/bizNo/partnerName 중 하나로 거래처를 resolve 하여 등록")
    public ApiResponse<CollectionPlanResponse> register(
            @RequestBody @Valid CreateCollectionPlanRequest request) {
        return ApiResponse.ok(service.register(request), "수금계획이 등록되었습니다.");
    }

    /** 수금계획 목록. 기본 정렬은 예정 수금일 오름차순. */
    @GetMapping
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    @Operation(summary = "수금계획 목록", description = "예정일순 목록. status / partnerCode / bizNo / partnerName 필터")
    public ApiResponse<List<CollectionPlanResponse>> list(
            @RequestParam(required = false) PlanStatus status,
            @RequestParam(required = false) String partnerCode,
            @RequestParam(required = false) String bizNo,
            @RequestParam(required = false) String partnerName) {
        return ApiResponse.ok(service.list(status, partnerCode, bizNo, partnerName));
    }

    /** 수금계획 자동 제안. */
    @GetMapping("/suggestions")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    @Operation(summary = "수금계획 자동 제안", description = "미수 잔액과 받을어음 만기 기반 후보 생성")
    public ApiResponse<List<CollectionPlanSuggestionResponse>> suggestions(
            @RequestParam String partnerCode) {
        return ApiResponse.ok(service.suggestions(partnerCode));
    }

    /** 월별 수금 예상 집계. */
    @GetMapping("/forecast")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    @Operation(summary = "월별 수금 예상", description = "PLANNED/OVERDUE 수금계획을 예정일 월버킷으로 집계")
    public ApiResponse<CollectionPlanForecastResponse> forecast(
            @RequestParam LocalDate from,
            @RequestParam LocalDate to) {
        return ApiResponse.ok(service.forecast(from, to));
    }

    /** 수금계획 상태 전이. */
    @PatchMapping("/{planNo}/status")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    @Operation(summary = "수금계획 상태 전이", description = "COLLECTED/OVERDUE 로 전이")
    public ApiResponse<CollectionPlanResponse> updateStatus(
            @PathVariable String planNo,
            @RequestBody @Valid UpdateCollectionPlanStatusRequest request) {
        return ApiResponse.ok(service.transition(planNo, request.status()), "수금계획 상태가 변경되었습니다.");
    }

    /** 슬래시 표준 번호({@code yyyy/MM/dd-N}) 상태 전이. */
    @PatchMapping("/{year}/{month}/{daySeq}/status")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    @Operation(summary = "수금계획 상태 전이", description = "yyyy/MM/dd-N 표준 번호 path 지원")
    public ApiResponse<CollectionPlanResponse> updateStatusBySlashPlanNo(
            @PathVariable String year,
            @PathVariable String month,
            @PathVariable String daySeq,
            @RequestBody @Valid UpdateCollectionPlanStatusRequest request) {
        String planNo = year + "/" + month + "/" + daySeq;
        return ApiResponse.ok(service.transition(planNo, request.status()), "수금계획 상태가 변경되었습니다.");
    }
}
