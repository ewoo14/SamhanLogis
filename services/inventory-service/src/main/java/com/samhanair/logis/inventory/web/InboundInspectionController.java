package com.samhanair.logis.inventory.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.inventory.domain.InspectionStatus;
import com.samhanair.logis.inventory.service.InboundInspectionService;
import com.samhanair.logis.inventory.web.dto.InboundInspectionDetailResponse;
import com.samhanair.logis.inventory.web.dto.InboundInspectionRequest;
import com.samhanair.logis.inventory.web.dto.InboundInspectionSummaryResponse;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
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
 * 입고 검수 API — P0-9 검수 UI 슬라이스.
 *
 * <p>권한: WAREHOUSE / MANAGER / MASTER (검수는 창고 담당자 역할 중심).
 *
 * <p>엔드포인트 목록:
 * <ul>
 *   <li>{@code GET  /api/v1/inventory/inbound-inspections/{slipId}}
 *       — 검수 대상 입고 슬립 + 라인 상세 (없으면 신규 생성)</li>
 *   <li>{@code POST /api/v1/inventory/inbound-inspections/{slipId}/inspect}
 *       — 검수 결과 일괄 저장</li>
 *   <li>{@code GET  /api/v1/inventory/inbound-inspections}
 *       — 검수 history 페이지 (status 필터 옵션)</li>
 *   <li>{@code POST /api/v1/inventory/inbound-inspections/{slipId}/complete}
 *       — 검수 완료 → 재고 반영</li>
 * </ul>
 *
 * <p>Gateway 는 {@code /api/v1/inventory/**} 요청에서 {@code api/v1} 을 StripPrefix 하므로
 * 서비스 도착 경로는 {@code /inventory/inbound-inspections/**} 이다. 기존 MockMvc/직접 호출
 * 호환을 위해 {@code /api/v1/inventory/inbound-inspections/**} 도 함께 수신한다.
 *
 * <p>UUID 비공개 가드: slipId 는 path parameter (내부 참조). 응답의 {@code slipNo} 가 사용자 노출 식별자.
 */
@RestController
@RequestMapping({"/inventory/inbound-inspections", "/api/v1/inventory/inbound-inspections"})
@RequiredArgsConstructor
public class InboundInspectionController {

    private static final String USER_ID_HEADER = "X-User-Id";

    private final InboundInspectionService inspectionService;

    /**
     * 검수 대상 입고 슬립 + 라인 상세 조회.
     * 검수 레코드가 없으면 slip-service 에서 슬립 정보를 가져와 신규 생성 후 반환한다.
     *
     * @param slipId slip-service Slip UUID
     * @return 검수 헤더 + 라인 상세
     */
    @Operation(summary = "검수 대상 입고 슬립 상세 조회",
            description = "검수 레코드가 없으면 slip-service 에서 슬립 정보를 가져와 신규 생성 후 반환")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
                    description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404",
                    description = "슬립을 찾을 수 없음"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409",
                    description = "입고전표 아님 또는 검수 불가 상태")
    })
    @GetMapping("/{slipId}")
    @PreAuthorize("hasAnyRole('WAREHOUSE','MANAGER','MASTER')")
    @RequirePermission(page = "inventory.stock-balance", action = "VIEW")
    public ApiResponse<InboundInspectionDetailResponse> getInspection(
            @Parameter(description = "slip-service Slip UUID") @PathVariable UUID slipId) {
        return ApiResponse.ok(inspectionService.getOrCreateInspection(slipId));
    }

    /**
     * 검수 결과 일괄 저장 — PENDING 상태에서만 허용.
     * 상태는 PENDING 유지 (완료는 {@code /complete} endpoint 별도).
     *
     * @param slipId       slip-service Slip UUID
     * @param request      검수 결과 요청 (lines: lineId / inspectedQty / defectQty / defectReason)
     * @param callerHeader X-User-Id (검수 담당자 기록용)
     * @return 갱신된 검수 상세 응답
     */
    @Operation(summary = "검수 결과 일괄 저장",
            description = "PENDING 상태에서만 허용. 상태는 PENDING 유지 — 완료는 /complete 로 별도 호출")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
                    description = "저장 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400",
                    description = "입력값 오류 (lines 비어있음 / 수량 음수 등)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404",
                    description = "검수 레코드 또는 라인 미발견"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409",
                    description = "PENDING 이 아닌 상태에서 호출")
    })
    @PostMapping("/{slipId}/inspect")
    @PreAuthorize("hasAnyRole('WAREHOUSE','MANAGER','MASTER')")
    @RequirePermission(page = "inventory.stock-balance", action = "EDIT")
    public ApiResponse<InboundInspectionDetailResponse> saveResult(
            @PathVariable UUID slipId,
            @Valid @RequestBody InboundInspectionRequest request,
            @RequestHeader(value = USER_ID_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(
                inspectionService.saveInspectionResult(slipId, request, actorOrSystem(callerHeader)));
    }

    /**
     * 검수 history 페이지 조회 — status 필터 옵션.
     *
     * @param status 필터 상태 문자열 (PENDING / COMPLETED / CANCELED, 없으면 전체)
     * @param page   0-based 페이지 번호 (기본 0)
     * @param size   페이지 크기 (기본 20)
     * @return 검수 요약 페이지
     */
    @Operation(summary = "검수 history 페이지 조회",
            description = "status 필터 옵션 (PENDING/COMPLETED/CANCELED). 없으면 전체. createdAt DESC 정렬")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
                    description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400",
                    description = "status 값이 올바르지 않음")
    })
    @GetMapping
    @PreAuthorize("hasAnyRole('WAREHOUSE','MANAGER','MASTER')")
    @RequirePermission(page = "inventory.stock-balance", action = "VIEW")
    public ApiResponse<Page<InboundInspectionSummaryResponse>> listInspections(
            @Parameter(description = "검수 상태 필터 (PENDING/COMPLETED/CANCELED)")
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        InspectionStatus statusEnum = parseStatusOrNull(status);
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        return ApiResponse.ok(inspectionService.listInspections(statusEnum, pageable));
    }

    /**
     * 검수 완료 — PENDING → COMPLETED 전이 후 정상 수량을 재고에 반영한다.
     *
     * @param slipId       slip-service Slip UUID
     * @param callerHeader X-User-Id (재고 movement actorUserId 기록용)
     * @return 완료된 검수 상세 응답
     */
    @Operation(summary = "검수 완료 → 재고 반영",
            description = "PENDING → COMPLETED 전이. 정상 수량(inspectedQty - defectQty)을 StockLot + StockBalance 에 반영")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
                    description = "완료 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404",
                    description = "검수 레코드 또는 창고 미발견"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409",
                    description = "PENDING 이 아니거나 검수 미입력 라인 존재, 또는 이미 재고 반영 완료")
    })
    @PostMapping("/{slipId}/complete")
    @ResponseStatus(HttpStatus.OK)
    @PreAuthorize("hasAnyRole('WAREHOUSE','MANAGER','MASTER')")
    @RequirePermission(page = "inventory.stock-balance", action = "EDIT")
    public ApiResponse<InboundInspectionDetailResponse> completeInspection(
            @PathVariable UUID slipId,
            @RequestHeader(value = USER_ID_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(
                inspectionService.completeInspection(slipId, actorOrSystem(callerHeader)));
    }

    private String actorOrSystem(String header) {
        return (header == null || header.isBlank()) ? "system" : header;
    }

    private InspectionStatus parseStatusOrNull(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        try {
            return InspectionStatus.valueOf(status.toUpperCase());
        } catch (IllegalArgumentException ex) {
            throw new com.samhanair.logis.common.exception.BusinessException(
                    com.samhanair.logis.common.exception.ErrorCode.INVALID_INPUT,
                    "올바르지 않은 status 값: " + status
                            + " (허용: PENDING, COMPLETED, CANCELED)");
        }
    }
}
