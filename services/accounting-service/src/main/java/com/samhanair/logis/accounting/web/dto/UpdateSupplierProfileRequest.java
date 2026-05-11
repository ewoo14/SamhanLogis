package com.samhanair.logis.accounting.web.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 사업자 프로필 수정 요청 DTO.
 *
 * <p>null 필드는 기존 값을 유지한다 (부분 업데이트 패턴).
 * 단, {@code businessType}, {@code businessItem}, {@code email} 은
 * null 전달 시 명시적으로 null 로 설정된다.
 */
@Schema(description = "사업자 프로필 수정 요청 (null 필드는 기존 값 유지)")
public record UpdateSupplierProfileRequest(

        @Schema(description = "사업자등록번호 (숫자 10자리, null 이면 기존 유지)", example = "2148720659")
        @Pattern(regexp = "\\d{10}", message = "사업자등록번호는 숫자 10자리여야 합니다")
        String businessNumber,

        @Schema(description = "종사업장번호 (숫자 4자리, null 이면 기존 유지)", example = "null")
        @Pattern(regexp = "\\d{4}", message = "종사업장번호는 숫자 4자리여야 합니다")
        String subBusinessNumber,

        @Schema(description = "상호 (null 이면 기존 유지)", example = "（주）삼한공조시스템")
        @Size(max = 100, message = "상호는 최대 100자입니다")
        String companyName,

        @Schema(description = "대표 성명 (null 이면 기존 유지)", example = "김미선")
        @Size(max = 50, message = "대표 성명은 최대 50자입니다")
        String representativeName,

        @Schema(description = "사업장 주소 (null 이면 기존 유지)", example = "서울특별시 서초구 마방로2길 9, 4층(양재동)")
        @Size(max = 500, message = "사업장 주소는 최대 500자입니다")
        String businessAddress,

        @Schema(description = "업태 (null 이면 null 로 설정)", example = "도소매")
        @Size(max = 50, message = "업태는 최대 50자입니다")
        String businessType,

        @Schema(description = "종목 (null 이면 null 로 설정)", example = "가전제품")
        @Size(max = 50, message = "종목은 최대 50자입니다")
        String businessItem,

        @Schema(description = "사업자 이메일 (null 이면 null 로 설정)", example = "apjog09@daum.net")
        @Email(message = "올바른 이메일 형식이어야 합니다")
        @Size(max = 100, message = "이메일은 최대 100자입니다")
        String email

) {}
