package com.samhanair.logis.accounting.web.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 사업자 프로필 신규 등록 요청 DTO.
 *
 * <p>Bean Validation 제약:
 * <ul>
 *   <li>{@code businessNumber}: 숫자 10자리 정규식 필수</li>
 *   <li>{@code companyName}, {@code representativeName}, {@code businessAddress}: 필수 + 길이 제한</li>
 *   <li>{@code email}: 이메일 형식 (nullable)</li>
 * </ul>
 */
@Schema(description = "사업자 프로필 신규 등록 요청")
public record CreateSupplierProfileRequest(

        @Schema(description = "사업자등록번호 (숫자 10자리)", example = "2148720659")
        @NotBlank(message = "사업자등록번호는 필수입니다")
        @Pattern(regexp = "\\d{10}", message = "사업자등록번호는 숫자 10자리여야 합니다")
        String businessNumber,

        @Schema(description = "종사업장번호 (숫자 4자리, 없으면 null 또는 빈값)", example = "null")
        @Pattern(regexp = "\\d{4}", message = "종사업장번호는 숫자 4자리여야 합니다")
        String subBusinessNumber,

        @Schema(description = "상호", example = "（주）삼한공조시스템")
        @NotBlank(message = "상호는 필수입니다")
        @Size(max = 100, message = "상호는 최대 100자입니다")
        String companyName,

        @Schema(description = "대표 성명", example = "김미선")
        @NotBlank(message = "대표 성명은 필수입니다")
        @Size(max = 50, message = "대표 성명은 최대 50자입니다")
        String representativeName,

        @Schema(description = "사업장 주소 (최대 500자)", example = "서울특별시 서초구 마방로2길 9, 4층(양재동)")
        @NotBlank(message = "사업장 주소는 필수입니다")
        @Size(max = 500, message = "사업장 주소는 최대 500자입니다")
        String businessAddress,

        @Schema(description = "업태 (최대 50자)", example = "도소매")
        @Size(max = 50, message = "업태는 최대 50자입니다")
        String businessType,

        @Schema(description = "종목 (최대 50자)", example = "가전제품")
        @Size(max = 50, message = "종목은 최대 50자입니다")
        String businessItem,

        @Schema(description = "사업자 이메일", example = "apjog09@daum.net")
        @Email(message = "올바른 이메일 형식이어야 합니다")
        @Size(max = 100, message = "이메일은 최대 100자입니다")
        String email,

        @Schema(description = "기본 사업자 여부 (true 면 기존 primary 해제 후 설정)")
        boolean isPrimary

) {}
