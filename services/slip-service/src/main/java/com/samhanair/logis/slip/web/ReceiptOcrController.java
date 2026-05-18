package com.samhanair.logis.slip.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.service.ReceiptOcrParseService;
import com.samhanair.logis.slip.web.dto.ReceiptParseResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * 영수증 OCR 파싱 + 매입 전표 자동 생성 엔드포인트 (SP-09-3).
 *
 * <p>권한: WAREHOUSE/MANAGER/MASTER — 매입(입고) 처리 권한 보유 역할만 접근 (SP-03 §4.2).
 *
 * <p>파일 유효성 가드:
 * <ul>
 *   <li>빈 파일 → 422 (RECEIPT_FILE_INVALID)</li>
 *   <li>10MB 초과 → 422 (RECEIPT_FILE_INVALID)</li>
 *   <li>jpg/png/jpeg 외 포맷 → 422 (RECEIPT_FILE_INVALID)</li>
 * </ul>
 *
 * <p>OCR 오류 → 502 (OCR_SUBMIT_FAILED).
 */
@RestController
@RequestMapping("/slips")
@RequiredArgsConstructor
@Tag(name = "영수증 OCR", description = "영수증 이미지 업로드 → OCR 파싱 → 매입 전표 자동 생성 (SP-09-3)")
public class ReceiptOcrController {

    /** 최대 허용 파일 크기: 10MB. */
    private static final long MAX_FILE_SIZE_BYTES = 10L * 1024 * 1024;

    /** 허용 Content-Type 접두사. */
    private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of(
            "image/jpeg", "image/jpg", "image/png");

    /** 허용 파일 확장자 (소문자). */
    private static final Set<String> ALLOWED_EXTENSIONS = Set.of("jpg", "jpeg", "png");

    private final ReceiptOcrParseService receiptOcrParseService;

    /**
     * 영수증 이미지를 OCR 로 파싱하고 매입 전표 DRAFT 를 자동 생성한다.
     *
     * <p>처리 흐름:
     * <ol>
     *   <li>파일 유효성 검사 (빈 파일 / 10MB 초과 / 비지원 포맷 → 422)</li>
     *   <li>{@code submitMethod} 결정 (파라미터 우선, null 이면 서버 property fallback)</li>
     *   <li>{@link ReceiptOcrParseService#parseAndDraft} 호출</li>
     *   <li>DRAFT 전표 정보 + OCR 결과 응답</li>
     * </ol>
     *
     * @param file         영수증 이미지 파일 (jpg/png/jpeg, ≤10MB)
     * @param submitMethod OCR 전송 방식 ("DRY_RUN" 기본 | "CLOVA" Phase 11 실 API). null 허용.
     * @param userIdHeader X-User-Id 헤더 (gateway 주입)
     * @return OCR 파싱 결과 + 자동 생성된 전표 정보
     * @throws BusinessException(RECEIPT_FILE_INVALID) 빈 파일 / 10MB 초과 / 비지원 포맷
     * @throws BusinessException(OCR_SUBMIT_FAILED)    CLOVA placeholder 차단 또는 API 오류
     */
    @PostMapping(value = "/receipt-ocr", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('WAREHOUSE','MANAGER','MASTER')")
    @Operation(summary = "영수증 OCR 파싱 + 매입 전표 자동 생성",
            description = "영수증 이미지(jpg/png, ≤10MB)를 업로드하면 OCR 로 파싱 후 매입 전표 DRAFT 를 자동 생성합니다. "
                    + "submitMethod=DRY_RUN(기본) 은 즉시 mock 응답, CLOVA 는 Phase 11 실 API 연동 예정.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201",
                    description = "OCR 파싱 + DRAFT 전표 생성 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403",
                    description = "권한 없음 (WAREHOUSE/MANAGER/MASTER 만 허용)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "422",
                    description = "파일 유효성 오류 (빈 파일 / 10MB 초과 / 비지원 포맷)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "502",
                    description = "OCR API 호출 실패 (CLOVA 모드에서 placeholder 키 차단 또는 API 오류)")
    })
    public ApiResponse<ReceiptParseResponse> parseReceipt(
            @Parameter(description = "영수증 이미지 파일 (jpg/png, ≤10MB)")
            @RequestParam("file") MultipartFile file,

            @Parameter(description = "OCR 전송 방식: DRY_RUN (기본, mock) | CLOVA (Phase 11 실 API)",
                    example = "DRY_RUN")
            @RequestParam(value = "submitMethod", required = false) String submitMethod,

            @RequestHeader(value = "X-User-Id", required = false) String userIdHeader) {

        // 파일 유효성 검사 — Controller 레이어 가드 (422)
        validateFile(file);

        UUID actorId = parseActorId(userIdHeader);

        ReceiptParseResponse response = receiptOcrParseService.parseAndDraft(
                file, submitMethod, actorId);

        return ApiResponse.ok(response);
    }

    /**
     * 업로드 파일 유효성 검사.
     *
     * <ul>
     *   <li>null 또는 빈 파일 → 422</li>
     *   <li>10MB 초과 → 422</li>
     *   <li>Content-Type 이 image/jpeg, image/jpg, image/png 가 아닌 경우 → 422</li>
     *   <li>파일명 확장자가 jpg/jpeg/png 가 아닌 경우 → 422</li>
     * </ul>
     *
     * @param file 검사할 파일
     * @throws BusinessException(RECEIPT_FILE_INVALID) 유효성 실패 시
     */
    private void validateFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.RECEIPT_FILE_INVALID,
                    "영수증 파일이 비어있습니다.");
        }
        if (file.getSize() > MAX_FILE_SIZE_BYTES) {
            throw new BusinessException(ErrorCode.RECEIPT_FILE_INVALID,
                    "파일 크기가 10MB 를 초과합니다. 현재 크기: " + file.getSize() + " bytes");
        }
        // Content-Type 검사
        String contentType = file.getContentType();
        if (contentType != null && !ALLOWED_CONTENT_TYPES.contains(contentType.toLowerCase())) {
            throw new BusinessException(ErrorCode.RECEIPT_FILE_INVALID,
                    "지원하지 않는 파일 형식입니다. jpg/png 이미지만 허용합니다. 수신 타입: " + contentType);
        }
        // 확장자 검사
        String originalFilename = file.getOriginalFilename();
        if (originalFilename != null) {
            String ext = getExtension(originalFilename).toLowerCase();
            if (!ALLOWED_EXTENSIONS.contains(ext)) {
                throw new BusinessException(ErrorCode.RECEIPT_FILE_INVALID,
                        "지원하지 않는 파일 확장자입니다. jpg/png 만 허용합니다. 확장자: " + ext);
            }
        }
    }

    /**
     * 파일명에서 확장자를 추출한다.
     *
     * @param filename 원본 파일명
     * @return 확장자 (dot 제외). 확장자 없으면 빈 문자열.
     */
    private String getExtension(String filename) {
        int dotIdx = filename.lastIndexOf('.');
        return dotIdx >= 0 ? filename.substring(dotIdx + 1) : "";
    }

    /**
     * X-User-Id 헤더에서 UUID 를 파싱한다.
     *
     * <p>null 또는 유효하지 않은 UUID 이면 null 반환 (서비스 레이어에서 시스템 계정 처리).
     *
     * @param userIdHeader X-User-Id 헤더 값
     * @return 파싱된 UUID 또는 null
     */
    private UUID parseActorId(String userIdHeader) {
        if (userIdHeader == null || userIdHeader.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(userIdHeader);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
