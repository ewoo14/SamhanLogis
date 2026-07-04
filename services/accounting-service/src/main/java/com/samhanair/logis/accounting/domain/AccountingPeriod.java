package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 회계 마감 기간 (P2-4 매출 마감).
 *
 * <p>매뉴얼 출처: {@code docs/manual/02-창고/04-매출-마감.md}.
 *
 * <p>상태 머신:
 *
 * <pre>
 *   OPEN → CLOSED → OPEN (역마감 — MASTER 만)
 * </pre>
 *
 * <p>라이프사이클 표 (Layer 4 의무):
 *
 * <table>
 *   <caption>AccountingPeriod 라이프사이클</caption>
 *   <tr><th>메서드</th><th>from → to</th><th>부수효과</th></tr>
 *   <tr><td>{@link #close(String, BigDecimal, BigDecimal, BigDecimal, int)}</td>
 *     <td>OPEN → CLOSED</td>
 *     <td>closed_at/by + 매출/매입/판관비 합계 stamp + lockedSlipCount stamp</td></tr>
 *   <tr><td>{@link #reverse(String)}</td><td>CLOSED → OPEN</td>
 *     <td>reversed_at/by stamp, closedAt/By 보존 (audit), MASTER 만 호출 가능 (controller 가드)</td></tr>
 * </table>
 *
 * <p>마감 후 변경 차단은 {@code AccountingPeriodGuard} interceptor 가 다른 endpoint 입력
 * 분개의 journalDate 가 CLOSED 기간에 속하는지 확인하여 CONFLICT 반환.
 */
@Entity
@Getter
@Table(name = "accounting_periods")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class AccountingPeriod extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 마감 유형 (DAILY / MONTHLY). */
    @Enumerated(EnumType.STRING)
    @Column(name = "period_type", nullable = false, length = 20)
    private PeriodType periodType;

    /**
     * 기간 일자. DAILY 면 해당 일자, MONTHLY 면 해당 월의 1일 (조회 단순화).
     * service 가 입력값을 normalize.
     */
    @Column(name = "period_date", nullable = false)
    private LocalDate periodDate;

    /** 상태 (OPEN / CLOSED). */
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private PeriodStatus status;

    /** 마감 시각 — close 시 stamp. 역마감 시에도 보존 (감사 추적). */
    @Column(name = "closed_at")
    private LocalDateTime closedAt;

    /** 마감자 user-id. */
    @Column(name = "closed_by", length = 50)
    private String closedBy;

    /** 역마감 시각. */
    @Column(name = "reversed_at")
    private LocalDateTime reversedAt;

    /** 역마감자 user-id (MASTER). */
    @Column(name = "reversed_by", length = 50)
    private String reversedBy;

    /** 마감 시점 매출 합계 (400 카테고리 = REVENUE). */
    @Column(name = "total_sales", nullable = false, precision = 15, scale = 2)
    private BigDecimal totalSales;

    /** 마감 시점 매입 합계 (500 카테고리 = COST_OF_SALES). */
    @Column(name = "total_purchase", nullable = false, precision = 15, scale = 2)
    private BigDecimal totalPurchase;

    /** 마감 시점 판관비 합계 (800 카테고리 = SGA). */
    @Column(name = "total_expense", nullable = false, precision = 15, scale = 2)
    private BigDecimal totalExpense;

    /** slip-service 가 lock-by-period 호출 결과로 잠근 슬립 건수. */
    @Column(name = "locked_slip_count", nullable = false)
    private int lockedSlipCount;

    /** 적요 / 비고 (선택, ≤500자). */
    @Column(name = "description", length = 500)
    private String description;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    private AccountingPeriod(PeriodType periodType, LocalDate periodDate, String description) {
        this.periodType = periodType;
        this.periodDate = periodDate;
        this.description = description;
        this.status = PeriodStatus.OPEN;
        this.totalSales = BigDecimal.ZERO;
        this.totalPurchase = BigDecimal.ZERO;
        this.totalExpense = BigDecimal.ZERO;
        this.lockedSlipCount = 0;
        this.version = 0L;
    }

    /**
     * 신규 마감 row 생성 (OPEN). normalizePeriodDate 는 service 책임.
     */
    public static AccountingPeriod create(PeriodType periodType, LocalDate periodDate,
                                          String description) {
        if (periodType == null) {
            throw new IllegalArgumentException("periodType 은 필수입니다");
        }
        if (periodDate == null) {
            throw new IllegalArgumentException("periodDate 는 필수입니다");
        }
        if (description != null && description.length() > 500) {
            throw new IllegalArgumentException("description 은 최대 500자입니다");
        }
        return new AccountingPeriod(periodType, periodDate, description);
    }

    /**
     * 마감 (OPEN → CLOSED). 합계 stamp + closed_at/by 기록.
     *
     * @param actorUserId 마감자 user-id (필수)
     * @param totalSales 매출 합계
     * @param totalPurchase 매입 합계
     * @param totalExpense 판관비 합계
     * @param lockedSlipCount slip-service lock-by-period 결과 건수
     * @throws BusinessException(CONFLICT) 이미 CLOSED 일 때
     */
    public void close(String actorUserId, BigDecimal totalSales, BigDecimal totalPurchase,
                      BigDecimal totalExpense, int lockedSlipCount) {
        if (this.status != PeriodStatus.OPEN) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "마감은 " + PeriodStatus.OPEN.getDisplayName()
                            + " 상태에서만 허용됩니다 (현재: " + this.status.getDisplayName() + ")");
        }
        if (actorUserId == null || actorUserId.isBlank()) {
            throw new IllegalArgumentException("actorUserId 는 필수입니다");
        }
        this.status = PeriodStatus.CLOSED;
        this.closedAt = LocalDateTime.now();
        this.closedBy = actorUserId;
        this.totalSales = nullToZero(totalSales);
        this.totalPurchase = nullToZero(totalPurchase);
        this.totalExpense = nullToZero(totalExpense);
        this.lockedSlipCount = Math.max(0, lockedSlipCount);
    }

    /**
     * 역마감 (CLOSED → OPEN). MASTER 만 호출 가능 (controller 가드).
     * closedAt / closedBy 는 보존 (감사 추적), reversedAt / reversedBy stamp.
     *
     * @throws BusinessException(CONFLICT) CLOSED 가 아닐 때
     */
    public void reverse(String actorUserId) {
        if (this.status != PeriodStatus.CLOSED) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "역마감은 " + PeriodStatus.CLOSED.getDisplayName()
                            + " 상태에서만 허용됩니다 (현재: " + this.status.getDisplayName() + ")");
        }
        if (actorUserId == null || actorUserId.isBlank()) {
            throw new IllegalArgumentException("actorUserId 는 필수입니다");
        }
        this.status = PeriodStatus.OPEN;
        this.reversedAt = LocalDateTime.now();
        this.reversedBy = actorUserId;
    }

    private static BigDecimal nullToZero(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }
}
