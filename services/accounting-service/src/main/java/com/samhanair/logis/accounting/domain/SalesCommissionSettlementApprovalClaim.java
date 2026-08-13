package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 교차 서비스 결재 참조 claim.
 *
 * <p>claim은 정산서 전체가 아니라 결재선 하나가 특정 정산서를 참조하는 관계 하나를 소유한다.
 * RESERVED는 groupware 첨부 transaction 중, ACTIVE는 첨부 저장 직전/직후의 보호 상태다.
 */
@Entity
@Getter
@Table(name = "sales_commission_settlement_approval_claims")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class SalesCommissionSettlementApprovalClaim extends BaseEntity {

    public static final long RESERVED_TTL_SECONDS = 30L;
    public static final long ACTIVE_TTL_SECONDS = 300L;

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "settlement_id", nullable = false)
    private SalesCommissionSettlement settlement;

    @Column(name = "approval_id", nullable = false, updatable = false)
    private UUID approvalId;

    @Column(name = "claim_token", nullable = false, unique = true)
    private UUID claimToken;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private SalesCommissionSettlementApprovalClaimStatus status;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    private SalesCommissionSettlementApprovalClaim(SalesCommissionSettlement settlement,
                                                   UUID approvalId,
                                                   LocalDateTime now) {
        if (settlement == null || settlement.getStatus() != SalesCommissionSettlementStatus.CONFIRMED) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "CONFIRMED 정산서만 결재 참조 claim을 만들 수 있습니다");
        }
        if (approvalId == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "approvalId는 필수입니다");
        }
        if (now == null) {
            throw new IllegalArgumentException("now는 필수입니다");
        }
        this.settlement = settlement;
        this.approvalId = approvalId;
        this.claimToken = UUID.randomUUID();
        this.status = SalesCommissionSettlementApprovalClaimStatus.RESERVED;
        this.expiresAt = now.plusSeconds(RESERVED_TTL_SECONDS);
    }

    /** CONFIRMED 정산서에 결재선별 claim을 예약한다. */
    public static SalesCommissionSettlementApprovalClaim reserve(
            SalesCommissionSettlement settlement, UUID approvalId, LocalDateTime now) {
        return new SalesCommissionSettlementApprovalClaim(settlement, approvalId, now);
    }

    /** groupware의 첨부 저장 직전 claim을 활성화한다. */
    public void activate(LocalDateTime now) {
        if (status != SalesCommissionSettlementApprovalClaimStatus.RESERVED
                || now == null || !expiresAt.isAfter(now)) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "결재 참조 claim이 만료되었거나 이미 처리되었습니다");
        }
        if (settlement.getStatus() != SalesCommissionSettlementStatus.CONFIRMED) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "DRAFT 정산서에는 결재 참조를 저장할 수 없습니다");
        }
        status = SalesCommissionSettlementApprovalClaimStatus.ACTIVE;
        expiresAt = now.plusSeconds(ACTIVE_TTL_SECONDS);
    }

    /** 첨부 저장 실패·삭제·반려·회수 시 claim을 멱등 해제한다. */
    public void release() {
        if (status == SalesCommissionSettlementApprovalClaimStatus.RELEASED
                || status == SalesCommissionSettlementApprovalClaimStatus.EXPIRED) {
            return;
        }
        status = SalesCommissionSettlementApprovalClaimStatus.RELEASED;
    }

    /** 동일 결재의 재시도에서 만료·해제된 claim을 새 token으로 재예약한다. */
    public void renew(LocalDateTime now) {
        if (status != SalesCommissionSettlementApprovalClaimStatus.RELEASED
                && status != SalesCommissionSettlementApprovalClaimStatus.EXPIRED) {
            throw new BusinessException(ErrorCode.CONFLICT, "아직 사용 중인 결재 참조 claim입니다");
        }
        if (settlement.getStatus() != SalesCommissionSettlementStatus.CONFIRMED) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "CONFIRMED 정산서만 결재 참조 claim을 만들 수 있습니다");
        }
        if (now == null) {
            throw new IllegalArgumentException("now는 필수입니다");
        }
        claimToken = UUID.randomUUID();
        status = SalesCommissionSettlementApprovalClaimStatus.RESERVED;
        expiresAt = now.plusSeconds(RESERVED_TTL_SECONDS);
    }

    /** 보상 호출이 유실된 claim을 유효기간 만료로 자가 치유한다. */
    public void expire(LocalDateTime now) {
        if (now != null && expiresAt != null && !expiresAt.isAfter(now)
                && (status == SalesCommissionSettlementApprovalClaimStatus.RESERVED
                || status == SalesCommissionSettlementApprovalClaimStatus.ACTIVE)) {
            status = SalesCommissionSettlementApprovalClaimStatus.EXPIRED;
        }
    }
}
