package com.samhanair.logis.accounting.web.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 인감 등록/교체 요청 DTO — {@code PUT /{id}/stamp}.
 *
 * <p>클라이언트는 PNG 파일을 Base64 인코딩하여 전송한다.
 * 서비스 레이어에서 base64 디코드 후:
 * <ol>
 *   <li>200KB 초과 가드 검증</li>
 *   <li>SHA-256 재계산 후 {@code stampHash} 와 일치 검증 (mismatch → 400)</li>
 * </ol>
 */
@Schema(description = "인감 등록 요청")
public record UpdateStampRequest(

        @Schema(description = "Base64 인코딩된 PNG 바이너리 (≤ 200KB). 200KB 바이너리의 base64 ≈ 273,068자",
                example = "iVBORw0KGgoAAAAN...")
        @NotBlank(message = "인감 PNG Base64 는 필수입니다")
        @Size(max = 280_000, message = "인감 PNG Base64 는 280,000자(200KB 바이너리 상한)를 초과할 수 없습니다")
        String stampPngBase64,

        @Schema(description = "PNG 의 SHA-256 소문자 hex (64자)", example = "a7ffc6f8bf1ed760...")
        @NotBlank(message = "stampHash 는 필수입니다")
        @Size(min = 64, max = 64, message = "stampHash 는 SHA-256 소문자 hex 64자여야 합니다")
        String stampHash

) {}
