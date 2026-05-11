package com.samhanair.logis.slip.attachment.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.attachment.domain.SlipAttachmentType;
import com.samhanair.logis.slip.attachment.service.SlipAttachmentService;
import com.samhanair.logis.slip.attachment.web.dto.SlipAttachmentResponse;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.repository.SlipRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * 배송 완료 사진 첨부 전용 endpoint — P1 (배송 완료 사진 첨부).
 *
 * <p>매뉴얼 출처: {@code docs/manual/04-모바일/04-사진-첨부.md} §배송 완료 사진 첨부.
 *
 * <p>기존 {@link SlipAttachmentController} ({@code /slips/{slipId}/attachments}) 와 분리.
 * 본 endpoint 는 배송 완료(DELIVERED / SHIPPING) 상태 슬립 전용으로 첨부 유형을
 * {@link SlipAttachmentType#DELIVERY} 로 강제하고 DRIVER 권한을 추가로 허용.
 *
 * <p>허용 상태: DELIVERED + SHIPPING + COMPLETED + CONFIRMED (배송 완료 이후 상태 포함 — 사후 증빙 추가 허용).
 *
 * <p>권한: DRIVER / SALES / MANAGER / MASTER
 */
@RestController
@RequestMapping("/slips/{slipId}/delivery-attachments")
@RequiredArgsConstructor
public class DeliveryAttachmentController {

    /** 배송 사진 업로드 허용 슬립 상태 집합 (배송 시점 이후 모든 상태). */
    private static final Set<SlipStatus> DELIVERY_PHOTO_ALLOWED_STATUSES = Set.of(
            SlipStatus.SHIPPING,
            SlipStatus.DELIVERED,
            SlipStatus.COMPLETED,
            SlipStatus.CONFIRMED
    );

    private static final String CALLER_HEADER = "X-User-Id";

    private final SlipRepository slipRepository;
    private final SlipAttachmentService attachmentService;

    /**
     * 배송 완료 사진 업로드 (multipart/form-data).
     *
     * <p>업로드 유형은 {@link SlipAttachmentType#DELIVERY} 로 자동 설정 (강제).
     * 슬립 상태가 SHIPPING / DELIVERED / COMPLETED / CONFIRMED 중 하나여야 한다.
     *
     * <p>form 필드:
     * <ul>
     *   <li>{@code file} — multipart 파일 (≤5MB, image/jpeg / image/png / application/pdf)</li>
     *   <li>{@code exifGpsLat} / {@code exifGpsLng} — EXIF GPS (선택)</li>
     *   <li>{@code capturedAt} — EXIF 촬영 시각 (선택, ISO-8601)</li>
     * </ul>
     *
     * @param slipId       대상 Slip UUID
     * @param file         multipart 사진 파일
     * @param exifGpsLat   EXIF GPS 위도 (선택)
     * @param exifGpsLng   EXIF GPS 경도 (선택)
     * @param capturedAt   EXIF 촬영 시각 (선택)
     * @param callerHeader X-User-Id 헤더
     * @return 201 + SlipAttachmentResponse
     */
    @Operation(summary = "배송 완료 사진 업로드",
            description = "DRIVER/SALES/MANAGER/MASTER 권한. 슬립 상태 SHIPPING·DELIVERED·COMPLETED·CONFIRMED 에서만 허용. "
                    + "첨부 유형 DELIVERY 강제. ≤5MB, image/jpeg·png·pdf")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "업로드 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "파일 크기/형식 미허용"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "권한 없음"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "슬립 미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "배송 단계 전 슬립 (상태 불일치)")
    })
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('DRIVER','SALES','MANAGER','MASTER')")
    public ApiResponse<SlipAttachmentResponse> upload(
            @PathVariable UUID slipId,
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "exifGpsLat", required = false) BigDecimal exifGpsLat,
            @RequestParam(value = "exifGpsLng", required = false) BigDecimal exifGpsLng,
            @RequestParam(value = "capturedAt", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime capturedAt,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {

        // 슬립 상태 가드 — 배송 이후 상태에서만 허용
        Slip slip = slipRepository.findById(slipId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "슬립을 찾을 수 없습니다: " + slipId));
        if (!DELIVERY_PHOTO_ALLOWED_STATUSES.contains(slip.getStatus())) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "배송 단계(SHIPPING/DELIVERED/COMPLETED/CONFIRMED) 가 아닌 슬립에는 배송 사진을 첨부할 수 없습니다."
                            + " 현재 상태: " + slip.getStatus());
        }

        String uploaderId = callerOrSystem(callerHeader);
        return ApiResponse.ok(SlipAttachmentResponse.from(
                attachmentService.upload(slipId, SlipAttachmentType.DELIVERY,
                        file, exifGpsLat, exifGpsLng, capturedAt, uploaderId)));
    }

    /**
     * 슬립별 배송 사진 목록 (DELIVERY 유형만 필터).
     *
     * @param slipId 대상 Slip UUID
     * @return DELIVERY 유형 첨부 목록 (업로드 시각 오름차순)
     */
    @Operation(summary = "배송 사진 목록 조회",
            description = "슬립의 DELIVERY 유형 첨부만 반환. downloadUrl 은 캐시(만료 가능 — 단건 GET 으로 재발급)")
    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<List<SlipAttachmentResponse>> list(@PathVariable UUID slipId) {
        List<SlipAttachmentResponse> items =
                attachmentService.listByType(slipId, SlipAttachmentType.DELIVERY).stream()
                        .map(SlipAttachmentResponse::from)
                        .toList();
        return ApiResponse.ok(items);
    }

    private String callerOrSystem(String header) {
        return (header == null || header.isBlank()) ? "system" : header;
    }
}
