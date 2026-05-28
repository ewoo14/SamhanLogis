package com.samhanair.logis.partnerorder.vendor.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.vendor.ocr.OcrEngine;
import com.samhanair.logis.partnerorder.vendor.service.VendorOrderService;
import com.samhanair.logis.partnerorder.vendor.web.dto.VendorOrderConfirmRequest;
import com.samhanair.logis.partnerorder.vendor.web.dto.VendorOrderConfirmResponse;
import com.samhanair.logis.partnerorder.vendor.web.dto.VendorOrderUploadResponse;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.security.permission.PermissionAction;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * vendor 발주서 OCR + parser admin endpoint (PR-F2 신규).
 *
 * <p>endpoint:
 * <ul>
 *   <li>POST {@code /api/v1/admin/partner-order/vendor/upload} (multipart) — OCR + preview</li>
 *   <li>POST {@code /api/v1/admin/partner-order/vendor/confirm} (json) — preview 확정 → 발주 등록</li>
 * </ul>
 *
 * <p>권한 — MASTER / MANAGER (admin 전용).
 *
 * <p>OCR 미사용 fallback: {@link OcrEngine} bean 미등록 (Tesseract 미설치) 시 503 SERVICE_UNAVAILABLE
 * 응답 (DevOps setup 안내).
 *
 * <p><b>PR-H4b 통합 안내</b>: vendor 발주서 confirm 흐름이 PartnerOrder entity 등록까지 완료되는
 * 후속 슬라이스에서는 본 endpoint 도 {@link com.samhanair.logis.partnerorder.audit.service.PartnerOrderAuditLogService}
 * 의 audit overlay 자동 기록 + SSE broadcast 가 적용된다. 현 단계는 OCR + parser 결과 응답까지만
 * 책임 (별도 entity 미생성). 실시간 SSE 구독은 PartnerOrder entity 발급 후
 * {@code GET /api/v1/partner-orders/{partnerOrderId}/realtime} 활용.
 */
@RestController
@RequestMapping("/api/v1/admin/partner-order/vendor")
public class VendorOrderController {

    private static final Logger log = LoggerFactory.getLogger(VendorOrderController.class);
    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String ROLE_HEADER    = "X-User-Role";

    private final VendorOrderService vendorOrderService;
    private final ObjectProvider<OcrEngine> ocrEngineProvider;

    public VendorOrderController(VendorOrderService vendorOrderService,
                                 ObjectProvider<OcrEngine> ocrEngineProvider) {
        this.vendorOrderService = vendorOrderService;
        this.ocrEngineProvider = ocrEngineProvider;
    }

    /**
     * vendor 발주서 업로드 → OCR + parser + 단가 lookup + DC 적용 미리보기.
     *
     * @param file 발주서 (PDF / 이미지)
     * @param vendor 사용자 명시 vendor (옵션 — auto-detect 시도)
     * @param partnerCode 사용자 명시 거래처 (옵션 — parser 인식 시도)
     */
    @Operation(summary = "vendor 발주서 OCR 업로드",
            description = "Tesseract OCR + 에어디자이너/제이시스템 parser → preview 응답. "
                    + "Tesseract 미설치 시 503 (DevOps setup 필요).")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "upload + preview 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "vendor 식별 실패 / 빈 파일"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "503", description = "OCR 미사용 (Tesseract 미설치)")
    })
    @PostMapping(value = "/upload", consumes = "multipart/form-data")
    @RequirePermission(page = "sales.vendor-order", action = PermissionAction.CREATE)
    public ResponseEntity<ApiResponse<VendorOrderUploadResponse>> upload(
            @Parameter(description = "발주서 파일 (PDF / PNG / JPEG)")
            @RequestPart("file") MultipartFile file,
            @RequestParam(value = "vendor", required = false) String vendor,
            @RequestParam(value = "partnerCode", required = false) String partnerCode,
            @RequestHeader(value = USER_ID_HEADER, required = false) String userId,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) throws IOException {
        if (ocrEngineProvider.getIfAvailable() == null) {
            return serviceUnavailable();
        }
        log.info("vendor upload — actor={}, vendorHint={}, partnerHint={}, size={}",
                fallback(userId), vendor, partnerCode, file == null ? 0 : file.getSize());
        byte[] bytes = file == null ? new byte[0] : file.getBytes();
        VendorOrderUploadResponse response = vendorOrderService.upload(
                bytes, file == null ? null : file.getContentType(), vendor, partnerCode);
        return ResponseEntity.ok(ApiResponse.ok(response));
    }

    /**
     * preview 라인을 사용자가 검토/수정 후 confirm — 신규 vendor 발주 등록.
     */
    @Operation(summary = "vendor 발주서 confirm")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "발주 등록 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "검증 실패"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "거래처 미발견")
    })
    @PostMapping("/confirm")
    @RequirePermission(page = "sales.vendor-order", action = PermissionAction.CREATE)
    public ApiResponse<VendorOrderConfirmResponse> confirm(
            @Valid @RequestBody VendorOrderConfirmRequest request,
            @RequestHeader(value = USER_ID_HEADER, required = false) String userId,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        log.info("vendor confirm — actor={}, vendor={}, partnerCode={}, lines={}",
                fallback(userId), request.vendorName(), request.partnerCode(),
                request.lines() == null ? 0 : request.lines().size());
        return ApiResponse.ok(vendorOrderService.confirm(request, fallback(userId)));
    }

    private static ResponseEntity<ApiResponse<VendorOrderUploadResponse>> serviceUnavailable() {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(ApiResponse.fail(ErrorCode.INTERNAL_ERROR,
                        "OCR 엔진 미사용 — samhan.partner-order.ocr.enabled=true 설정 필요 (DevOps Tesseract setup)"));
    }

    private static String fallback(String header) {
        return (header == null || header.isBlank()) ? "system" : header;
    }
}
