package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.SalesCommissionSettlement;
import com.samhanair.logis.accounting.repository.SalesCommissionSettlementRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.time.LocalDate;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 영업수수료 정산서의 S1 생성·확정 경계를 제공한다. */
@Service
@RequiredArgsConstructor
@Transactional
public class SalesCommissionSettlementService {

    private final SalesCommissionSettlementRepository repository;
    private final SalesCommissionSettlementNumberService numberService;

    /** 번호를 소비하지 않는 DRAFT 정산서를 생성한다. */
    public SalesCommissionSettlement createDraft(LocalDate settlementDate) {
        return repository.save(SalesCommissionSettlement.createDraft(settlementDate));
    }

    /** DRAFT 정산서를 정산 기준일 번호와 함께 확정한다. */
    public SalesCommissionSettlement confirm(UUID settlementId) {
        SalesCommissionSettlement settlement = repository.findById(settlementId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "영업수수료 정산서를 찾을 수 없습니다: " + settlementId));
        return repository.save(settlement.confirm(numberService.next(settlement.getSettlementDate())));
    }

    /** 확정 후 문서번호로 활성 정산서를 되찾는다. */
    @Transactional(readOnly = true)
    public SalesCommissionSettlement findByDocumentNo(String documentNo) {
        if (documentNo == null || documentNo.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "documentNo 는 필수입니다.");
        }
        String normalizedDocumentNo = documentNo.trim();
        return repository.findByDocumentNoAndIsDeletedFalse(normalizedDocumentNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "영업수수료 정산서를 찾을 수 없습니다: " + documentNo));
    }
}
