package com.samhanair.logis.dcconfig.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 거래처별 DC 설정 (Partner 1:1).
 *
 * <p>legacy `applyConfigFromServer` (partner-order/index.html L1322~) 의 16종 CFG_RAW 보존:
 * <ul>
 *   <li>{@code homeDiscountRate} — 홈멀티 DC율 (0.0000~0.9999)</li>
 *   <li>{@code commercialDiscountRate} — 상업멀티 DC율</li>
 *   <li>{@code showIHose} — 유연호스(I) 표시 여부</li>
 *   <li>discount{360 / 4Way / 1Way / Stand / Deluxe / FirstGrade}Amount — 옵션 정액 차감 6종</li>
 *   <li>{@code unitRoundTo} — 반올림 단위 (예: 1000 = 천원)</li>
 *   <li>{@code unitRoundMode} — ROUND / FLOOR / CEIL</li>
 *   <li>{@code source} — 시드 출처 (감사용)</li>
 * </ul>
 *
 * <p>DC 노출 5겹 가드 의 2번째 — 본 entity 의 모든 *Rate / *Amount 필드는
 * {@code PartnerPublicResponse} 에 노출 금지. {@code DcConfigResponse} (internal) 만 사용.
 */
@Entity
@Getter
@Table(name = "dc_configs")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class DcConfig extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** Partner 1:1 — partner_id UK. */
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "partner_id", nullable = false, unique = true)
    private Partner partner;

    /** 홈멀티 DC율 (0~1). 예: 0.07 = 7%. */
    @Column(name = "home_discount_rate", precision = 5, scale = 4)
    private BigDecimal homeDiscountRate;

    /** 상업멀티 DC율. */
    @Column(name = "commercial_discount_rate", precision = 5, scale = 4)
    private BigDecimal commercialDiscountRate;

    /** 유연호스(I) 표시 여부. */
    @Column(name = "show_i_hose", nullable = false)
    private Boolean showIHose = Boolean.FALSE;

    /** 360 판넬 옵션 정액 DC. */
    @Column(name = "discount_360_amount", precision = 12, scale = 2)
    private BigDecimal discount360Amount;

    /** 4way 판넬 옵션 정액 DC. */
    @Column(name = "discount_4way_amount", precision = 12, scale = 2)
    private BigDecimal discount4WayAmount;

    /** 1way 판넬 옵션 정액 DC. */
    @Column(name = "discount_1way_amount", precision = 12, scale = 2)
    private BigDecimal discount1WayAmount;

    /** 스탠드 옵션 정액 DC. */
    @Column(name = "discount_stand_amount", precision = 12, scale = 2)
    private BigDecimal discountStandAmount;

    /** 디럭스 옵션 정액 DC. */
    @Column(name = "discount_deluxe_amount", precision = 12, scale = 2)
    private BigDecimal discountDeluxeAmount;

    /** 1등급 옵션 정액 DC. */
    @Column(name = "discount_first_grade_amount", precision = 12, scale = 2)
    private BigDecimal discountFirstGradeAmount;

    /** 단가 반올림 단위 (legacy UNIT_ROUND_TO). 0 또는 NULL = 1원 단위. */
    @Column(name = "unit_round_to")
    private Integer unitRoundTo;

    /** 단가 반올림 모드 (legacy UNIT_ROUND_MODE). */
    @Enumerated(EnumType.STRING)
    @Column(name = "unit_round_mode", length = 10)
    private UnitRoundMode unitRoundMode = UnitRoundMode.ROUND;

    /** 시드 출처 (감사용). */
    @Enumerated(EnumType.STRING)
    @Column(name = "source", nullable = false, length = 20)
    private DcConfigSource source = DcConfigSource.ADMIN_EDIT;

    /** 비고. */
    @Column(name = "note", columnDefinition = "TEXT")
    private String note;

    private DcConfig(Partner partner, DcConfigSource source) {
        this.partner = partner;
        this.source = source == null ? DcConfigSource.ADMIN_EDIT : source;
    }

    public static DcConfig create(Partner partner, DcConfigSource source) {
        if (partner == null) {
            throw new IllegalArgumentException("Partner 는 필수입니다");
        }
        return new DcConfig(partner, source);
    }

    public void changeRates(BigDecimal homeDiscountRate, BigDecimal commercialDiscountRate) {
        this.homeDiscountRate = clampRate(homeDiscountRate);
        this.commercialDiscountRate = clampRate(commercialDiscountRate);
    }

    public void changeShowIHose(boolean showIHose) {
        this.showIHose = showIHose;
    }

    public void changeOptionAmounts(BigDecimal d360, BigDecimal d4way, BigDecimal d1way,
                                    BigDecimal stand, BigDecimal deluxe, BigDecimal firstGrade) {
        this.discount360Amount = nonNegativeOrNull(d360);
        this.discount4WayAmount = nonNegativeOrNull(d4way);
        this.discount1WayAmount = nonNegativeOrNull(d1way);
        this.discountStandAmount = nonNegativeOrNull(stand);
        this.discountDeluxeAmount = nonNegativeOrNull(deluxe);
        this.discountFirstGradeAmount = nonNegativeOrNull(firstGrade);
    }

    public void changeRounding(Integer unitRoundTo, UnitRoundMode unitRoundMode) {
        if (unitRoundTo != null && unitRoundTo < 0) {
            throw new IllegalArgumentException("unitRoundTo 는 0 이상이어야 합니다");
        }
        this.unitRoundTo = unitRoundTo;
        this.unitRoundMode = unitRoundMode == null ? UnitRoundMode.ROUND : unitRoundMode;
    }

    public void changeNote(String note) {
        this.note = note;
    }

    public void changeSource(DcConfigSource source) {
        this.source = source == null ? DcConfigSource.ADMIN_EDIT : source;
    }

    private static BigDecimal clampRate(BigDecimal v) {
        if (v == null) {
            return null;
        }
        if (v.signum() < 0) {
            return BigDecimal.ZERO;
        }
        BigDecimal max = new BigDecimal("0.9999");
        return v.compareTo(max) > 0 ? max : v;
    }

    private static BigDecimal nonNegativeOrNull(BigDecimal v) {
        if (v == null) {
            return null;
        }
        if (v.signum() < 0) {
            throw new IllegalArgumentException("DC 정액은 0 이상이어야 합니다");
        }
        return v;
    }
}
