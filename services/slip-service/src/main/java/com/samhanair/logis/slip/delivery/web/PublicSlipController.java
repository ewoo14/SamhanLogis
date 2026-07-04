package com.samhanair.logis.slip.delivery.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.delivery.service.DeliveryBatchService;
import com.samhanair.logis.slip.delivery.web.dto.PublicBatchResponse;
import com.samhanair.logis.slip.delivery.web.dto.PublicSignatureRequest;
import com.samhanair.logis.slip.delivery.web.dto.PublicSignatureResponse;
import com.samhanair.logis.slip.delivery.web.dto.PublicSignatureViewResponse;
import com.samhanair.logis.slip.service.SlipSignatureService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 공개 모바일 endpoint — Plan §4.2.
 * 인증 없음 (API Gateway 의 {@code /api/public/**} 라우트가 JwtAuthentication 필터 미적용 +
 * slip-service {@link com.samhanair.logis.slip.config.SecurityConfig} 의 {@code /public/**}
 * permitAll). 토큰만 검증.
 *
 * <p>UUID 비공개 가드 (memory {@code feedback_uuid_no_user_visibility.md}):
 * 응답에 slip.id / batch.id UUID 노출 금지. 본 controller 는 {@link PublicBatchResponse}
 * (slipNo / partnerName / lineCount / status 만) 를 반환.
 *
 * <p>토큰 만료 시 {@link DeliveryBatchService#findByToken} 가 CONFLICT BusinessException 을
 * 던지므로 본 controller 가 410 GONE 으로 매핑한다 (Plan §8 권한 모델).
 */
@RestController
@RequestMapping("/public")
@RequiredArgsConstructor
public class PublicSlipController {

    private final DeliveryBatchService batchService;
    private final SlipSignatureService signatureService;

    /** 모바일 배치 read-only 조회 (no auth). */
    @Operation(summary = "공개 모바일 배치 조회",
            description = "토큰 검증 + 슬립 N건 read-only. 만료 시 410 GONE")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "토큰 미발견"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "410", description = "토큰 만료")
    })
    @GetMapping("/batches/{token}")
    public ResponseEntity<ApiResponse<PublicBatchResponse>> getBatch(@PathVariable String token) {
        try {
            PublicBatchResponse body = batchService.findByToken(token);
            return ResponseEntity.ok(ApiResponse.ok(body));
        } catch (BusinessException ex) {
            // CONFLICT 는 만료 — 410 GONE 으로 변환 (Plan §8)
            if (ex.getErrorCode() == ErrorCode.CONFLICT) {
                return ResponseEntity.status(HttpStatus.GONE)
                        .body(ApiResponse.fail(ErrorCode.CONFLICT, ex.getMessage()));
            }
            // NOT_FOUND 는 그대로 다시 던져 GlobalExceptionHandler 가 처리
            throw ex;
        }
    }

    /**
     * 모바일 인수자 서명 등록 (no auth) — Slice C (signature-slice-C Plan §2).
     *
     * <p>경로: {@code POST /public/batches/{token}/slips/{slipNo}/signature}.
     * batch token + slipNo 검증 후 PNG bytes 의 SHA-256 재계산 + 클라이언트 hash 비교 +
     * 50KB 가드 + Slip.recordSignature 도메인 메서드 위임 + audit INSERT.
     *
     * <p>UUID 비공개: 응답에 slip.id 미포함 — shareToken 만 반환.
     *
     * @param slipNo 전표번호 ({@code 2026/05/05-1} 또는 {@code 2026-05-05-1} slug 형식 모두 허용)
     */
    @Operation(summary = "공개 모바일 서명 등록",
            description = "Canvas PNG + SHA-256 서명 저장. 50KB 초과 또는 hash mismatch 시 400. "
                    + "PROCESSING 미만 단계 서명 시도 시 409. 토큰 만료 시 410 GONE")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
                    description = "서명 저장 성공 + shareToken 발급"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400",
                    description = "hash mismatch 또는 PNG 50KB 초과"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404",
                    description = "토큰/슬립 미발견"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409",
                    description = "슬립 단계 미충족 (INSPECTING/COMPLETED/SHIPPING 만 허용)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "410",
                    description = "batch token 만료")
    })
    @PostMapping("/batches/{token}/slips/{slipNo}/signature")
    public ResponseEntity<ApiResponse<PublicSignatureResponse>> recordSignature(
            @PathVariable String token,
            @PathVariable String slipNo,
            @Valid @RequestBody PublicSignatureRequest request) {
        try {
            PublicSignatureResponse body = signatureService.recordSignature(token, slipNo, request);
            return ResponseEntity.ok(ApiResponse.ok(body));
        } catch (BusinessException ex) {
            if (ex.getErrorCode() == ErrorCode.CONFLICT && ex.getMessage() != null
                    && ex.getMessage().contains("토큰이 만료")) {
                return ResponseEntity.status(HttpStatus.GONE)
                        .body(ApiResponse.fail(ErrorCode.CONFLICT, ex.getMessage()));
            }
            throw ex;
        }
    }

    /**
     * 배송기사 서명 등록 (no auth) — Slice C2 (PR #23 follow-up).
     *
     * <p>경로: {@code POST /public/batches/{token}/slips/{slipNo}/driver-signature}.
     * 인수자 서명({@link #recordSignature})과 동일 패턴, 차이: signerName 입력 X
     * (Slip.driverName 재사용), share token 발급 X.
     *
     * @param slipNo 전표번호 ({@code 2026/05/05-1} 또는 {@code 2026-05-05-1} slug 형식 모두 허용)
     */
    @PostMapping("/batches/{token}/slips/{slipNo}/driver-signature")
    public ResponseEntity<ApiResponse<com.samhanair.logis.slip.delivery.web.dto.PublicDriverSignatureResponse>>
            recordDriverSignature(
                    @PathVariable String token,
                    @PathVariable String slipNo,
                    @Valid @RequestBody com.samhanair.logis.slip.delivery.web.dto.PublicDriverSignatureRequest request) {
        try {
            var body = signatureService.recordDriverSignature(token, slipNo, request);
            return ResponseEntity.ok(ApiResponse.ok(body));
        } catch (BusinessException ex) {
            if (ex.getErrorCode() == ErrorCode.CONFLICT && ex.getMessage() != null
                    && ex.getMessage().contains("토큰이 만료")) {
                return ResponseEntity.status(HttpStatus.GONE)
                        .body(ApiResponse.fail(ErrorCode.CONFLICT, ex.getMessage()));
            }
            throw ex;
        }
    }

    /**
     * 인수자 view 조회 (no auth) — Slice C (signature-slice-C Plan §2).
     *
     * <p>경로: {@code GET /public/signatures/{shareToken}}.
     * 인수자에게 공유된 share token 으로 슬립 핵심 + 서명 PNG 표시. UUID 미노출.
     * +30일 만료 후 410 GONE.
     */
    @Operation(summary = "인수자 view 조회",
            description = "shareToken 검증 후 슬립 핵심 + 서명 PNG read-only 반환. "
                    + "미서명 슬립 또는 토큰 미발견 시 404. 30일 만료 후 410 GONE")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "토큰 미발견 또는 미서명"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "410", description = "토큰 만료")
    })
    @GetMapping("/signatures/{shareToken}")
    public ResponseEntity<ApiResponse<PublicSignatureViewResponse>> getSignatureView(
            @PathVariable String shareToken) {
        try {
            PublicSignatureViewResponse body = signatureService.findByShareToken(shareToken);
            return ResponseEntity.ok(ApiResponse.ok(body));
        } catch (BusinessException ex) {
            if (ex.getErrorCode() == ErrorCode.CONFLICT) {
                return ResponseEntity.status(HttpStatus.GONE)
                        .body(ApiResponse.fail(ErrorCode.CONFLICT, ex.getMessage()));
            }
            throw ex;
        }
    }
}
