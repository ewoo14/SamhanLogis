package com.samhanair.logis.slip.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.attachment.domain.SlipAttachmentType;
import com.samhanair.logis.slip.attachment.service.SlipAttachmentService;
import com.samhanair.logis.slip.attachment.web.dto.SlipAttachmentResponse;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.service.SlipSignatureService;
import com.samhanair.logis.slip.web.dto.InternalSignatureRegistrationRequest;
import com.samhanair.logis.slip.web.dto.InternalSignatureResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * Internal 전자서명 endpoint — Phase 10 W10-4 (PR #99) 신규.
 *
 * <p>arologis-service 의 SlipClient (driver-app 정차 완료 시 호출) 가 본 controller 의 endpoint 를
 * 통해 전자서명을 slip-service 에 전파한다.
 *
 * <ul>
 *   <li>{@code POST /internal/slips/{slipId}/signatures} — APP source 서명 등록 (driver-app 캡처)</li>
 *   <li>{@code GET /internal/slips/by-partner/{partnerId}/recent} — partnerId 의 최근 활성 슬립 lookup
 *       (arologis SlipResolver 의 partnerCode → slipId 매핑 단계)</li>
 * </ul>
 *
 * <p>인증: X-Internal-Token 헤더 → ROLE_MASTER 권한으로 통과 ({@link com.samhanair.logis.slip.config.SecurityConfig}).
 * SecurityConfig 가 InternalTokenFilter 를 등록하여 {@code /internal/**} prefix 한정 인증 처리.
 *
 * <p>UUID 가드: GET /by-partner endpoint 는 응답에 slipNo (사용자 노출 식별자) 만 포함 — slipId 는
 * 호출자(arologis-service) 내부 상태로 보존되되 화면 노출 시 슬립번호 우선.
 */
@Slf4j
@RestController
@RequestMapping("/internal/slips")
@RequiredArgsConstructor
public class SlipInternalController {

    private final SlipSignatureService signatureService;
    private final SlipAttachmentService attachmentService;

    /**
     * Internal 전자서명 등록 — arologis-service 가 driver-app 캡처 서명을 slip-service 로 전파.
     *
     * <p>본 endpoint 는 APP source 만 허용 — LINK 는 기존 공개 모바일 endpoint 사용. controller 진입
     * 시점 X-Internal-Token 으로 ROLE_MASTER 인증 + @PreAuthorize 추가 가드.
     *
     * <p>응답 형식: {@code ApiResponse<InternalSignatureResponse>} wrapper (W10-3 F-3 채택 — IT 의무).
     *
     * @param slipId 슬립 UUID
     * @param request 등록 요청
     * @return ApiResponse wrapper 안 InternalSignatureResponse
     */
    @Operation(summary = "Internal 전자서명 등록 (W10-4 — arologis driver-app)",
            description = "X-Internal-Token 인증. APP source 만 허용 (LINK 는 공개 모바일 endpoint 사용)")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
                    description = "등록 성공 (ApiResponse wrapper, ok=true)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400",
                    description = "INVALID_INPUT — source != APP / imageRef blank / capturedAt null"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401",
                    description = "X-Internal-Token 누락/불일치"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404",
                    description = "슬립 미발견"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409",
                    description = "SIGNABLE_STATUSES 미충족 / 동시 수정 충돌")
    })
    @PostMapping("/{slipId}/signatures")
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<InternalSignatureResponse> registerSignature(
            @PathVariable UUID slipId,
            @Valid @RequestBody InternalSignatureRegistrationRequest request) {
        log.info("W10-4 internal signature register — slipId={}, source={}, isDriver={}",
                slipId, request.signatureSource(),
                request.driverCode() != null && !request.driverCode().isBlank());
        return ApiResponse.ok(signatureService.registerFromInternal(slipId, request));
    }

    /**
     * Internal 슬립 첨부 업로드 — arologis-service 기사앱 사진 브리지.
     *
     * <p>공개/인증 사용자 endpoint 를 우회해 헤더를 가장하지 않고, 서비스 간 신뢰 경로
     * ({@code X-Internal-Token}) 로만 호출한다. 본 endpoint 는 기사앱 증빙에 필요한
     * {@link SlipAttachmentType#DELIVERY}, {@link SlipAttachmentType#INSPECTION} 만 허용한다.
     *
     * @param slipId 대상 슬립 UUID
     * @param type 첨부 유형 (DELIVERY/INSPECTION)
     * @param file 사진 파일
     * @param exifGpsLat EXIF 또는 앱 GPS 위도
     * @param exifGpsLng EXIF 또는 앱 GPS 경도
     * @param capturedAt 촬영 시각
     * @param uploadedBy 업로드 주체 표시값 (driverCode 권장)
     * @return ApiResponse wrapper 안 첨부 응답
     */
    @Operation(summary = "Internal 슬립 첨부 업로드 (D-AX-17 — arologis driver photos)",
            description = "X-Internal-Token 인증. DELIVERY/INSPECTION 만 허용한다.")
    @PostMapping(value = "/{slipId}/attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<SlipAttachmentResponse> uploadAttachment(
            @PathVariable UUID slipId,
            @RequestParam("type") SlipAttachmentType type,
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "exifGpsLat", required = false) BigDecimal exifGpsLat,
            @RequestParam(value = "exifGpsLng", required = false) BigDecimal exifGpsLng,
            @RequestParam(value = "capturedAt", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime capturedAt,
            @RequestParam(value = "uploadedBy", required = false) String uploadedBy) {
        if (type != SlipAttachmentType.DELIVERY && type != SlipAttachmentType.INSPECTION) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "기사앱 internal 첨부는 DELIVERY/INSPECTION 만 허용");
        }
        String uploader = uploadedBy == null || uploadedBy.isBlank() ? "arologis-driver-app" : uploadedBy;
        return ApiResponse.ok(SlipAttachmentResponse.from(
                attachmentService.upload(slipId, type, file, exifGpsLat, exifGpsLng,
                        capturedAt, uploader)));
    }

    /**
     * partnerId 기준 최근 활성 슬립 lookup — arologis SlipResolver 가 호출.
     *
     * <p>arologis-service 의 partnerCode → partnerId resolve (PartnerClient.findByCode) 결과를 받아
     * slipId 로 변환하기 위한 GET endpoint. 응답에는 slipId + slipNo 모두 포함하되 사용자 노출 시는
     * slipNo 만 사용해야 한다.
     *
     * @param partnerId 거래처 UUID
     * @return ApiResponse wrapper 안 LookupResponse (slipId + slipNo + status)
     */
    @Operation(summary = "Internal 거래처 최근 활성 슬립 lookup (W10-4 — arologis SlipResolver)",
            description = "X-Internal-Token 인증. order by slipDate DESC, seqNo DESC 의 첫 슬립 1건")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
                    description = "lookup 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401",
                    description = "X-Internal-Token 누락/불일치"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404",
                    description = "해당 partnerId 의 활성 슬립 없음")
    })
    @GetMapping("/by-partner/{partnerId}/recent")
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<LookupResponse> findRecentByPartner(@PathVariable UUID partnerId) {
        Slip slip = signatureService.findRecentByPartnerId(partnerId);
        return ApiResponse.ok(new LookupResponse(
                slip.getId(),
                slip.getSlipNo(),
                slip.getStatus().name()));
    }

    /**
     * partnerCode 기준 최근 활성 슬립 lookup — Phase 10 W10-4 종합 TM (BE-1 채택) 신규.
     *
     * <p>arologis-service 의 SlipResolver 가 카톡 파싱 partnerCode (사용자 노출 식별자) 로 직접 호출.
     * slip-service 가 자체 PartnerInternalClient 로 partner-service 의
     * {@code GET /internal/partners/{partnerCode}} 를 호출하여 partnerId UUID resolve 후 lookup.
     *
     * <p>graceful empty 패턴 (404 미반환) — partner-service 매핑 실패 또는 슬립 미존재 시 200 + data=null.
     * 호출자(arologis SlipResolver) 가 자체 INSERT 만 graceful skip (slipBridged=false) 처리.
     *
     * @param partnerCode 사용자 노출 식별자
     * @return ApiResponse wrapper 안 LookupResponse (매핑 실패 시 data=null)
     */
    @Operation(summary = "Internal partnerCode 최근 활성 슬립 lookup (W10-4 종합 TM — arologis SlipResolver)",
            description = "X-Internal-Token 인증. partner-service /internal/partners/{partnerCode} 위임 후 slipId resolve. "
                    + "매핑 실패 시 200 + data=null (404 미반환, graceful fallback).")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
                    description = "lookup 성공 (data) 또는 매핑 실패 (data=null)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401",
                    description = "X-Internal-Token 누락/불일치")
    })
    @GetMapping("/by-partner-code/{partnerCode}/recent")
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<LookupResponse> findRecentByPartnerCode(@PathVariable String partnerCode) {
        if (partnerCode == null || partnerCode.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "partnerCode 필수");
        }
        Optional<Slip> slipOpt = signatureService.findRecentByPartnerCode(partnerCode);
        if (slipOpt.isEmpty()) {
            // graceful empty — 200 + data=null (BE-1 채택, 호출자 자체 fallback 보존)
            return ApiResponse.ok(null);
        }
        Slip slip = slipOpt.get();
        return ApiResponse.ok(new LookupResponse(
                slip.getId(),
                slip.getSlipNo(),
                slip.getStatus().name()));
    }

    /**
     * partner-recent lookup 응답 record — Phase 10 W10-4 신규.
     *
     * @param slipId 슬립 UUID (호출자 내부 상태용)
     * @param slipNo 전표번호 (사용자 노출 식별자)
     * @param status 슬립 상태 (SIGNABLE_STATUSES 가드용 hint)
     */
    public record LookupResponse(UUID slipId, String slipNo, String status) {}

    // ---- Phase F (D-DF-05/06) — 인수자 번호 + 출고전표 사본 PNG 합성용 전체 상세 ----

    /**
     * Phase F (D-DF-05) — slip recipientPhone lookup. arologis SignAndSendCopyService 가 호출.
     *
     * <p>recipientPhone 은 Slip entity 의 V20 신규 필드 (인수자 번호) — signerName/receiverPhone 과 별도.
     * null/blank 일 시 응답 data.recipientPhone=null (404 미반환, graceful).
     *
     * @param slipId 전표 UUID
     * @return ApiResponse wrapper (data.recipientPhone 풀 번호 또는 null)
     */
    @Operation(summary = "Internal slip 인수자 번호 lookup (Phase F — arologis 사본 발송)",
            description = "X-Internal-Token 인증. 응답 PII 풀 번호 — 호출자 마스킹 의무.")
    @GetMapping("/{slipId}/recipient-phone")
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<RecipientPhoneResponse> findRecipientPhone(@PathVariable UUID slipId) {
        Slip slip = signatureService.findById(slipId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "slip 미발견"));
        return ApiResponse.ok(new RecipientPhoneResponse(slip.getRecipientPhone()));
    }

    /**
     * Phase F (D-DF-06) — print-renderer 용 slip 전체 상세 lookup. arologis 가 PNG 합성에 사용.
     *
     * <p>OutboundView 가 받는 props 와 1:1 매핑. lines 는 slip.getLines() flatten.
     * sourceWarehouseName 은 본 PR 시점 sourceWarehouseId.toString() placeholder — 후속 PR 에서
     * warehouse-service lookup 으로 정정 (양식 표시상 큰 영향 X).
     *
     * @param slipId 전표 UUID
     * @return ApiResponse wrapper (data 미발견 시 404 → BusinessException)
     */
    @Operation(summary = "Internal slip 전체 상세 lookup (Phase F — arologis print-renderer)",
            description = "X-Internal-Token 인증. lines 포함 — 라인 갯수 많을 경우 응답 크기 주의 (~50KB 이내 가정).")
    @GetMapping("/{slipId}/full")
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<SlipFullDetailResponse> findFullDetail(@PathVariable UUID slipId) {
        Slip slip = signatureService.findById(slipId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "slip 미발견"));
        return ApiResponse.ok(SlipFullDetailResponse.from(slip));
    }

    /** Phase F (D-DF-05) — 인수자 번호 응답. */
    public record RecipientPhoneResponse(String recipientPhone) {}

    /**
     * Phase F (D-DF-06) — print-renderer 용 slip 전체 상세 응답.
     *
     * <p>OutboundView 가 받는 props 와 1:1 매핑.
     */
    public record SlipFullDetailResponse(
            String slipNo,
            java.time.LocalDate slipDate,
            String partnerName,
            String deliveryAddress,
            java.util.List<LineDto> lines,
            java.math.BigDecimal totalSupply,
            java.math.BigDecimal vat,
            java.math.BigDecimal total,
            String sourceWarehouseName) {

        public static SlipFullDetailResponse from(Slip slip) {
            // sourceWarehouseName placeholder — 후속 PR 에서 warehouse-service lookup 으로 정정.
            String warehouseName = slip.getSourceWarehouseId() != null
                    ? slip.getSourceWarehouseId().toString()
                    : null;
            // total = supply + vat (Slip entity 가 직접 보유하지 않음 — line 합계 + VAT 합계 별도 계산은 호출자 의무)
            java.math.BigDecimal supplyTotal = java.math.BigDecimal.ZERO;
            java.math.BigDecimal vatTotal = java.math.BigDecimal.ZERO;
            java.util.List<LineDto> lineDtos = new java.util.ArrayList<>();
            for (com.samhanair.logis.slip.domain.SlipLine line : slip.getLines()) {
                lineDtos.add(LineDto.from(line));
                if (line.getSupplyAmount() != null) {
                    supplyTotal = supplyTotal.add(line.getSupplyAmount());
                }
                if (line.getVatAmount() != null) {
                    vatTotal = vatTotal.add(line.getVatAmount());
                }
            }
            return new SlipFullDetailResponse(
                    slip.getSlipNo(),
                    slip.getSlipDate(),
                    slip.getPartnerName(),
                    slip.getDeliveryAddress(),
                    lineDtos,
                    supplyTotal,
                    vatTotal,
                    supplyTotal.add(vatTotal),
                    warehouseName);
        }
    }

    /** Slip line 1건 — print-renderer 표시용. */
    public record LineDto(
            String productName,
            String specification,
            int quantity,
            java.math.BigDecimal unitPrice,
            java.math.BigDecimal lineTotal) {

        public static LineDto from(com.samhanair.logis.slip.domain.SlipLine line) {
            return new LineDto(
                    line.getProductName(),
                    line.getSpecification(),
                    line.getQuantity(),
                    line.getUnitPrice(),
                    line.getLineTotal());
        }
    }
}
