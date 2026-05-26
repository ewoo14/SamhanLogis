package com.samhanair.logis.inventory.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.inventory.domain.TransferStatus;
import com.samhanair.logis.inventory.service.StockTransferService;
import com.samhanair.logis.inventory.web.dto.CreateTransferRequest;
import com.samhanair.logis.inventory.web.dto.ReceiveRequest;
import com.samhanair.logis.inventory.web.dto.RejectRequest;
import com.samhanair.logis.inventory.web.dto.TransferDetailResponse;
import com.samhanair.logis.inventory.web.dto.TransferResponse;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
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
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 이동전표 워크플로우 endpoint. 권한 매트릭스 (Plan §4):
 * <ul>
 *   <li>조회 — 인증된 모든 역할</li>
 *   <li>생성(POST) — MASTER / MANAGER / WAREHOUSE / INVENTORY</li>
 *   <li>approve / reject / confirm — MASTER / MANAGER / INVENTORY</li>
 *   <li>ship / receive — MASTER / MANAGER / WAREHOUSE / INVENTORY</li>
 *   <li>cancel — MASTER / MANAGER / INVENTORY</li>
 * </ul>
 */
@RestController
@RequestMapping("/inventory/transfers")
@RequiredArgsConstructor
public class StockTransferController {

    private static final String CALLER_HEADER = "X-User-Id";

    private final StockTransferService transferService;

    /**
     * 이동전표 페이지 조회 — status 필터 (선택).
     *
     * @param status 필터 상태 (null 가능)
     * @param page 0-based 페이지 번호
     * @param size 페이지 크기 (기본 20)
     * @return Page&lt;TransferResponse&gt;
     */
    @Operation(summary = "이동전표 목록", description = "status 필터 가능")
    @GetMapping
    @RequirePermission(page = "inventory.transfer", action = "VIEW")
    public ApiResponse<Page<TransferResponse>> list(
            @RequestParam(required = false) TransferStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(page, size);
        return ApiResponse.ok(transferService.list(status, pageable));
    }

    /**
     * 이동전표 단건 상세 조회.
     *
     * @param id 이동전표 UUID
     * @return TransferDetailResponse (200) / NOT_FOUND (404)
     */
    @Operation(summary = "이동전표 단건 상세")
    @GetMapping("/{id}")
    @RequirePermission(page = "inventory.transfer", action = "VIEW")
    public ApiResponse<TransferDetailResponse> getOne(@PathVariable UUID id) {
        return ApiResponse.ok(transferService.getOne(id));
    }

    /**
     * 이동전표 생성 — REQUESTED 상태로 시작. 라인 productId 일괄 검증 (ProductClient).
     *
     * @param request CreateTransferRequest (source/destination/reason/lines)
     * @param callerHeader X-User-Id (requesterId 로 사용)
     * @return TransferDetailResponse (201) / NOT_FOUND (404) / INVALID_INPUT (400) / CONFLICT (409)
     */
    @Operation(summary = "이동전표 생성", description = "REQUESTED 상태로 생성. 라인 productId 일괄 검증")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "생성 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "source==destination 또는 productId 미발견"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "warehouse 미발견")
    })
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = "inventory.transfer", action = "EDIT")
    public ApiResponse<TransferDetailResponse> create(
            @Valid @RequestBody CreateTransferRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(transferService.create(request, callerOrSystem(callerHeader)));
    }

    /**
     * 결재 승인 — REQUESTED/PENDING_APPROVAL → APPROVED.
     *
     * @return TransferDetailResponse (200) / CONFLICT (409) — 상태 불일치
     */
    @Operation(summary = "이동전표 승인")
    @PostMapping("/{id}/approve")
    @RequirePermission(page = "inventory.adjust", action = "EDIT")
    public ApiResponse<TransferDetailResponse> approve(
            @PathVariable UUID id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(transferService.approve(id, callerOrSystem(callerHeader)));
    }

    /**
     * 결재 반려 — REQUESTED/PENDING_APPROVAL → REJECTED. RejectRequest.reason 으로 reasonDetail 갱신.
     *
     * @return TransferDetailResponse (200) / CONFLICT (409) — 상태 불일치
     */
    @Operation(summary = "이동전표 반려")
    @PostMapping("/{id}/reject")
    @RequirePermission(page = "inventory.adjust", action = "EDIT")
    public ApiResponse<TransferDetailResponse> reject(
            @PathVariable UUID id,
            @Valid @RequestBody RejectRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(transferService.reject(id, callerOrSystem(callerHeader), request.reason()));
    }

    /**
     * 출하 — APPROVED → SHIPPED (또는 가상창고면 즉시 RECEIVED 로 점프).
     *
     * @return TransferDetailResponse (200) / CONFLICT (409) — 상태 불일치
     */
    @Operation(summary = "이동전표 출하", description = "APPROVED → SHIPPED. 가상창고면 즉시 RECEIVED")
    @PostMapping("/{id}/ship")
    @RequirePermission(page = "inventory.transfer", action = "EDIT")
    public ApiResponse<TransferDetailResponse> ship(@PathVariable UUID id) {
        return ApiResponse.ok(transferService.ship(id));
    }

    /**
     * 입고 — SHIPPED/IN_TRANSIT → RECEIVED.
     *
     * @return TransferDetailResponse (200) / CONFLICT (409) — 상태 불일치
     */
    @Operation(summary = "이동전표 입고")
    @PostMapping("/{id}/receive")
    @RequirePermission(page = "inventory.transfer", action = "EDIT")
    public ApiResponse<TransferDetailResponse> receive(
            @PathVariable UUID id,
            @Valid @RequestBody(required = false) ReceiveRequest request) {
        return ApiResponse.ok(transferService.receive(id));
    }

    /**
     * 입고 확정 — RECEIVED → CONFIRMED.
     *
     * @return TransferDetailResponse (200) / CONFLICT (409) — 상태 불일치
     */
    @Operation(summary = "이동전표 입고 확정")
    @PostMapping("/{id}/confirm")
    @RequirePermission(page = "inventory.adjust", action = "EDIT")
    public ApiResponse<TransferDetailResponse> confirm(
            @PathVariable UUID id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(transferService.confirm(id, callerOrSystem(callerHeader)));
    }

    /**
     * 취소 — REQUESTED/PENDING_APPROVAL/APPROVED 단계까지만 가능 → CANCELED.
     *
     * @return TransferDetailResponse (200) / CONFLICT (409) — 취소 불가 단계
     */
    @Operation(summary = "이동전표 취소", description = "REQUESTED/PENDING_APPROVAL/APPROVED 단계까지만 가능")
    @PostMapping("/{id}/cancel")
    @RequirePermission(page = "inventory.adjust", action = "EDIT")
    public ApiResponse<TransferDetailResponse> cancel(
            @PathVariable UUID id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(transferService.cancel(id, callerOrSystem(callerHeader)));
    }

    private String callerOrSystem(String header) {
        return (header == null || header.isBlank()) ? "system" : header;
    }
}
