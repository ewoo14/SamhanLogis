package com.samhanair.logis.accounting.web.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 로고 등록/교체 요청 DTO — {@code PUT /{id}/logo}.
 *
 * <p>클라이언트는 PNG 파일을 Base64 인코딩하여 전송한다.
 * 서비스 레이어에서 base64 디코드 후:
 * <ol>
 *   <li>200KB 초과 가드 검증</li>
 *   <li>PNG magic bytes(89 50 4E 47 0D 0A 1A 0A) 검증</li>
 *   <li>SHA-256 재계산 후 {@code logoHash} 와 일치 검증 (mismatch → 400)</li>
 * </ol>
 *
 * <p>인감 등록 요청({@link UpdateStampRequest})과 동일 패턴.
 */
@Schema(description = "로고 등록 요청")
public record UpdateLogoRequest(

        @Schema(description = "Base64 인코딩된 PNG 바이너리 (≤ 200KB). 200KB 바이너리의 base64 ≈ 273,068자",
                example = "iVBORw0KGgoAAAAN...")
        @NotBlank(message = "로고 PNG Base64 는 필수입니다")
        @Size(max = 280_000, message = "로고 PNG Base64 는 280,000자(200KB 바이너리 상한)를 초과할 수 없습니다")
        String logoPngBase64,

        @Schema(description = "PNG 의 SHA-256 소문자 hex (64자)", example = "a7ffc6f8bf1ed760...")
        @NotBlank(message = "logoHash 는 필수입니다")
        @Size(min = 64, max = 64, message = "logoHash 는 SHA-256 소문자 hex 64자여야 합니다")
        String logoHash

) {}
