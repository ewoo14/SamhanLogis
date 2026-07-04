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
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 수금계획 도메인 엔티티.
 *
 * <p>거래처 UUID({@link #partnerId})와 row UUID({@link #id})는 내부 키로만 사용한다.
 * 사용자 화면과 API 응답은 {@link #planNo}, 거래처코드(bizNo), 거래처명, 관리코드(partnerCode)
 * 등 비즈니스 식별자만 노출한다.
 *
 * <p>상태 전이는 {@link #markCollected()} / {@link #markOverdue()} 로만 수행한다.
 * 등록 후 PLANNED 복귀나 COLLECTED terminal row 의 재전이는 허용하지 않는다.
 */
@Entity
@Getter
@Table(name = "collection_plan")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class CollectionPlan extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 사용자 노출 가능한 업무 식별자. UUID 를 path/화면에 쓰지 않기 위해 서비스가 생성한다. */
    @Column(name = "plan_no", nullable = false, length = 40)
    private String planNo;

    /** 거래처 내부 UUID. API 응답에는 노출하지 않는다. */
    @Column(name = "partner_id", nullable = false)
    private UUID partnerId;

    @Column(name = "planned_date", nullable = false)
    private LocalDate plannedDate;

    @Column(name = "planned_amount", nullable = false, precision = 18, scale = 2)
    private BigDecimal plannedAmount;

    @Enumerated(EnumType.STRING)
    @Column(name = "basis", nullable = false, length = 30)
    private PlanBasis basis;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private PlanStatus status;

    @Column(name = "memo", columnDefinition = "TEXT")
    private String memo;

    @Column(name = "source_reference", length = 100)
    private String sourceReference;

    private CollectionPlan(String planNo, UUID partnerId, LocalDate plannedDate,
                           BigDecimal plannedAmount, PlanBasis basis, String memo, String sourceReference) {
        validateRequired(planNo, partnerId, plannedDate, plannedAmount);
        this.planNo = planNo.trim();
        this.partnerId = partnerId;
        this.plannedDate = plannedDate;
        this.plannedAmount = plannedAmount;
        this.basis = basis == null ? PlanBasis.MANUAL : basis;
        this.status = PlanStatus.PLANNED;
        this.memo = blankToNull(memo);
        this.sourceReference = blankToNull(sourceReference);
    }

    /**
     * 수금계획을 등록한다.
     *
     * @param planNo        업무 식별자
     * @param partnerId     거래처 내부 UUID
     * @param plannedDate   예정 수금일
     * @param plannedAmount 예정 금액. 0보다 커야 한다.
     * @param basis         산출 근거. null 이면 MANUAL
     * @param memo          비고
     * @return 신규 수금계획
     */
    public static CollectionPlan register(String planNo, UUID partnerId, LocalDate plannedDate,
                                          BigDecimal plannedAmount, PlanBasis basis, String memo) {
        return register(planNo, partnerId, plannedDate, plannedAmount, basis, memo, null);
    }

    /**
     * 수금계획을 출처키와 함께 등록한다.
     *
     * @param sourceReference 자동제안 출처키. 수동 등록이면 null
     * @return 신규 수금계획
     */
    public static CollectionPlan register(String planNo, UUID partnerId, LocalDate plannedDate,
                                          BigDecimal plannedAmount, PlanBasis basis, String memo,
                                          String sourceReference) {
        return new CollectionPlan(planNo, partnerId, plannedDate, plannedAmount, basis, memo, sourceReference);
    }

    /** 예정/연체 → 수금완료 상태로 전환한다. */
    public CollectionPlan markCollected() {
        requireStatus(PlanStatus.COLLECTED, PlanStatus.PLANNED, PlanStatus.OVERDUE);
        this.status = PlanStatus.COLLECTED;
        return this;
    }

    /** 예정 → 연체 상태로 전환한다. */
    public CollectionPlan markOverdue() {
        requireStatus(PlanStatus.OVERDUE, PlanStatus.PLANNED);
        this.status = PlanStatus.OVERDUE;
        return this;
    }

    private void requireStatus(PlanStatus target, PlanStatus... allowed) {
        for (PlanStatus candidate : allowed) {
            if (this.status == candidate) {
                return;
            }
        }
        throw new BusinessException(ErrorCode.CONFLICT,
                "수금계획(" + planNo + ") 현재 상태(" + status.getDisplayName() + ")에서는 "
                        + target.getDisplayName() + " 전환이 허용되지 않습니다.");
    }

    private static void validateRequired(String planNo, UUID partnerId, LocalDate plannedDate,
                                         BigDecimal plannedAmount) {
        if (planNo == null || planNo.isBlank()) {
            throw new IllegalArgumentException("planNo 는 필수입니다");
        }
        if (partnerId == null) {
            throw new IllegalArgumentException("partnerId 는 필수입니다");
        }
        if (plannedDate == null) {
            throw new IllegalArgumentException("plannedDate 는 필수입니다");
        }
        if (plannedAmount == null || plannedAmount.signum() <= 0) {
            throw new IllegalArgumentException("plannedAmount 는 0보다 커야 합니다");
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
