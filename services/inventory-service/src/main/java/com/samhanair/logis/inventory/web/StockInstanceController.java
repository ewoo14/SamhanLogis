package com.samhanair.logis.inventory.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.inventory.domain.StockInstance;
import com.samhanair.logis.inventory.domain.StockInstanceStatus;
import com.samhanair.logis.inventory.service.StockInstanceService;
import com.samhanair.logis.inventory.service.StockInstanceScanService;
import com.samhanair.logis.inventory.service.StockScanDirection;
import com.samhanair.logis.inventory.service.StockScanItem;
import com.samhanair.logis.inventory.service.StockScanRequest;
import com.samhanair.logis.inventory.service.StockScanResponse;
import com.samhanair.logis.inventory.web.dto.BatchInboundInstanceRequest;
import com.samhanair.logis.inventory.web.dto.CreateInstanceRequest;
import com.samhanair.logis.inventory.web.dto.ReleaseBatchInstanceRequest;
import com.samhanair.logis.inventory.web.dto.RecallBatchInstanceRequest;
import com.samhanair.logis.inventory.web.dto.ReserveBatchInstanceRequest;
import com.samhanair.logis.inventory.web.dto.ResellBatchInstanceRequest;
import com.samhanair.logis.inventory.web.dto.ShipBatchInstanceRequest;
import com.samhanair.logis.inventory.web.dto.StockInstanceResponse;
import com.samhanair.logis.inventory.web.dto.StockInstanceListResponse;
import com.samhanair.logis.inventory.web.dto.UpdateStockInstanceQualityRequest;
import com.samhanair.logis.inventory.web.dto.UnrecallBatchInstanceRequest;
import com.samhanair.logis.inventory.web.dto.QrScanRequest;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.ObjectProvider;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 개별시리얼 인스턴스 CRUD/조회 컨트롤러 — Phase INV-S / S1.
 *
 * <p>권한 매트릭스:
     * <ul>
     *   <li>인스턴스 생성 ({@code POST /inventory/instances}) — {@code inventory.stock-balance CREATE}</li>
     *   <li>출고/회수/재판매 배치 전이 ({@code POST /reserve-batch|ship-batch|release-batch|recall-batch|unrecall-batch|resell-batch}) — {@code inventory.stock-balance UPDATE}</li>
     *   <li>FIFO/역-FIFO/품목별 조회 ({@code GET}) — {@code inventory.stock-balance VIEW}</li>
     * </ul>
 *
 * <p>UUID 비공개 원칙 ({@code feedback_uuid_no_user_visibility}):
 * 응답 DTO 의 {@code id}·{@code productId}·{@code warehouseId} 는 API key 로만 사용.
 * 사용자 화면 표시는 {@code productCode}·{@code status}·슬립번호 사용.
 */
@RestController
@RequestMapping("/inventory/instances")
@Tag(name = "재고 인스턴스", description = "개별시리얼 재고 인스턴스 CRUD/조회 API (Phase INV-S S1)")
public class StockInstanceController {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_NAME_HEADER = "X-User-Name";

    private final StockInstanceService stockInstanceService;
    private final StockInstanceScanService stockInstanceScanService;

    /** Spring이 선택하는 운영 생성자 — 기존 단위 테스트용 호환 생성자와 분리한다. */
    @Autowired
    public StockInstanceController(StockInstanceService stockInstanceService,
                                   ObjectProvider<StockInstanceScanService> stockInstanceScanService) {
        this.stockInstanceService = stockInstanceService;
        this.stockInstanceScanService = stockInstanceScanService.getIfAvailable();
    }

    /** 기존 단위 테스트·내부 생성 경로와의 호환 생성자. QR 호출 경로에서는 Spring이 2개 인자를 주입한다. */
    public StockInstanceController(StockInstanceService stockInstanceService) {
        this.stockInstanceService = stockInstanceService;
        this.stockInstanceScanService = null;
    }

    /**
     * 개별시리얼 인스턴스 수동 생성.
     *
     * <p>serial-managed 품목({@code serialManaged=true}) 만 허용.
     * batch 품목 요청 시 409 CONFLICT 반환.
     *
     * @param request 인스턴스 생성 요청 (productId, productCode, warehouseId 필수)
     * @return 생성된 인스턴스 응답
     */
    @Operation(summary = "인스턴스 수동 생성", description = "serial-managed 품목의 개별시리얼 인스턴스를 수동 생성. batch 품목 요청 시 409.")
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = "inventory.stock-balance", action = PermissionAction.CREATE)
    public ApiResponse<StockInstanceResponse> create(
            @Valid @RequestBody CreateInstanceRequest request) {
        StockInstance instance = stockInstanceService.create(
                request.productId(),
                request.productCode(),
                request.warehouseId(),
                request.inboundType(),
                request.unitCost(),
                request.inboundSlipNo(),
                request.receivedAt());
        return ApiResponse.ok(StockInstanceResponse.from(instance), "인스턴스 생성 완료");
    }

    /**
     * 입고 전표 연동용 인스턴스 배치 생성.
     *
     * <p>{@code inboundSlipNo + productId} 기준으로 이미 생성된 인스턴스 수를 세고 부족분만 추가 생성한다.
     * serial-managed=false 품목은 batch lot 경로 대상이므로 409 CONFLICT 를 반환한다.
     *
     * @param request 배치 입고 요청
     * @return 기존 및 신규 생성 인스턴스 응답 목록
     */
    @Operation(summary = "인스턴스 배치 입고",
            description = "serial-managed 품목 N개 인스턴스 멱등 생성(inbound_slip_no+product 기준). batch 품목 요청 시 409.")
    @PostMapping("/batch")
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = "inventory.stock-balance", action = PermissionAction.CREATE)
    public ApiResponse<List<StockInstanceResponse>> inboundBatch(
            @Valid @RequestBody BatchInboundInstanceRequest request) {
        List<StockInstanceResponse> result = stockInstanceService.inboundBatch(
                        request.productId(),
                        request.productCode(),
                        request.warehouseId(),
                        request.quantity(),
                        request.inboundType(),
                        request.inboundSlipNo(),
                        request.unitCost(),
                        request.receivedAt(),
                        request.sourceContext())
                .stream()
                .map(StockInstanceResponse::from)
                .toList();
        return ApiResponse.ok(result, "인스턴스 배치 입고 완료");
    }

    /**
     * 출고 전표 accept 연동용 인스턴스 FIFO 예약.
     *
     * <p>{@code outboundSlipNo + productCode} 기준으로 이미 예약된 인스턴스 수를 세고 부족분만 추가 예약한다.
     * serial-managed=false 품목은 batch lot 경로 대상이므로 409 CONFLICT 를 반환한다.
     *
     * @param request 출고 배치 예약 요청
     * @return 해당 전표가 점유한 RESERVED 인스턴스 응답 목록
     */
    @Operation(summary = "인스턴스 출고 예약",
            description = "serial-managed 품목 N개 인스턴스를 FIFO 예약(outbound_slip_no+product 기준 멱등). batch 품목 요청 시 409.")
    @PostMapping("/reserve-batch")
    @RequirePermission(page = "inventory.stock-balance", action = PermissionAction.UPDATE)
    public ApiResponse<List<StockInstanceResponse>> reserveBatch(
            @Valid @RequestBody ReserveBatchInstanceRequest request) {
        List<StockInstanceResponse> result = stockInstanceService.reserveBatch(
                        request.productCode(),
                        request.warehouseId(),
                        request.quantity(),
                        request.outboundSlipNo())
                .stream()
                .map(StockInstanceResponse::from)
                .toList();
        return ApiResponse.ok(result, "인스턴스 출고 예약 완료");
    }

    /**
     * 출고 전표 complete 연동용 예약 인스턴스 출고.
     *
     * @param request 출고 배치 완료 요청
     * @return 해당 전표로 SHIPPED 처리된 인스턴스 응답 목록
     */
    @Operation(summary = "예약 인스턴스 출고",
            description = "outbound_slip_no+product 기준 RESERVED 인스턴스를 SHIPPED 로 전이.")
    @PostMapping("/ship-batch")
    @RequirePermission(page = "inventory.stock-balance", action = PermissionAction.UPDATE)
    public ApiResponse<List<StockInstanceResponse>> shipBatch(
            @Valid @RequestBody ShipBatchInstanceRequest request) {
        List<StockInstanceResponse> result = stockInstanceService.shipBatch(
                        request.outboundSlipNo(),
                        request.productCode(),
                        request.partnerCode(),
                        request.outboundAt(),
                        request.sourceContext())
                .stream()
                .map(StockInstanceResponse::from)
                .toList();
        return ApiResponse.ok(result, "예약 인스턴스 출고 완료");
    }

    /**
     * 출고 전표 reject/cancel 연동용 예약 인스턴스 해제.
     *
     * @param request 출고 배치 해제 요청
     * @return AVAILABLE 로 복원된 인스턴스 응답 목록
     */
    @Operation(summary = "예약 인스턴스 해제",
            description = "outbound_slip_no+product 기준 RESERVED 인스턴스를 AVAILABLE 로 복원.")
    @PostMapping("/release-batch")
    @RequirePermission(page = "inventory.stock-balance", action = PermissionAction.UPDATE)
    public ApiResponse<List<StockInstanceResponse>> releaseBatch(
            @Valid @RequestBody ReleaseBatchInstanceRequest request) {
        List<StockInstanceResponse> result = stockInstanceService.releaseBatch(
                        request.outboundSlipNo(),
                        request.productCode())
                .stream()
                .map(StockInstanceResponse::from)
                .toList();
        return ApiResponse.ok(result, "예약 인스턴스 해제 완료");
    }

    /**
     * 반품/회차 INBOUND 전표 complete 연동용 인스턴스 회수.
     *
     * @param request 회수 배치 요청
     * @return 해당 전표로 RECALLED 처리된 인스턴스 응답 목록
     */
    @Operation(summary = "인스턴스 회수",
            description = "partnerCode+productCode 기준 SHIPPED 인스턴스를 outbound_at DESC 역-FIFO로 RECALLED 처리.")
    @PostMapping("/recall-batch")
    @RequirePermission(page = "inventory.stock-balance", action = PermissionAction.UPDATE)
    public ApiResponse<List<StockInstanceResponse>> recallBatch(
            @Valid @RequestBody RecallBatchInstanceRequest request) {
        List<StockInstanceResponse> result = stockInstanceService.recallBatch(
                        request.partnerCode(),
                        request.productCode(),
                        request.quantity(),
                        request.recallSlipNo())
                .stream()
                .map(StockInstanceResponse::from)
                .toList();
        return ApiResponse.ok(result, "인스턴스 회수 완료");
    }

    /**
     * 반품/회차 INBOUND 전표 complete 보상용 인스턴스 회수 취소.
     *
     * @param request 회수 취소 배치 요청
     * @return 해당 전표 회수가 취소되어 SHIPPED 로 복원된 인스턴스 응답 목록
     */
    @Operation(summary = "인스턴스 회수 취소",
            description = "recallSlipNo+productCode 기준 RECALLED 인스턴스를 SHIPPED 로 복원.")
    @PostMapping("/unrecall-batch")
    @RequirePermission(page = "inventory.stock-balance", action = PermissionAction.UPDATE)
    public ApiResponse<List<StockInstanceResponse>> unrecallBatch(
            @Valid @RequestBody UnrecallBatchInstanceRequest request) {
        List<StockInstanceResponse> result = stockInstanceService.unrecallBatch(
                        request.recallSlipNo(),
                        request.productCode())
                .stream()
                .map(StockInstanceResponse::from)
                .toList();
        return ApiResponse.ok(result, "인스턴스 회수 취소 완료");
    }

    /**
     * 검수 완료 회수품 재판매 — RECALLED 인스턴스를 AVAILABLE 로 복귀.
     *
     * @param request      재판매 배치 요청
     * @param callerHeader X-User-Id (감사용)
     * @return AVAILABLE 로 복귀된 인스턴스 응답 목록
     */
    @Operation(summary = "회수품 재판매",
            description = "recallSlipNo+productCode 기준 RECALLED 인스턴스를 AVAILABLE 로 복귀하고 회수/출고 마커를 제거.")
    @PostMapping("/resell-batch")
    @RequirePermission(page = "inventory.stock-balance", action = PermissionAction.UPDATE)
    public ApiResponse<List<StockInstanceResponse>> resellBatch(
            @Valid @RequestBody ResellBatchInstanceRequest request,
            @RequestHeader(value = USER_ID_HEADER, required = false) String callerHeader) {
        List<StockInstanceResponse> result = stockInstanceService.resellBatch(
                        request.recallSlipNo(),
                        request.productCode(),
                        request.quantity(),
                        callerHeader)
                .stream()
                .map(StockInstanceResponse::from)
                .toList();
        return ApiResponse.ok(result, "회수품 재판매 완료");
    }

    /**
     * FIFO 소진 후보 조회 — 품목코드 기준 AVAILABLE 인스턴스를 received_at ASC 순으로 반환.
     *
     * @param productCode 품목코드 그룹 (필수)
     * @return FIFO 순 인스턴스 목록
     */
    @Operation(summary = "FIFO 소진 후보 조회", description = "품목코드 기준 AVAILABLE 인스턴스를 received_at ASC(FIFO) 순으로 반환.")
    @GetMapping("/fifo")
    @RequirePermission(page = "inventory.stock-balance", action = PermissionAction.VIEW)
    public ApiResponse<List<StockInstanceResponse>> fifo(
            @Parameter(description = "품목코드 그룹", required = true)
            @RequestParam String productCode) {
        List<StockInstanceResponse> result = stockInstanceService.fifoCandidates(productCode)
                .stream().map(StockInstanceResponse::from).toList();
        return ApiResponse.ok(result, "FIFO 후보 조회 완료");
    }

    /**
     * 역-FIFO 회수 후보 조회 — 거래처+품목코드 기준 SHIPPED 인스턴스를 outbound_at DESC 순으로 반환.
     *
     * @param partnerCode 거래처 코드 (필수)
     * @param productCode 품목코드 그룹 (필수)
     * @return 역-FIFO 순 인스턴스 목록
     */
    @Operation(summary = "역-FIFO 회수 후보 조회", description = "거래처+품목코드 기준 SHIPPED 인스턴스를 outbound_at DESC(역-FIFO) 순으로 반환.")
    @GetMapping("/recall")
    @RequirePermission(page = "inventory.stock-balance", action = PermissionAction.VIEW)
    public ApiResponse<List<StockInstanceResponse>> recall(
            @Parameter(description = "거래처 코드", required = true)
            @RequestParam String partnerCode,
            @Parameter(description = "품목코드 그룹", required = true)
            @RequestParam String productCode) {
        List<StockInstanceResponse> result = stockInstanceService.recallCandidates(partnerCode, productCode)
                .stream().map(StockInstanceResponse::from).toList();
        return ApiResponse.ok(result, "역-FIFO 회수 후보 조회 완료");
    }

    /** UUID를 노출하지 않고 사용자 노출용 시리얼키로 단건 조회한다. */
    @Operation(summary = "시리얼키 인스턴스 조회", description = "노출용 시리얼키로 재고 인스턴스를 단건 조회.")
    @GetMapping("/serial")
    @RequirePermission(page = "inventory.stock-balance", action = PermissionAction.VIEW)
    public ApiResponse<StockInstanceResponse> bySerialKey(
            @Parameter(description = "사용자 노출용 시리얼키", required = true)
            @RequestParam String serialKey) {
        return ApiResponse.ok(StockInstanceResponse.from(stockInstanceService.bySerialKey(serialKey)),
                "시리얼키 인스턴스 조회 완료");
    }

    /**
     * 품목별 인스턴스 조회 — productId + 상태 필터.
     *
     * @param productId 제품 UUID (필수)
     * @param status    조회할 상태 (nullable, null 이면 전체)
     * @return 인스턴스 목록
     */
    @Operation(summary = "품목별 인스턴스 조회", description = "productId + 상태 필터로 인스턴스 목록 반환.")
    @GetMapping
    @RequirePermission(page = "inventory.stock-balance", action = PermissionAction.VIEW)
    public ApiResponse<List<StockInstanceResponse>> byProduct(
            @Parameter(description = "제품 UUID", required = true)
            @RequestParam UUID productId,
            @Parameter(description = "상태 필터 (AVAILABLE/RESERVED/SHIPPED/RECALLED). null 이면 전체.")
            @RequestParam(required = false) StockInstanceStatus status) {
        List<StockInstanceResponse> result = stockInstanceService.byProduct(productId, status)
                .stream().map(StockInstanceResponse::from).toList();
        return ApiResponse.ok(result, "품목별 인스턴스 조회 완료");
    }

    /** 품목리스트 모달 전용 안전 응답 — UUID 없이 품목코드로 범위를 고정한다. */
    @Operation(summary = "품목리스트 조회", description = "품목코드에 속한 재고 인스턴스만 UUID 없이 반환.")
    @GetMapping("/product-list")
    @RequirePermission(page = "inventory.stock-balance", action = PermissionAction.VIEW)
    public ApiResponse<List<StockInstanceListResponse>> productList(@RequestParam String productCode) {
        return ApiResponse.ok(stockInstanceService.listForProductCode(productCode), "품목리스트 조회 완료");
    }

    /** 구매·차용 입고전표 화면의 QR 출력용 — 전표 귀속 인스턴스만 반환한다. */
    @Operation(summary = "입고전표 QR 인스턴스 조회", description = "입고전표번호에 귀속된 인스턴스의 시리얼키·품목코드를 반환.")
    @GetMapping("/by-inbound-slip")
    @RequirePermission(page = "purchases.slip.edit", action = PermissionAction.VIEW)
    public ApiResponse<List<StockInstanceResponse>> byInboundSlip(@RequestParam String slipNo) {
        return ApiResponse.ok(stockInstanceService.listByInboundSlip(slipNo).stream()
                .map(StockInstanceResponse::from).toList(), "입고전표 QR 인스턴스 조회 완료");
    }

    /** AVAILABLE/RESERVED만 품질 변경 가능. SHIPPED 차단은 서비스·도메인 양쪽에서 수행한다. */
    @Operation(summary = "재고 품목 상태 변경", description = "serialKey 기준 품질 변경. SHIPPED는 409.")
    @PatchMapping("/quality")
    @RequirePermission(page = "inventory.stock-balance", action = PermissionAction.UPDATE)
    public ApiResponse<StockInstanceListResponse> updateQuality(
            @RequestParam String serialKey,
            @Valid @RequestBody UpdateStockInstanceQualityRequest request,
            @RequestHeader(value = USER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = USER_NAME_HEADER, required = false) String callerName) {
        StockInstance instance = stockInstanceService.updateQuality(
                serialKey, request.quality(), callerId, callerName);
        return ApiResponse.ok(stockInstanceService.listForProductCode(instance.getProductCode()).stream()
                .filter(row -> row.serialKey().equals(serialKey)).findFirst().orElseThrow(),
                "품목 상태 변경 완료");
    }

    /** 전표 귀속 QR 입고 — 계정별 inventory.stock-balance CREATE 권한을 사용한다. */
    @Operation(summary = "QR 시리얼 입고", description = "전표번호와 QR 시리얼키 목록을 검증해 원자적으로 입고 귀속.")
    @PostMapping("/scan/inbound")
    @RequirePermission(page = "inventory.stock-balance", action = PermissionAction.CREATE)
    public ApiResponse<StockScanResponse> scanInbound(@Valid @RequestBody QrScanRequest request) {
        return ApiResponse.ok(stockInstanceScanService.scan(toServiceRequest(request, StockScanDirection.INBOUND)),
                "QR 시리얼 입고 완료");
    }

    /** 전표 귀속 QR 출고 — 계정별 inventory.stock-balance UPDATE 권한을 사용한다. */
    @Operation(summary = "QR 시리얼 출고", description = "전표번호와 QR 시리얼키 목록을 검증해 원자적으로 출고 및 차감.")
    @PostMapping("/scan/outbound")
    @RequirePermission(page = "inventory.stock-balance", action = PermissionAction.UPDATE)
    public ApiResponse<StockScanResponse> scanOutbound(@Valid @RequestBody QrScanRequest request) {
        return ApiResponse.ok(stockInstanceScanService.scan(toServiceRequest(request, StockScanDirection.OUTBOUND)),
                "QR 시리얼 출고 완료");
    }

    private StockScanRequest toServiceRequest(QrScanRequest request, StockScanDirection direction) {
        return new StockScanRequest(request.slipNo(), direction,
                request.items().stream()
                        .map(item -> new StockScanItem(item.serialKey(), item.productCode()))
                        .toList());
    }
}
