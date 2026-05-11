package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.SupplierProfile;
import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 사업자 프로필 응답 DTO.
 *
 * <p>UUID 비공개 원칙(feedback_uuid_no_user_visibility) 준수 —
 * id 는 내부 수정/삭제 endpoint 경로용으로만 사용하며 화면 목록 식별에는
 * {@link #businessNumber} 와 {@link #companyName} 을 사용한다.
 */
@Schema(description = "사업자 프로필 응답")
public record SupplierProfileResponse(

        @Schema(description = "내부 UUID (수정/삭제 API 경로용)")
        String id,

        @Schema(description = "사업자등록번호 (10자리)", example = "2148720659")
        String businessNumber,

        @Schema(description = "종사업장번호 (4자리, 없으면 null)", example = "null")
        String subBusinessNumber,

        @Schema(description = "상호", example = "（주）삼한공조시스템")
        String companyName,

        @Schema(description = "대표 성명", example = "김미선")
        String representativeName,

        @Schema(description = "사업장 주소", example = "서울특별시 서초구 마방로2길 9, 4층(양재동)")
        String businessAddress,

        @Schema(description = "업태", example = "도소매")
        String businessType,

        @Schema(description = "종목", example = "가전제품")
        String businessItem,

        @Schema(description = "사업자 이메일", example = "apjog09@daum.net")
        String email,

        @Schema(description = "기본 사업자 여부")
        boolean isPrimary,

        @Schema(description = "낙관적 락 버전")
        Long version

) {

    /**
     * {@link SupplierProfile} 엔티티를 응답 DTO 로 변환.
     *
     * @param entity 변환 대상 엔티티
     * @return 응답 DTO
     */
    public static SupplierProfileResponse of(SupplierProfile entity) {
        return new SupplierProfileResponse(
                entity.getId().toString(),
                entity.getBusinessNumber(),
                entity.getSubBusinessNumber(),
                entity.getCompanyName(),
                entity.getRepresentativeName(),
                entity.getBusinessAddress(),
                entity.getBusinessType(),
                entity.getBusinessItem(),
                entity.getEmail(),
                entity.isPrimary(),
                entity.getVersion()
        );
    }
}
