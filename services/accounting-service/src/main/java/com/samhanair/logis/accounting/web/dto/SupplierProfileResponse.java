package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.SupplierProfile;
import com.samhanair.logis.accounting.repository.projection.SupplierProfileSummary;
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
 * <p>경량화 규칙 (V35 확장 / P1-B 사이클1 fix):
 * <ul>
 *   <li>목록({@code GET /}) 응답 — {@code stampPngBase64=null} 만 경량화.
 *       {@code bankAccounts} 는 포함 (P1-B: 편집 시 계좌 소실 방지 — spec §1c "stamp 만 제외").</li>
 *   <li>상세({@code GET /{id}}, {@code GET /primary}) — stamp 포함 전체 필드.</li>
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

        @Schema(description = "은행계좌 목록 (목록/상세/primary 모두 포함, stamp 만 경량화)")
        List<BankAccountResponse> bankAccounts,

        @Schema(description = "인감 등록 여부")
        boolean hasStamp,

        @Schema(description = "인감 PNG Base64 (상세/primary 응답에만 포함, 목록 응답에서는 null)")
        String stampPngBase64,

        @Schema(description = "로고 등록 여부")
        boolean hasLogo,

        @Schema(description = "로고 PNG Base64 (상세/primary 응답에만 포함, 목록 응답에서는 null)")
        String logoPngBase64

) {

    /**
     * {@link SupplierProfileSummary} 프로젝션을 목록용 응답 DTO 로 변환.
     *
     * <p>P1-B 사이클1 fix: bankAccounts 를 포함하여 FE 편집 시 계좌 소실을 방지한다.
     * stampPngBase64=null — stamp BYTEA 만 경량화 ({@code hasStamp} 는 stampHash 존재 여부로 판단).
     *
     * @param summary      stamp 미포함 프로젝션 (stamp_png BYTEA 미로드)
     * @param bankAccounts 은행계좌 목록 (displayOrder 오름차순)
     * @return 목록 응답 DTO (stamp 미포함)
     */
    public static SupplierProfileResponse of(
            SupplierProfileSummary summary,
            List<BankAccountResponse> bankAccounts) {
        return new SupplierProfileResponse(
                summary.getId().toString(),
                summary.getBusinessNumber(),
                summary.getSubBusinessNumber(),
                summary.getCompanyName(),
                summary.getRepresentativeName(),
                summary.getBusinessAddress(),
                summary.getBusinessType(),
                summary.getBusinessItem(),
                summary.getEmail(),
                summary.getTel(),
                summary.getFax(),
                Boolean.TRUE.equals(summary.getIsPrimary()),
                summary.getVersion(),
                bankAccounts,               // P1-B: bankAccounts 포함
                summary.getStampHash() != null,
                null,                       // stampPngBase64 — stamp 한정 경량화
                summary.getLogoHash() != null,
                null                        // logoPngBase64 — logo 한정 경량화
        );
    }

    /**
     * {@link SupplierProfile} 엔티티를 목록용 응답 DTO 로 변환 (하위 호환 오버로드).
     *
     * <p>엔티티에서 직접 변환할 때 사용 (create/update 응답 등).
     * stamp BYTEA 는 로드 시점에 이미 메모리에 있으므로 경량화 효과 없음 — 상세 응답({@link #ofDetail}) 사용 권장.
     *
     * @param entity 변환 대상 엔티티
     * @return 목록 응답 DTO
     * @deprecated 신규 코드에서는 {@link #of(SupplierProfileSummary, List)} 또는 {@link #ofDetail} 사용.
     */
    @Deprecated
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
                null,       // bankAccounts 없음 (엔티티 기반 단순 변환)
                entity.getStampHash() != null,
                null,       // stampPngBase64 — stamp 경량화
                entity.getLogoHash() != null,
                null        // logoPngBase64 — logo 경량화
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
        byte[] logoPng = entity.getLogoPng();
        String logoPngBase64 = (logoPng != null && logoPng.length > 0)
                ? Base64.getEncoder().encodeToString(logoPng)
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
                stampPngBase64,
                entity.getLogoHash() != null,
                logoPngBase64
        );
    }
}
