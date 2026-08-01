package com.samhanair.logis.inventory.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.inventory.repository.StockBalanceRepository;
import com.samhanair.logis.inventory.repository.StockLotRepository;
import com.samhanair.logis.inventory.repository.StockMovementRepository;
import com.samhanair.logis.inventory.service.StockExcelExportService;
import com.samhanair.logis.inventory.service.StockService;
import com.samhanair.logis.inventory.web.dto.AdjustRequest;
import com.samhanair.logis.inventory.web.dto.BatchBalanceRequest;
import com.samhanair.logis.inventory.web.dto.DeductRequest;
import com.samhanair.logis.inventory.web.dto.DeductionResponse;
import com.samhanair.logis.inventory.web.dto.InboundRequest;
import com.samhanair.logis.inventory.web.dto.ProductBalanceResponse;
import com.samhanair.logis.inventory.web.dto.ReleaseRequest;
import com.samhanair.logis.inventory.web.dto.ReservationResponse;
import com.samhanair.logis.inventory.web.dto.ReserveRequest;
import com.samhanair.logis.inventory.web.dto.StockBalanceResponse;
import com.samhanair.logis.inventory.web.dto.StockLotResponse;
import com.samhanair.logis.inventory.web.dto.StockMovementResponse;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 재고 잔량/로트/이동 조회 + inbound/reserve/release/deduct/adjust mutation.
 *
 * <p>권한 매트릭스 (Plan §4 표):
 * <ul>
 *   <li>잔량/로트/이동 조회 — MASTER/MANAGER/DEVELOPER/WAREHOUSE/INVENTORY</li>
 *   <li>다중 제품 일괄 잔량 조회 (balances/batch) — 모든 인증 role (영업원 견적 단계 사용)</li>
 *   <li>입고 (lots/inbound) — MASTER/MANAGER/WAREHOUSE/INVENTORY</li>
 *   <li>예약/해제/차감 (reserve/release/deduct) — MASTER/MANAGER/DEVELOPER/SALES/WAREHOUSE/INVENTORY</li>
 *   <li>조정 (adjust) — MASTER/MANAGER/INVENTORY</li>
 * </ul>
 */
@RestController
@RequestMapping("/inventory")
@RequiredArgsConstructor
public class StockController {

    private static final String CALLER_HEADER = "X-User-Id";

    private final StockService stockService;
    private final StockBalanceRepository stockBalanceRepository;
    private final StockLotRepository stockLotRepository;
    private final StockMovementRepository stockMovementRepository;
    private final StockExcelExportService stockExcelExportService;

    // -------- 조회 --------

    /**
     * 재고 현황 페이지 조회 — 품목/창고 필터는 선택이며 둘 다 없으면 전체 현황이다.
     *
     * @param productId 제품 UUID (기존 호출부 호환용 선택 필터)
     * @param warehouseId 창고 UUID (선택 필터)
     * @param page 0-based 페이지 번호
     * @param size 페이지 크기 (기본 20)
     * @return Page&lt;StockBalanceResponse&gt;
     */
    @Operation(summary = "재고 잔량 조회", description = "품목/창고 선택 필터 또는 전체 활성 재고 잔량 페이지")
    @GetMapping("/balances")
    @RequirePermission(page = "inventory.stock-balance", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<Page<StockBalanceResponse>> balances(
            @RequestParam(required = false) UUID productId,
            @RequestParam(required = false) UUID warehouseId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(page, Math.min(size, 100));
        return ApiResponse.ok(stockService.findBalancePage(productId, warehouseId, pageable));
    }

    /**
     * 다중 productId 일괄 잔량 조회 — Sales Form Polish 슬라이스의 영업원 견적/주문 라인 입력에서
     * 다행 동시 재고 조회용. 요청 productId 별 모든 창고 (가상창고 포함) 의 활성 stock_balance row
     * 를 묶어 반환한다.
     *
     * <p>잔량 0인 (productId, warehouse) 조합은 DB row 자체가 없으므로 응답에서 제외 (FE 가
     * 없는 창고를 dash 표시). 가상창고 (VIRTUAL) row 도 그대로 포함되며 표시 분기는 FE 책임.
     *
     * <p>모든 role 이 조회 가능 — 영업원 (SALES) 이 견적 단계에서 직접 사용.
     *
     * @param request productIds 리스트 (1 ~ 100건)
     * @return ApiResponse&lt;List&lt;ProductBalanceResponse&gt;&gt; — 입력 순서 유지
     */
    @Operation(summary = "다중 제품 재고 일괄 조회",
            description = "1~100건 productId × 모든 창고 (가상창고 포함) 잔량을 한 번에 조회")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
                    description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400",
                    description = "productIds 비어있음 또는 100건 초과"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403",
                    description = "권한 없음 (인증 미설정 등)")
    })
    @PostMapping("/balances/batch")
    @RequirePermission(page = "inventory.list", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<List<ProductBalanceResponse>> batchBalances(
            @Valid @RequestBody BatchBalanceRequest request) {
        return ApiResponse.ok(stockService.findBalancesByProductIds(request.productIds()));
    }

    /**
     * 로트 페이지 조회 — productId / warehouseId 옵션. 둘 다 없으면 전체.
     *
     * @param productId 필터 (선택)
     * @param warehouseId 필터 (선택)
     * @param page 0-based 페이지 번호
     * @param size 페이지 크기 (기본 20)
     * @return Page&lt;StockLotResponse&gt;
     */
    @Operation(summary = "로트 조회", description = "productId / warehouseId 조합 필터 페이지")
    @GetMapping("/lots")
    @RequirePermission(page = "inventory.stock-balance", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<Page<StockLotResponse>> lots(
            @RequestParam(required = false) UUID productId,
            @RequestParam(required = false) UUID warehouseId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(page, size);
        Page<StockLotResponse> result;
        if (productId != null && warehouseId != null) {
            result = stockLotRepository
                    .findAllByProductIdAndWarehouse_IdAndIsDeletedFalse(productId, warehouseId, pageable)
                    .map(StockLotResponse::from);
        } else if (productId != null) {
            result = stockLotRepository
                    .findAllByProductIdAndIsDeletedFalse(productId, pageable)
                    .map(StockLotResponse::from);
        } else if (warehouseId != null) {
            result = stockLotRepository
                    .findAllByWarehouse_IdAndIsDeletedFalse(warehouseId, pageable)
                    .map(StockLotResponse::from);
        } else {
            result = stockLotRepository.findAll(pageable).map(StockLotResponse::from);
        }
        return ApiResponse.ok(result);
    }

    /**
     * 이동 이력 페이지 조회 — lotId / productId / warehouseId 우선순위로 필터.
     *
     * @param lotId 가장 우선 (선택)
     * @param productId 차순위 (선택)
     * @param warehouseId 마지막 (선택)
     * @param page 0-based 페이지 번호
     * @param size 페이지 크기 (기본 20)
     * @return Page&lt;StockMovementResponse&gt; — occurredAt DESC
     */
    @Operation(summary = "이동 이력 조회", description = "occurredAt DESC. lot/product/warehouse 우선순위 필터")
    @GetMapping("/movements")
    @RequirePermission(page = "inventory.stock-balance", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<Page<StockMovementResponse>> movements(
            @RequestParam(required = false) UUID lotId,
            @RequestParam(required = false) UUID productId,
            @RequestParam(required = false) UUID warehouseId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(page, size);
        Page<StockMovementResponse> result;
        if (lotId != null) {
            result = stockMovementRepository
                    .findAllByLotIdOrderByOccurredAtDesc(lotId, pageable)
                    .map(StockMovementResponse::from);
        } else if (productId != null) {
            result = stockMovementRepository
                    .findAllByProductIdOrderByOccurredAtDesc(productId, pageable)
                    .map(StockMovementResponse::from);
        } else if (warehouseId != null) {
            result = stockMovementRepository
                    .findAllByWarehouseIdOrderByOccurredAtDesc(warehouseId, pageable)
                    .map(StockMovementResponse::from);
        } else {
            result = stockMovementRepository.findAll(pageable).map(StockMovementResponse::from);
        }
        return ApiResponse.ok(result);
    }

    // -------- mutation --------

    /**
     * 입고 — 새 lot 생성 + balance 가산 + INBOUND movement 기록.
     *
     * @param request InboundRequest (productId/warehouseId/quantity/lotNo/receivedAt/unitCost/note)
     * @param callerHeader X-User-Id (감사용)
     * @return 생성된 StockLotResponse (201) / NOT_FOUND (404) / CONFLICT (409)
     */
    @Operation(summary = "재고 입고", description = "새 lot 생성 + balance 가산 + INBOUND movement 기록")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "입고 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "product/warehouse 미발견"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "낙관적 락 충돌")
    })
    @PostMapping("/lots/inbound")
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = "inventory.stock-balance", action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    public ApiResponse<StockLotResponse> inbound(
            @Valid @RequestBody InboundRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(stockService.inbound(request, callerOrSystem(callerHeader)));
    }

    /**
     * 예약 — availableQty → reservedQty 이동.
     *
     * @return ReservationResponse (200) / 가용 부족 시 CONFLICT (409)
     */
    @Operation(summary = "재고 예약", description = "availableQty 에서 reservedQty 로 이동")
    @PostMapping("/reserve")
    @RequirePermission(page = "inventory.list", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<ReservationResponse> reserve(
            @Valid @RequestBody ReserveRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(stockService.reserve(request, callerOrSystem(callerHeader)));
    }

    /**
     * 예약 해제 — reservedQty → availableQty 이동.
     *
     * @return ReservationResponse (200) / 예약 부족 시 CONFLICT (409)
     */
    @Operation(summary = "예약 해제", description = "reservedQty 에서 availableQty 로 되돌림")
    @PostMapping("/release")
    @RequirePermission(page = "inventory.list", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<ReservationResponse> release(
            @Valid @RequestBody ReleaseRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(stockService.release(request, callerOrSystem(callerHeader)));
    }

    /**
     * 출고 차감 — FIFO 로 가용 lot 차감 + balance.deduct + DEDUCT movement 기록.
     *
     * @return DeductionResponse (200) / 재고 부족 또는 version 충돌 시 CONFLICT (409)
     */
    @Operation(summary = "출고 차감", description = "FIFO 로 가용 lot 차감 (가장 오래된 lot 부터 소진)")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "차감 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "재고 부족 또는 version 충돌")
    })
    @PostMapping("/deduct")
    @RequirePermission(page = "inventory.list", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<DeductionResponse> deduct(
            @Valid @RequestBody DeductRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(stockService.deduct(request, callerOrSystem(callerHeader)));
    }

    /**
     * 실사 조정 — delta 부호로 balance 가감 + ADJUST movement 기록.
     *
     * @return DeductionResponse (200) / 음수 결과 또는 version 충돌 시 CONFLICT (409)
     */
    @Operation(summary = "재고 조정", description = "실사 조정 — delta 부호로 balance 가감")
    @PostMapping("/adjust")
    @RequirePermission(page = "inventory.adjust", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<DeductionResponse> adjust(
            @Valid @RequestBody AdjustRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(stockService.adjust(request, callerOrSystem(callerHeader)));
    }

    /**
     * P1-6 — 재고 잔량 Excel(.xlsx) 다운로드.
     *
     * <p>warehouseId 필터(선택)로 재고 잔량을 .xlsx 파일로 반환.
     * UUID 비공개 가드 — warehouseCode / warehouseName 등 비즈니스 식별자만 출력.
     * 최대 10,000 행.
     *
     * @param warehouseId 창고 UUID 필터 (null 이면 전체 창고)
     * @return 200 + xlsx binary
     */
    @Operation(summary = "재고 잔량 Excel 다운로드 (P1-6)",
            description = "warehouseId 필터(선택). MASTER/MANAGER/WAREHOUSE/INVENTORY 권한. 최대 10,000 행.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
                    description = "xlsx binary"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403",
                    description = "권한 없음")
    })
    @GetMapping("/stocks/export.xlsx")
    @RequirePermission(page = "inventory.stock-balance", action = com.samhanair.logis.security.permission.PermissionAction.DOWNLOAD)
    public ResponseEntity<byte[]> exportXlsx(
            @RequestParam(required = false) UUID warehouseId) {
        byte[] xlsx = stockExcelExportService.export(warehouseId);
        String filename = "stocks-" + java.time.LocalDate.now() + ".xlsx";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.parseMediaType(
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(xlsx);
    }

    private String callerOrSystem(String header) {
        return (header == null || header.isBlank()) ? "system" : header;
    }
}
