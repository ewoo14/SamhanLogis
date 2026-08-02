package com.samhanair.logis.slip.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.attachment.domain.SlipAttachmentType;
import com.samhanair.logis.slip.attachment.service.SlipAttachmentService;
import com.samhanair.logis.slip.attachment.web.dto.SlipAttachmentResponse;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.repository.SlipLineRepository;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.service.SlipSignatureService;
import com.samhanair.logis.slip.service.SlipPartnerBackfillService;
import com.samhanair.logis.slip.service.SlipService;
import com.samhanair.logis.slip.web.dto.InternalSignatureRegistrationRequest;
import com.samhanair.logis.slip.web.dto.InternalSignatureResponse;
import com.samhanair.logis.slip.web.dto.LockByPeriodRequest;
import com.samhanair.logis.slip.web.dto.LockByPeriodResponse;
import com.samhanair.logis.slip.web.dto.OutboundSlipLineResponse;
import com.samhanair.logis.slip.web.dto.OutboundSlipResponse;
import com.samhanair.logis.slip.web.dto.PartnerLedgerSalesResponse;
import com.samhanair.logis.slip.web.dto.SlipLineSnapshot;
import com.samhanair.logis.slip.web.dto.SlipSummary;
import com.samhanair.logis.slip.web.dto.SlipPartnerBackfillResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
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

    /** 거래처별 원장에 표시할 판매전표 상태 — 거래 사실 문서 기준. */
    private static final List<SlipStatus> PARTNER_LEDGER_SALES_STATUSES = List.of(
            SlipStatus.CONFIRMED,
            SlipStatus.DELIVERED,
            SlipStatus.COMPLETED,
            SlipStatus.SHIPPING,
            SlipStatus.INSPECTING);

    private final SlipSignatureService signatureService;
    private final SlipAttachmentService attachmentService;
    private final SlipLineRepository slipLineRepository;
    private final SlipRepository slipRepository;
    private final SlipService slipService;
    private final SlipPartnerBackfillService slipPartnerBackfillService;

    /**
     * 커밋 전표 거래처 동적 보정 — cutover 시점에 partner-service 경유로 실행한다.
     *
     * <p>{@code /internal/**} + {@code ROLE_MASTER} 이중 가드가 적용된다. 활성 필수 9상태의
     * partner_id null 행만 매번 재조회하므로 이미 보정된 행은 멱등하게 건너뛴다. dry-run은
     * partner-service 조회·미해소 리포트·잔여 count만 만들고 DB를 변경하지 않는다.
     *
     * @param dryRun true면 조회만 수행
     * @return 처리/미해소/잔여 count와 미해소 상세
     */
    @Operation(summary = "Internal 커밋 전표 거래처 보정",
            description = "X-Internal-Token 인증. FOUND + partnerId 응답만 보정하고 나머지는 리포트한다.")
    @PostMapping("/backfill-committed-partners")
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<SlipPartnerBackfillResponse> backfillCommittedPartners(
            @RequestParam(defaultValue = "false") boolean dryRun) {
        return ApiResponse.ok(slipPartnerBackfillService.backfill(dryRun));
    }

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
     * 기간 마감 lock — accounting-service 월마감/일마감 서비스간 전용 endpoint.
     *
     * <p>{@code /internal/**} prefix 로 {@link com.samhanair.logis.security.InternalTokenFilter} 를 경유하며,
     * 사용자 권한 {@code @RequirePermission} 은 사용하지 않는다. 유효한 내부 토큰은 ROLE_MASTER 로
     * 인증되고, 본 메서드의 {@code @PreAuthorize} 가 내부 호출만 통과시킨다.
     *
     * @param request 기간 잠금 요청 ({@code startDate/endDate/status})
     * @return ApiResponse wrapper 안 잠금 건수
     */
    @Operation(summary = "Internal 기간 마감 lock",
            description = "accounting-service 마감 처리용. X-Internal-Token 인증 후 기간 + status 조합 "
                    + "슬립을 lock_flag=true 처리한다.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "처리 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "기간 누락"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "내부 토큰 불일치"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "내부 토큰 누락")
    })
    @PostMapping("/lock-by-period")
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<LockByPeriodResponse> lockByPeriod(@Valid @RequestBody LockByPeriodRequest request) {
        int locked = slipService.lockByPeriod(request.startDate(), request.endDate(), request.status());
        String statusName = request.status() == null ? "CONFIRMED" : request.status().name();
        return ApiResponse.ok(new LockByPeriodResponse(
                request.startDate(), request.endDate(), statusName, locked));
    }

    /**
     * partner-recent lookup 응답 record — Phase 10 W10-4 신규.
     *
     * @param slipId 슬립 UUID (호출자 내부 상태용)
     * @param slipNo 전표번호 (사용자 노출 식별자)
     * @param status 슬립 상태 (SIGNABLE_STATUSES 가드용 hint)
     */
    public record LookupResponse(UUID slipId, String slipNo, String status) {}

    /**
     * 배차 계열 공통 출고전표 조회.
     *
     * <p>notification-service와 arologis-service가 사용하는 기간 계약이다. 기존
     * {@code /outbound-lines} 라인 projection과 경로를 분리하고, 응답에는 UUID를 포함하지 않는다.
     *
     * @param from 조회 시작일(포함)
     * @param to 조회 종료일(포함)
     * @return 활성 OUTBOUND 전표 단위 projection
     */
    @Operation(summary = "Internal 배차용 출고전표 조회",
            description = "X-Internal-Token 인증. 활성 OUTBOUND 전표를 전표 단위로 반환하며 UUID는 포함하지 않는다.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "from/to 누락 또는 to < from"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "X-Internal-Token 불일치"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "X-Internal-Token 누락")
    })
    @GetMapping("/outbound")
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<List<OutboundSlipResponse>> findOutboundSlipsForDispatch(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        if (from == null || to == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "from/to 날짜는 필수입니다");
        }
        if (to.isBefore(from)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "to 날짜는 from 날짜 이후여야 합니다");
        }
        List<OutboundSlipResponse> rows = slipRepository
                .findByPeriodWithLines(SlipType.OUTBOUND, from, to, null)
                .stream()
                .map(OutboundSlipResponse::from)
                .toList();
        return ApiResponse.ok(rows);
    }

    /**
     * DPS 입고비교용 출고전표 라인 조회 — inventory-service DpsCompareService source.
     *
     * <p>기존 기간별 조회 query({@link SlipRepository#findByPeriodWithLines}) 를 재사용해 OUTBOUND
     * 슬립과 라인을 함께 가져온 뒤 라인 단위로 평탄화한다. productCode 는 SlipLine 에 별도 필드가
     * 없으므로 품번 snapshot 으로 쓰이는 {@code modelName} 을 내려보낸다.
     *
     * @param from 조회 시작일 (포함)
     * @param to 조회 종료일 (포함)
     * <p>경로: {@code GET /internal/slips/outbound-lines}. arologis slip-level
     * {@code /internal/slips/outbound} 계약과 충돌하지 않도록 line-level 전용 경로를 사용한다.
     *
     * @return ApiResponse wrapper 안 출고전표 라인 목록
     */
    @Operation(summary = "Internal 출고전표 라인 조회 (DPS 입고비교)",
            description = "X-Internal-Token 인증. OUTBOUND 슬립을 기간 조회 후 라인 단위로 평탄화한다.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
                    description = "조회 성공 (빈 결과는 빈 리스트)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400",
                    description = "from/to 필수 누락 또는 to < from"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401",
                    description = "X-Internal-Token 불일치"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403",
                    description = "X-Internal-Token 누락")
    })
    @GetMapping("/outbound-lines")
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<List<OutboundSlipLineResponse>> findOutboundSlips(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        if (from == null || to == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "from/to 날짜는 필수입니다");
        }
        if (to.isBefore(from)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "to 날짜는 from 날짜 이후여야 합니다");
        }

        List<OutboundSlipLineResponse> lines = slipRepository
                .findByPeriodWithLines(SlipType.OUTBOUND, from, to, null)
                .stream()
                .flatMap(slip -> slip.getLines().stream()
                        .map(line -> OutboundSlipLineResponse.from(slip, line)))
                .toList();
        return ApiResponse.ok(lines);
    }

    /**
     * 거래처별 원장용 판매전표 read projection 조회.
     *
     * <p>원장은 회계 반영 완료 목록이 아니라 거래 사실 문서이므로 CONFIRMED·DELIVERED·COMPLETED
     * 세 상태를 모두 포함한다. 기존 DPS용 {@code /outbound-lines}는 품목·수량 중심의 별도 계약이라
     * 확장하지 않고 기존 소비자를 그대로 보존한다.
     *
     * @param from 조회 시작일(포함)
     * @param to 조회 종료일(포함)
     * @param partnerCode 거래처코드, 생략 시 전체
     * @return UUID 없는 전표 단위 원장 판매전표 목록
     */
    @Operation(summary = "거래처별 원장 판매전표 조회",
            description = "X-Internal-Token 인증. CONFIRMED/DELIVERED/COMPLETED OUTBOUND 전표와 품목을 조회한다.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
                    description = "조회 성공 (빈 결과는 빈 리스트)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400",
                    description = "from/to 누락 또는 to < from"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401",
                    description = "X-Internal-Token 불일치"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403",
                    description = "X-Internal-Token 누락")
    })
    @GetMapping("/partner-ledger-sales")
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<List<PartnerLedgerSalesResponse>> findPartnerLedgerSales(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String partnerCode) {
        if (from == null || to == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "from/to 날짜는 필수입니다");
        }
        if (to.isBefore(from)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "to 날짜는 from 날짜 이후여야 합니다");
        }

        String normalizedPartnerCode = partnerCode == null || partnerCode.isBlank()
                ? null
                : partnerCode.trim();
        List<PartnerLedgerSalesResponse> rows = slipRepository.findPartnerLedgerSales(
                        from, to, normalizedPartnerCode, PARTNER_LEDGER_SALES_STATUSES)
                .stream()
                .map(PartnerLedgerSalesResponse::from)
                .toList();
        return ApiResponse.ok(rows);
    }

    // ---- SP-SAS-1 Task 7 — accounting-service cross-service read-only contract ----

    /**
     * Internal 전표 라인 전체 조회 — accounting-service 매출전표 생성 시 검증용.
     *
     * <p>slip-service 의 {@link Slip#getLines()} 를 SlipLineSnapshot 리스트로 변환하여 반환.
     * CONFIRMED 상태 + 매출=OUTBOUND/매입=INBOUND source 검증은 호출자 책임.
     *
     * @param slipId 전표 UUID
     * @return SlipLineSnapshot 리스트
     */
    @Operation(summary = "Internal 전표 라인 전체 조회 (SP-SAS-1 Task 7 — accounting-service)",
            description = "X-Internal-Token 인증. accounting-service 매출전표 생성 시 검증/매핑용.")
    @GetMapping("/{slipId}/lines")
    @PreAuthorize("hasRole('MASTER')")
    public List<SlipLineSnapshot> getSlipLines(@PathVariable UUID slipId) {
        Slip slip = slipRepository.findByIdWithLines(slipId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "slip not found: " + slipId));
        return slip.getLines().stream()
                .map(line -> toSnapshot(slip, line))
                .toList();
    }

    /**
     * Internal 전표 라인 단건 조회 — accounting-service 라인 단건 검증용.
     *
     * <p>slip-service {@link SlipLineRepository#findByIdWithSlip(UUID)} 로 lineId 단건 조회 시
     * 소속 Slip 을 fetch-join 한 뒤
     * SlipLineSnapshot 으로 변환하여 반환.
     *
     * @param lineId 라인 UUID
     * @return SlipLineSnapshot 단건
     */
    @Operation(summary = "Internal 전표 라인 단건 조회 (SP-SAS-1 Task 7 — accounting-service)",
            description = "X-Internal-Token 인증. accounting-service 라인 단건 검증용. "
                    + "URL: /internal/slips/lines/{lineId}.")
    @GetMapping("/lines/{lineId}")
    @PreAuthorize("hasRole('MASTER')")
    public SlipLineSnapshot getSlipLine(@PathVariable UUID lineId) {
        SlipLine line = slipLineRepository.findByIdWithSlip(lineId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "slip line not found: " + lineId));
        return toSnapshot(line.getSlip(), line);
    }

    @Operation(summary = "Internal 기간별 전표 라인 검색 (SP-SAS-5)",
            description = "X-Internal-Token 인증. 회계 전표 배분 source 선택용 Slip + line 요약 반환.")
    @GetMapping("/by-period")
    @PreAuthorize("hasRole('MASTER')")
    public List<SlipSummary> findByPeriod(
            @RequestParam SlipType type,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) UUID partnerId) {
        return slipRepository.findByPeriodWithLines(type, from, to, partnerId)
                .stream()
                .map(SlipSummary::of)
                .toList();
    }

    /**
     * SlipLine → SlipLineSnapshot 변환 헬퍼.
     *
     * @param slip 전표 헤더 (라인과 연관된 Slip entity)
     * @param line 전표 라인 entity
     * @return SlipLineSnapshot
     */
    private static SlipLineSnapshot toSnapshot(Slip slip, SlipLine line) {
        // SAS 표준 = VAT-inclusive 단가 (사용자 결정 2026-05-19).
        // SlipLine.unitPriceWithVat 사용 + lineTotal 도 VAT 포함 재계산.
        java.math.BigDecimal unitPriceWithVat = line.getUnitPriceWithVat();
        java.math.BigDecimal lineTotalWithVat = unitPriceWithVat
                .multiply(java.math.BigDecimal.valueOf(line.getQuantity()));
        return new SlipLineSnapshot(
                slip.getId(),
                slip.getSlipNo(),
                line.getId(),
                slip.getPartnerId(),
                slip.getPartnerCode(),
                slip.getPartnerName(),
                line.getProductName(),
                line.getModelName(),
                line.getSourceOrderLineId(),
                line.getCategoryKey(),
                line.getQuantity(),
                unitPriceWithVat,
                lineTotalWithVat,
                slip.getStatus().name(),
                slip.getSlipType().name());
    }

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
     * sourceWarehouseName 은 driver-facing 사본/상세 표시용 공개명이다. 내부 창고 UUID 는 노출하지 않는다.
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
            // 창고명 조회가 없는 internal 사본 경로에서는 UUID 대신 중립 표시명을 내려보낸다.
            String warehouseName = slip.getSourceWarehouseId() != null
                    ? "창고명 확인 필요"
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
