package com.samhanair.logis.slip.estimate.revision.domain;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * 견적 full-snapshot 직렬화 DTO (권한 재편 Phase 2.2).
 *
 * <p>{@link com.samhanair.logis.slip.estimate.domain.Estimate} 헤더 전 필드 + 라인 배열
 * ({@link Line})을 한 시점의 불변 스냅샷으로 담는다. {@code estimate_revisions.snapshot}
 * (JSONB) 컬럼에 Jackson 으로 직렬화/역직렬화된다.
 *
 * <p>JPA 프록시/lazy 연관 직렬화를 회피하기 위해 entity 가 아닌 전용 record 로 분리한다.
 * point-in-time 복원 시 이 스냅샷을 역직렬화해 헤더를 덮어쓰고 라인을 전량 교체한다.
 *
 * <p>UUID 비공개 가드: 화면 표시는 {@code partnerName} 등 비즈니스 식별자를 사용하고,
 * UUID 필드는 복원 시 entity 재구성용으로만 보존한다.
 *
 * <p>{@link com.samhanair.logis.slip.revision.domain.SlipSnapshot} 미러.
 *
 * @param estimateNo 견적번호 스냅샷 (yyyy/MM/dd-N)
 * @param estimateDate 견적 날짜
 * @param partnerId 거래처 UUID (복원용)
 * @param partnerName 거래처명 스냅샷
 * @param partnerBusinessNo 거래처 사업자번호 스냅샷
 * @param partnerAddress 거래처 주소 스냅샷
 * @param validUntil 견적 유효기간
 * @param memo 비고
 * @param lines 라인 스냅샷 배열
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record EstimateSnapshot(
        String estimateNo,
        LocalDate estimateDate,
        UUID partnerId,
        String partnerName,
        String partnerBusinessNo,
        String partnerAddress,
        LocalDate validUntil,
        String memo,
        List<Line> lines) {

    /**
     * 견적 라인 1건의 스냅샷.
     *
     * @param productId 제품 UUID (복원용)
     * @param productName 제품명 스냅샷
     * @param modelName 모델명 스냅샷
     * @param specification 규격
     * @param quantity 수량
     * @param unitPrice 단가
     * @param supplyAmount 공급가액 (단가 × 수량)
     * @param vatAmount 부가세 (공급가액 × 10%)
     * @param lineTotal 라인 합계 (공급가액 + 부가세)
     * @param note 라인 메모
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Line(
            UUID productId,
            String productName,
            String modelName,
            String specification,
            int quantity,
            BigDecimal unitPrice,
            BigDecimal supplyAmount,
            BigDecimal vatAmount,
            BigDecimal lineTotal,
            String note) {
    }
}
