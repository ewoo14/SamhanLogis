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
 * 일마감 snapshot 엔티티 (SP-08-6-5).
 *
 * <p>legacy GAS 12번 "일마감 프로그램" — 특정 날짜의 매출/매입 source 집계 결과를 잠금 flag 와 함께 영속화한다.
 *
 * <p>설계 결정:
 * <ul>
 *   <li>{@code partnerId} NULL = 전체 거래처 통합 마감 snapshot.</li>
 *   <li>{@code partnerId} 지정 = 단일 거래처 마감 snapshot (선택 기능).</li>
 *   <li>{@code isLocked = true} 이면 해당 날짜/거래처의 세금계산서 재집계 금지.</li>
 *   <li>분개 잠금({@link AccountingPeriod})과 별개 — DailyClosing 은 UI 표시용 집계 snapshot.</li>
 * </ul>
 *
 * <p>상태 머신:
 * <pre>
 *   생성(isLocked=false) → lock() → isLocked=true
 *                        → unlock() → isLocked=false  (MASTER 만, controller 가드)
 * </pre>
 *
 * <p>라이프사이클 표 (Layer 4 의무):
 * <table>
 *   <caption>DailyClosing 라이프사이클</caption>
 *   <tr><th>메서드</th><th>상태 변화</th><th>부수효과</th></tr>
 *   <tr><td>{@link #create}</td><td>-</td><td>집계 합계 세팅, isLocked=false</td></tr>
 *   <tr><td>{@link #lock}</td><td>false → true</td><td>lockedAt/By stamp</td></tr>
 *   <tr><td>{@link #unlock}</td><td>true → false</td><td>MASTER 전용, lockedAt/By 보존</td></tr>
 * </table>
 */
@Entity
@Getter
@Table(name = "daily_closings")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class DailyClosing extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 마감 대상 날짜. */
    @Column(name = "closing_date", nullable = false)
    private LocalDate closingDate;

    /**
     * 거래처 UUID. NULL 이면 전체 거래처 통합 마감.
     * UUID 는 내부 식별자 — 사용자 노출 금지 (partnerCode 로 대응).
     */
    @Column(name = "partner_id")
    private UUID partnerId;

    /** 마감 집계 종류 — 매출/매입. */
    @Enumerated(EnumType.STRING)
    @Column(name = "closing_kind", nullable = false, length = 20)
    private DailyClosingKind closingKind;

    /** 집계 source — 세금계산서/출고전표/입고전표. */
    @Enumerated(EnumType.STRING)
    @Column(name = "source_kind", nullable = false, length = 20)
    private DailyClosingSourceKind sourceKind;

    /** 공급가액 합계 (세금계산서 ISSUED 기준). */
    @Column(name = "total_supply", nullable = false, precision = 15, scale = 2)
    private BigDecimal totalSupply;

    /** 세액 합계. */
    @Column(name = "total_vat", nullable = false, precision = 15, scale = 2)
    private BigDecimal totalVat;

    /** 합계금액 (공급가액 + 세액). */
    @Column(name = "total_amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal totalAmount;

    /** 집계 전표 건수. */
    @Column(name = "slip_count", nullable = false)
    private int slipCount;

    /** 잠금 여부. true 이면 재집계/변경 금지. */
    @Column(name = "is_locked", nullable = false)
    private boolean isLocked;

    /** 잠금 시각 (lock() 호출 시 stamp). */
    @Column(name = "locked_at")
    private LocalDateTime lockedAt;

    /** 잠금자 user-id. */
    @Column(name = "locked_by", length = 50)
    private String lockedBy;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    private DailyClosing(LocalDate closingDate, UUID partnerId,
                         DailyClosingKind closingKind, DailyClosingSourceKind sourceKind,
                         BigDecimal totalSupply, BigDecimal totalVat,
                         BigDecimal totalAmount, int slipCount) {
        this.closingDate = closingDate;
        this.partnerId = partnerId;
        this.closingKind = closingKind;
        this.sourceKind = sourceKind;
        this.totalSupply = nullToZero(totalSupply);
        this.totalVat = nullToZero(totalVat);
        this.totalAmount = nullToZero(totalAmount);
        this.slipCount = Math.max(0, slipCount);
        this.isLocked = false;
        // @Version 은 JPA 영속화 시 자동 초기화 — 수동 세팅 금지
    }

    /**
     * 신규 일마감 snapshot 생성 (isLocked=false).
     *
     * @param closingDate 마감 날짜 (필수)
     * @param partnerId   거래처 UUID (null = 전체)
     * @param totalSupply 공급가액 합계
     * @param totalVat    세액 합계
     * @param totalAmount 합계금액
     * @param slipCount   집계 전표 건수
     * @return 신규 DailyClosing 인스턴스 (미저장)
     */
    @Deprecated(since = "SP-SAS-5")
    public static DailyClosing create(LocalDate closingDate, UUID partnerId,
                                      BigDecimal totalSupply, BigDecimal totalVat,
                                      BigDecimal totalAmount, int slipCount) {
        return createV2(closingDate, partnerId, DailyClosingKind.SALES,
                DailyClosingSourceKind.TAX_INVOICE,
                totalSupply, totalVat, totalAmount, slipCount);
    }

    /**
     * 신규 일마감 snapshot 생성 (SP-SAS-5).
     *
     * @param closingKind 매출/매입 구분
     * @param sourceKind 집계 source 구분
     */
    public static DailyClosing createV2(LocalDate closingDate, UUID partnerId,
                                        DailyClosingKind closingKind,
                                        DailyClosingSourceKind sourceKind,
                                        BigDecimal totalSupply, BigDecimal totalVat,
                                        BigDecimal totalAmount, int slipCount) {
        if (closingDate == null) {
            throw new IllegalArgumentException("closingDate 는 필수입니다");
        }
        if (closingKind == null) {
            throw new IllegalArgumentException("closingKind 는 필수입니다");
        }
        if (sourceKind == null) {
            throw new IllegalArgumentException("sourceKind 는 필수입니다");
        }
        return new DailyClosing(closingDate, partnerId, closingKind, sourceKind,
                totalSupply, totalVat, totalAmount, slipCount);
    }

    /**
     * 잠금 실행 (isLocked false → true).
     *
     * @param actorUserId 잠금자 user-id (필수)
     * @throws BusinessException(CONFLICT) 이미 잠긴 상태일 때
     */
    public void lock(String actorUserId) {
        if (this.isLocked) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 잠금된 일마감입니다: " + this.closingDate);
        }
        if (actorUserId == null || actorUserId.isBlank()) {
            throw new IllegalArgumentException("actorUserId 는 필수입니다");
        }
        this.isLocked = true;
        this.lockedAt = LocalDateTime.now();
        this.lockedBy = actorUserId;
    }

    /**
     * 잠금 해제 (isLocked true → false). MASTER 전용 — controller 가 role 가드.
     * lockedAt / lockedBy 는 감사 추적을 위해 보존한다.
     *
     * @param actorUserId 해제자 user-id (필수)
     * @throws BusinessException(CONFLICT) 잠금 상태가 아닐 때
     */
    public void unlock(String actorUserId) {
        if (!this.isLocked) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "잠금 상태가 아닌 일마감입니다: " + this.closingDate);
        }
        if (actorUserId == null || actorUserId.isBlank()) {
            throw new IllegalArgumentException("actorUserId 는 필수입니다");
        }
        this.isLocked = false;
    }

    /**
     * 집계 합계 재계산 갱신 — 잠금 전 재집계 use-case (isLocked=false 만 허용).
     *
     * @param totalSupply 공급가액 합계
     * @param totalVat    세액 합계
     * @param totalAmount 합계금액
     * @param slipCount   전표 건수
     * @throws BusinessException(CONFLICT) 잠금 상태일 때
     */
    public void recalculate(BigDecimal totalSupply, BigDecimal totalVat,
                             BigDecimal totalAmount, int slipCount) {
        if (this.isLocked) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "잠금된 일마감은 재계산할 수 없습니다: " + this.closingDate);
        }
        this.totalSupply = nullToZero(totalSupply);
        this.totalVat = nullToZero(totalVat);
        this.totalAmount = nullToZero(totalAmount);
        this.slipCount = Math.max(0, slipCount);
    }

    private static BigDecimal nullToZero(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }
}
