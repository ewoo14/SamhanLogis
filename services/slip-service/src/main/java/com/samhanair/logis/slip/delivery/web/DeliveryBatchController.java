package com.samhanair.logis.slip.delivery.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.delivery.service.DeliveryBatchService;
import com.samhanair.logis.slip.delivery.web.dto.AddSlipToBatchRequest;
import com.samhanair.logis.slip.delivery.web.dto.DeliveryBatchResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * DeliveryBatch admin endpoints — Plan §4.1 (관리자 화면 "링크발송" 메뉴 source).
 *
 * <p>권한 매트릭스 (Plan §8): 모든 admin 작업은 {@code MANAGER / MASTER} 만.
 * 공개 모바일 endpoint 는 {@link PublicSlipController} 별도.
 */
@RestController
@RequestMapping("/delivery-batches")
@RequiredArgsConstructor
public class DeliveryBatchController {

    private final DeliveryBatchService batchService;

    /** 자동 그룹화 — 해당 날짜의 driverPhone 별 슬립을 신규/기존 batch 에 자동 연결. */
    @Operation(summary = "배송 배치 자동 그룹화",
            description = "해당 날짜의 driverPhone 별 슬립을 자동 그룹. 기존 (phone,date) 활성 배치 재사용")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "그룹화 성공")
    })
    @PostMapping("/auto-group")
    @RequirePermission(page = "slip.delivery-batch", action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    public ApiResponse<List<DeliveryBatchResponse>> autoGroup(
            @RequestParam("date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ApiResponse.ok(batchService.autoGroupByDate(date));
    }

    /** 배치 목록 조회 (링크발송 화면). */
    @Operation(summary = "배송 배치 목록", description = "date 필터 필수, sent 필터 옵션")
    @GetMapping
    @RequirePermission(page = "slip.delivery-batch", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<List<DeliveryBatchResponse>> list(
            @RequestParam("date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(value = "sent", required = false) Boolean sent) {
        return ApiResponse.ok(batchService.list(date, sent));
    }

    /** 배치 단건 상세 조회. */
    @Operation(summary = "배송 배치 단건 조회", description = "슬립 번호 목록 포함")
    @GetMapping("/{id}")
    @RequirePermission(page = "slip.delivery-batch", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<DeliveryBatchResponse> getOne(@PathVariable UUID id) {
        return ApiResponse.ok(batchService.getOne(id));
    }

    /** SMS 발송 — Solapi 호출 + smsSentAt 기록. */
    @Operation(summary = "SMS 발송",
            description = "Solapi 호출 후 smsSentAt 기록. 실패 시 smsLastError 기록 + 500")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "발송 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "이미 발송 / 슬립 없음"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "500", description = "Solapi 호출 실패")
    })
    @PostMapping("/{id}/send-sms")
    @RequirePermission(page = "slip.delivery-batch", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<DeliveryBatchResponse> sendSms(@PathVariable UUID id) {
        return ApiResponse.ok(batchService.sendSms(id));
    }

    /** 슬립 수동 추가. */
    @Operation(summary = "슬립 추가", description = "다른 배치 소속이면 자동 이전")
    @PostMapping("/{id}/slips")
    @RequirePermission(page = "slip.delivery-batch", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<DeliveryBatchResponse> addSlip(
            @PathVariable UUID id,
            @Valid @RequestBody AddSlipToBatchRequest req) {
        return ApiResponse.ok(batchService.addSlip(id, req.slipId()));
    }

    /** 슬립 수동 제거. */
    @Operation(summary = "슬립 제거", description = "본 배치 소속이어야 함")
    @DeleteMapping("/{id}/slips/{slipId}")
    @RequirePermission(page = "slip.delivery-batch", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<DeliveryBatchResponse> removeSlip(
            @PathVariable UUID id,
            @PathVariable UUID slipId) {
        return ApiResponse.ok(batchService.removeSlip(id, slipId));
    }

    /** 토큰 재발급 — 만료/유출 시 호출. */
    @Operation(summary = "토큰 재발급", description = "smsSentAt 도 reset 됨 (재발송 가능)")
    @PostMapping("/{id}/regenerate-token")
    @RequirePermission(page = "slip.delivery-batch", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<DeliveryBatchResponse> regenerateToken(@PathVariable UUID id) {
        return ApiResponse.ok(batchService.regenerateToken(id));
    }
}
