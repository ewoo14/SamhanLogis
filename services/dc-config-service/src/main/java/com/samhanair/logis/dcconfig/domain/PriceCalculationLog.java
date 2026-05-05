package com.samhanair.logis.dcconfig.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

/**
 * DC 적용 가격 계산의 감사 로그.
 *
 * <p>모든 internal `POST /internal/price-calculations` 호출은 본 entity 1 row 를 남긴다.
 * 추후 가격 분쟁 시 추적용.
 *
 * <p>Soft-delete 적용 — 운영 중 1년 이상 된 row 는 별도 archival job 으로 이관 예정.
 */
@Entity
@Getter
@Table(name = "price_calculation_logs")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class PriceCalculationLog extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** Partner ID — Partner FK 는 도메인 무결성 의존성 회피 위해 raw UUID 보관. */
    @Column(name = "partner_id")
    private UUID partnerId;

    /** 호출자 서비스명 (예: "estimate-service" / "partner-order-service"). */
    @Column(name = "caller_service", nullable = false, length = 50)
    private String callerService;

    /** 요청 페이로드 (jsonb) — 라인 + 카테고리 + 옵션. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "request_payload", columnDefinition = "jsonb")
    private Map<String, Object> requestPayload;

    /** 응답 페이로드 (jsonb) — 라인별 적용 단가. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "response_payload", columnDefinition = "jsonb")
    private Map<String, Object> responsePayload;

    /** 적용된 DC 스냅샷 (jsonb) — 호출 시점의 DcConfig + 매칭된 DcRule list. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "applied_dc_snapshot", columnDefinition = "jsonb")
    private Map<String, Object> appliedDcSnapshot;

    /** 정상가 합계. */
    @Column(name = "total_list_amount", precision = 15, scale = 2)
    private BigDecimal totalListAmount;

    /** DC 적용 후 합계. */
    @Column(name = "total_final_amount", precision = 15, scale = 2)
    private BigDecimal totalFinalAmount;

    /** 차감 합계 (totalListAmount - totalFinalAmount). */
    @Column(name = "total_discount_amount", precision = 15, scale = 2)
    private BigDecimal totalDiscountAmount;

    private PriceCalculationLog(UUID partnerId, String callerService,
                                Map<String, Object> requestPayload,
                                Map<String, Object> responsePayload,
                                Map<String, Object> appliedDcSnapshot,
                                BigDecimal totalListAmount,
                                BigDecimal totalFinalAmount,
                                BigDecimal totalDiscountAmount) {
        this.partnerId = partnerId;
        this.callerService = callerService;
        this.requestPayload = requestPayload;
        this.responsePayload = responsePayload;
        this.appliedDcSnapshot = appliedDcSnapshot;
        this.totalListAmount = totalListAmount;
        this.totalFinalAmount = totalFinalAmount;
        this.totalDiscountAmount = totalDiscountAmount;
    }

    public static PriceCalculationLog create(UUID partnerId, String callerService,
                                             Map<String, Object> requestPayload,
                                             Map<String, Object> responsePayload,
                                             Map<String, Object> appliedDcSnapshot,
                                             BigDecimal totalListAmount,
                                             BigDecimal totalFinalAmount,
                                             BigDecimal totalDiscountAmount) {
        if (callerService == null || callerService.isBlank()) {
            throw new IllegalArgumentException("callerService 는 필수입니다");
        }
        return new PriceCalculationLog(partnerId, callerService.trim(),
                requestPayload, responsePayload, appliedDcSnapshot,
                totalListAmount, totalFinalAmount, totalDiscountAmount);
    }
}
