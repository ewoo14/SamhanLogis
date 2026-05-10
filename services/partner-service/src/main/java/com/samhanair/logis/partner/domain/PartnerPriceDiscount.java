package com.samhanair.logis.partner.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 거래처 단가/할인 정책 (4탭 탭2).
 *
 * <p>{@link Partner} 와 1:1 관계 ({@code partner_id} UNIQUE). 단가 그룹 변경 / 할인율 갱신은
 * 반드시 {@link #update(BigDecimal, Integer, String)} 도메인 메서드를 사용한다.
 * setter/reflection 직접 호출 금지 (memory 도메인 메서드 가드).
 *
 * <p>낙관적 잠금 ({@link #version}) — 동시 관리자 수정 시 충돌 감지.
 */
@Entity
@Getter
@Table(name = "partner_price_discounts")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class PartnerPriceDiscount extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 소속 거래처 UUID ({@link Partner#getId()}). UNIQUE — 거래처당 1행 보장. */
    @Column(name = "partner_id", nullable = false)
    private UUID partnerId;

    /**
     * 기본 할인율 (%). 0.00 ~ 99.99. 신규 생성 시 0.
     */
    @Column(name = "basic_discount_rate", precision = 5, scale = 2, nullable = false)
    private BigDecimal basicDiscountRate;

    /**
     * 결제 조건 (일수 — 30/45/60/90). NULL 가능 (미설정).
     */
    @Column(name = "payment_term_days")
    private Integer paymentTermDays;

    /**
     * 할인 정책 비고.
     */
    @Column(name = "discount_memo", length = 500)
    private String discountMemo;

    /** 낙관적 잠금 버전. */
    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    private PartnerPriceDiscount(UUID partnerId, BigDecimal basicDiscountRate,
                                  Integer paymentTermDays, String discountMemo) {
        if (partnerId == null) {
            throw new IllegalArgumentException("partnerId 필수");
        }
        if (basicDiscountRate == null || basicDiscountRate.signum() < 0) {
            throw new IllegalArgumentException("basicDiscountRate 는 0 이상 필수");
        }
        this.partnerId = partnerId;
        this.basicDiscountRate = basicDiscountRate;
        this.paymentTermDays = paymentTermDays;
        this.discountMemo = discountMemo;
    }

    /**
     * 거래처 단가/할인 정책 신규 생성.
     *
     * @param partnerId        소속 거래처 UUID
     * @param basicDiscountRate 기본 할인율 (0.00 ~ 99.99)
     * @param paymentTermDays  결제 조건 일수 (nullable)
     * @param discountMemo     비고 (nullable)
     * @return 영속화 전 신규 PartnerPriceDiscount
     */
    public static PartnerPriceDiscount create(UUID partnerId, BigDecimal basicDiscountRate,
                                               Integer paymentTermDays, String discountMemo) {
        return new PartnerPriceDiscount(partnerId, basicDiscountRate, paymentTermDays, discountMemo);
    }

    /**
     * 단가/할인 정책 갱신 도메인 메서드 (UPSERT 패턴).
     *
     * @param basicDiscountRate 새 기본 할인율 (0 이상)
     * @param paymentTermDays  새 결제 조건 일수 (nullable)
     * @param discountMemo     새 비고 (nullable)
     */
    public void update(BigDecimal basicDiscountRate, Integer paymentTermDays, String discountMemo) {
        if (basicDiscountRate == null || basicDiscountRate.signum() < 0) {
            throw new IllegalArgumentException("basicDiscountRate 는 0 이상 필수");
        }
        this.basicDiscountRate = basicDiscountRate;
        this.paymentTermDays = paymentTermDays;
        this.discountMemo = discountMemo;
    }
}
