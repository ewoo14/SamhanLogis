package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.SupplierProfile;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.Base64;
import java.util.List;

/**
 * 사업자 프로필 응답 DTO.
 *
 * <p>UUID 비공개 원칙(feedback_uuid_no_user_visibility) 준수 —
 * id 는 내부 수정/삭제 endpoint 경로용으로만 사용하며 화면 목록 식별에는
 * {@link #businessNumber} 와 {@link #companyName} 을 사용한다.
 *
 * <p>경량화 규칙 (V35 확장):
 * <ul>
 *   <li>목록({@code GET /}) 응답 — {@code bankAccounts=null}, {@code stampPngBase64=null},
 *       {@code hasStamp} 만 포함 (payload 경량화)</li>
 *   <li>상세/primary({@code GET /{id}}, {@code GET /primary}) — 전체 필드 포함</li>
 * </ul>
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

        @Schema(description = "전화번호", example = "02-3461-0000")
        String tel,

        @Schema(description = "FAX 번호", example = "02-3461-0001")
        String fax,

        @Schema(description = "기본 사업자 여부")
        boolean isPrimary,

        @Schema(description = "낙관적 락 버전")
        Long version,

        @Schema(description = "은행계좌 목록 (상세/primary 응답에만 포함, 목록 응답에서는 null)")
        List<BankAccountResponse> bankAccounts,

        @Schema(description = "인감 등록 여부")
        boolean hasStamp,

        @Schema(description = "인감 PNG Base64 (상세/primary 응답에만 포함, 목록 응답에서는 null)")
        String stampPngBase64

) {

    /**
     * {@link SupplierProfile} 엔티티를 목록용 응답 DTO 로 변환.
     *
     * <p>bankAccounts=null, stampPngBase64=null — payload 경량화.
     * hasStamp 는 stampHash 존재 여부로 판단.
     *
     * @param entity 변환 대상 엔티티
     * @return 목록 응답 DTO
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
                entity.getTel(),
                entity.getFax(),
                entity.isPrimary(),
                entity.getVersion(),
                null,       // bankAccounts — 목록 경량화
                entity.getStampHash() != null,
                null        // stampPngBase64 — 목록 경량화
        );
    }

    /**
     * {@link SupplierProfile} 엔티티를 상세/primary 응답 DTO 로 변환 (은행계좌 + 인감 포함).
     *
     * @param entity       변환 대상 엔티티
     * @param bankAccounts 은행계좌 목록 (displayOrder 오름차순)
     * @return 상세 응답 DTO
     */
    public static SupplierProfileResponse ofDetail(
            SupplierProfile entity,
            List<BankAccountResponse> bankAccounts) {
        byte[] stampPng = entity.getStampPng();
        String stampPngBase64 = (stampPng != null && stampPng.length > 0)
                ? Base64.getEncoder().encodeToString(stampPng)
                : null;
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
                entity.getTel(),
                entity.getFax(),
                entity.isPrimary(),
                entity.getVersion(),
                bankAccounts,
                entity.getStampHash() != null,
                stampPngBase64
        );
    }
}
