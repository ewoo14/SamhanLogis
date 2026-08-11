package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.SalesCommissionSettlement;
import com.samhanair.logis.accounting.domain.SalesCommissionSettlementApprovalClaim;
import com.samhanair.logis.accounting.domain.SalesCommissionSettlementApprovalClaimStatus;
import com.samhanair.logis.accounting.repository.SalesCommissionSettlementApprovalClaimRepository;
import com.samhanair.logis.accounting.repository.SalesCommissionSettlementRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 영업수수료 정산 결재 참조 claim의 직렬화 경계.
 *
 * <p>호출자는 먼저 정산 행 잠금을 얻고 claim을 변경한다. 취소 경로도 같은 정산 행 잠금 아래에서
 * claim을 검사하므로, groupware 조회 직후 새 claim이 끼어드는 TOCTOU를 차단한다.
 */
@Service
@Transactional
public class SalesCommissionSettlementApprovalClaimService {

    private static final List<SalesCommissionSettlementApprovalClaimStatus> LIVE_STATUSES = List.of(
            SalesCommissionSettlementApprovalClaimStatus.RESERVED,
            SalesCommissionSettlementApprovalClaimStatus.ACTIVE);

    private final SalesCommissionSettlementRepository settlementRepository;
    private final SalesCommissionSettlementApprovalClaimRepository claimRepository;
    private final Clock clock;

    @Autowired
    public SalesCommissionSettlementApprovalClaimService(
            SalesCommissionSettlementRepository settlementRepository,
            SalesCommissionSettlementApprovalClaimRepository claimRepository) {
        this(settlementRepository, claimRepository, Clock.systemUTC());
    }

    SalesCommissionSettlementApprovalClaimService(
            SalesCommissionSettlementRepository settlementRepository,
            SalesCommissionSettlementApprovalClaimRepository claimRepository,
            Clock clock) {
        this.settlementRepository = settlementRepository;
        this.claimRepository = claimRepository;
        this.clock = clock;
    }

    /** CONFIRMED 정산서의 결재별 참조 claim을 예약한다. */
    public SalesCommissionSettlementApprovalClaim reserve(String documentNo, UUID approvalId) {
        String normalized = normalizeDocumentNo(documentNo);
        SalesCommissionSettlement settlement = settlementRepository
                .findByDocumentNoAndIsDeletedFalseForUpdate(normalized)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "영업수수료 정산서를 찾을 수 없습니다: " + documentNo));
        LocalDateTime now = now();
        expireClaims(settlement.getId(), now);
        return claimRepository.findBySettlementIdAndApprovalId(settlement.getId(), approvalId)
                .map(existing -> reuseOrReject(existing, now))
                .orElseGet(() -> claimRepository.save(
                        SalesCommissionSettlementApprovalClaim.reserve(settlement, approvalId, now)));
    }

    /** groupware가 로컬 첨부를 준비한 뒤 claim을 ACTIVE로 올린다. */
    public SalesCommissionSettlementApprovalClaim activate(UUID claimToken) {
        SalesCommissionSettlementApprovalClaim claim = loadClaim(claimToken);
        lockSettlement(claim);
        claim.activate(now());
        return claimRepository.save(claim);
    }

    /** 첨부 실패·삭제 시 claim을 멱등 해제한다. */
    public void release(UUID claimToken) {
        SalesCommissionSettlementApprovalClaim claim = loadClaim(claimToken);
        lockSettlement(claim);
        claim.release();
        claimRepository.save(claim);
    }

    /** 특정 결재·정산 참조 하나만 해제한다. 결재 단위 광역 release는 허용하지 않는다. */
    public void releaseByApprovalReference(UUID approvalId, String documentNo) {
        String normalized = normalizeDocumentNo(documentNo);
        SalesCommissionSettlement settlement = settlementRepository
                .findByDocumentNoAndIsDeletedFalseForUpdate(normalized)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "영업수수료 정산서를 찾을 수 없습니다: " + documentNo));
        claimRepository.findBySettlementIdAndApprovalId(settlement.getId(), approvalId)
                .filter(claim -> LIVE_STATUSES.contains(claim.getStatus()))
                .ifPresent(claim -> {
                    claim.release();
                    claimRepository.save(claim);
                });
    }

    /** 잠긴 정산 행에 유효한 claim이 없는지 검사하고 만료 claim을 자가 치유한다. */
    public void assertNoActiveClaimsForLockedSettlement(SalesCommissionSettlement settlement) {
        LocalDateTime now = now();
        List<SalesCommissionSettlementApprovalClaim> claims = claimRepository
                .findAllBySettlementIdAndStatusIn(settlement.getId(), LIVE_STATUSES);
        for (SalesCommissionSettlementApprovalClaim claim : claims) {
            if (claim.getExpiresAt() != null && !claim.getExpiresAt().isAfter(now)) {
                claim.expire(now);
                claimRepository.save(claim);
                continue;
            }
            throw new BusinessException(ErrorCode.CONFLICT,
                    "결재 참조 claim이 있어 영업수수료 정산 확정을 취소할 수 없습니다");
        }
    }

    /** 테스트·내부 보정 경계: 정산 행을 잠근 뒤 claim 검사를 수행한다. */
    public void assertNoActiveClaims(UUID settlementId) {
        SalesCommissionSettlement settlement = settlementRepository
                .findByIdAndIsDeletedFalseForUpdate(settlementId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "영업수수료 정산서를 찾을 수 없습니다: " + settlementId));
        assertNoActiveClaimsForLockedSettlement(settlement);
    }

    private SalesCommissionSettlementApprovalClaim reuseOrReject(
            SalesCommissionSettlementApprovalClaim claim, LocalDateTime now) {
        if (claim.getStatus() == SalesCommissionSettlementApprovalClaimStatus.RESERVED
                || claim.getStatus() == SalesCommissionSettlementApprovalClaimStatus.ACTIVE) {
            if (claim.getExpiresAt() != null && claim.getExpiresAt().isAfter(now)) {
                throw new BusinessException(ErrorCode.CONFLICT,
                        "이미 다른 첨부 요청이 진행 중인 정산 참조입니다");
            }
            claim.expire(now);
        }
        claim.renew(now);
        return claimRepository.save(claim);
    }

    private void expireClaims(UUID settlementId, LocalDateTime now) {
        if (settlementId == null) {
            return;
        }
        claimRepository.findAllBySettlementIdAndStatusIn(settlementId, LIVE_STATUSES).forEach(claim -> {
            claim.expire(now);
            if (claim.getStatus() == SalesCommissionSettlementApprovalClaimStatus.EXPIRED) {
                claimRepository.save(claim);
            }
        });
    }

    private SalesCommissionSettlementApprovalClaim loadClaim(UUID claimToken) {
        if (claimToken == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "claimToken은 필수입니다");
        }
        return claimRepository.findByClaimToken(claimToken)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "결재 참조 claim을 찾을 수 없습니다: " + claimToken));
    }

    private void lockSettlement(SalesCommissionSettlementApprovalClaim claim) {
        if (claim.getSettlement() != null && claim.getSettlement().getId() != null) {
            settlementRepository.findByIdAndIsDeletedFalseForUpdate(claim.getSettlement().getId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                            "claim의 정산서를 찾을 수 없습니다"));
        }
    }

    private LocalDateTime now() {
        return LocalDateTime.now(clock);
    }

    private String normalizeDocumentNo(String documentNo) {
        if (documentNo == null || documentNo.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "documentNo는 필수입니다");
        }
        return documentNo.trim();
    }
}
