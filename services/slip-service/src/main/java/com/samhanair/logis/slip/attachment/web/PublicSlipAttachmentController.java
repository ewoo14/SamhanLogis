package com.samhanair.logis.slip.attachment.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.attachment.domain.SlipAttachmentType;
import com.samhanair.logis.slip.attachment.service.SlipAttachmentService;
import com.samhanair.logis.slip.attachment.web.dto.SlipAttachmentResponse;
import com.samhanair.logis.slip.delivery.domain.DeliveryBatch;
import com.samhanair.logis.slip.delivery.repository.DeliveryBatchRepository;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.repository.SlipRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * 공개 모바일 첨부 업로드 endpoint — P1-8 (Stage 4) mobile-staff 기사 업로드 경로.
 *
 * <p>인증 없음 (no auth) — DeliveryBatch token + slipNo 검증만. SecurityConfig 의 {@code /public/**}
 * permitAll 적용. 기사가 driver mode 에서 정차 도착 시 사진 직접 업로드.
 *
 * <p>토큰 만료 시 410 GONE (PublicSlipController 패턴 일관).
 *
 * <p>UUID 비공개 — 응답에 attachmentId UUID 포함하지만 mobile-staff 자체 사용 (사용자 화면 노출 X).
 */
@RestController
@RequestMapping("/public/batches/{token}/slips/{slipNo}/attachments")
@RequiredArgsConstructor
public class PublicSlipAttachmentController {

    private final DeliveryBatchRepository batchRepository;
    private final SlipRepository slipRepository;
    private final SlipAttachmentService attachmentService;

    /**
     * 기사 사진 업로드 (no auth, multipart/form-data) — token + slipNo 검증.
     *
     * <p>업로더 user-id = "driver" (gateway 인증 우회 — 후속 driver-id 클레임 도입 시 강화).
     * 첨부 유형은 default {@link SlipAttachmentType#DELIVERY} 강제 (기사는 배송 사진만 업로드).
     *
     * @return 200, 업로드된 첨부 응답 (uploadedAt + downloadUrl 캐시 포함)
     */
    @Operation(summary = "공개 모바일 기사 첨부 업로드",
            description = "DeliveryBatch token + slipNo 검증 후 사진 업로드. attachmentType=DELIVERY 강제")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "업로드 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "파일 크기/형식 미허용"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "토큰/슬립 미발견"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "410", description = "토큰 만료")
    })
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<SlipAttachmentResponse>> upload(
            @PathVariable String token,
            @PathVariable String slipNo,
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "exifGpsLat", required = false) BigDecimal exifGpsLat,
            @RequestParam(value = "exifGpsLng", required = false) BigDecimal exifGpsLng,
            @RequestParam(value = "capturedAt", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime capturedAt) {
        DeliveryBatch batch = batchRepository.findByBatchToken(token)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "유효하지 않은 토큰입니다"));
        if (batch.isExpired()) {
            return ResponseEntity.status(HttpStatus.GONE)
                    .body(ApiResponse.fail(ErrorCode.CONFLICT, "토큰이 만료되었습니다"));
        }
        String canonicalSlipNo = canonicalSlipNo(slipNo);
        Slip slip = slipRepository.findBySlipTypeAndSlipNoAndIsDeletedFalse(SlipType.OUTBOUND, canonicalSlipNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "슬립을 찾을 수 없습니다: " + slipNo));
        // 본 슬립이 해당 batch 에 속해야 함 (cross-token 업로드 차단)
        if (slip.getDeliveryBatchId() == null
                || !slip.getDeliveryBatchId().equals(batch.getId())) {
            throw new BusinessException(ErrorCode.NOT_FOUND,
                    "본 배치에 속하지 않는 슬립입니다");
        }

        SlipAttachmentResponse body = SlipAttachmentResponse.from(
                attachmentService.upload(slip.getId(), SlipAttachmentType.DELIVERY,
                        file, exifGpsLat, exifGpsLng, capturedAt, "driver"));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(body));
    }

    /**
     * URL path 전용 하이픈 slug 를 저장 표준 슬래시 전표번호로 복원한다.
     *
     * <p>저장/화면 표준은 {@code yyyy/MM/dd-N} 이고, URL path 에서는 FE 가
     * {@code yyyy-MM-dd-N} 단일 세그먼트로 보낸다. 날짜 영역의 첫 두 하이픈만 슬래시로
     * 되돌리고 순번 구분 하이픈은 유지한다.
     */
    private static String canonicalSlipNo(String slipNo) {
        if (slipNo == null || slipNo.length() < 12) {
            return slipNo;
        }
        if (slipNo.charAt(4) == '-' && slipNo.charAt(7) == '-') {
            return slipNo.substring(0, 4) + "/" + slipNo.substring(5, 7) + "/" + slipNo.substring(8);
        }
        return slipNo;
    }
}
