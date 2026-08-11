package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.SalesCommissionSettlement;
import com.samhanair.logis.accounting.domain.SalesCommissionRateContract;
import com.samhanair.logis.accounting.domain.SalesCommissionSettlementCalculationInput;
import com.samhanair.logis.accounting.domain.SalesCommissionSettlementStatus;
import com.samhanair.logis.accounting.repository.SalesCommissionRateContractRepository;
import com.samhanair.logis.accounting.repository.SalesCommissionSettlementRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 영업수수료 정산서의 S1 생성·확정 경계를 제공한다. */
@Service
@Transactional
public class SalesCommissionSettlementService {

    private final SalesCommissionSettlementRepository repository;
    private final SalesCommissionRateContractRepository rateContractRepository;
    private final SalesCommissionSettlementNumberService numberService;
    private final SalesCommissionSettlementCalculator calculator;

    /** Spring이 repository·채번기·BigDecimal 계산기를 함께 주입하는 생성 경계. */
    @Autowired
    public SalesCommissionSettlementService(SalesCommissionSettlementRepository repository,
                                            SalesCommissionRateContractRepository rateContractRepository,
                                            SalesCommissionSettlementNumberService numberService,
                                            SalesCommissionSettlementCalculator calculator) {
        this.repository = repository;
        this.rateContractRepository = rateContractRepository;
        this.numberService = numberService;
        this.calculator = calculator;
    }

    /** S1 호환 생성 경계. 계산기 연결 전 호출자도 동일한 번호·확정 경로를 사용한다. */
    public SalesCommissionSettlementService(SalesCommissionSettlementRepository repository,
                                            SalesCommissionRateContractRepository rateContractRepository,
                                            SalesCommissionSettlementNumberService numberService) {
        this(repository, rateContractRepository, numberService, new SalesCommissionSettlementCalculator());
    }

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

    /** 계약 버전으로 계산한 입력·결과 snapshot을 정산서에 기록한다. */
    public SalesCommissionSettlement calculate(UUID settlementId,
                                               int rateContractVersion,
                                               SalesCommissionSettlementCalculationInput input) {
        SalesCommissionSettlement settlement = repository.findById(settlementId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "영업수수료 정산서를 찾을 수 없습니다: " + settlementId));
        if (settlement.getStatus() != SalesCommissionSettlementStatus.DRAFT) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "DRAFT 상태에서만 영업수수료 정산을 재계산할 수 있습니다");
        }
        SalesCommissionRateContract rateContract = rateContractRepository
                .findByVersionNoAndIsDeletedFalse(rateContractVersion)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "활성 요율 계약을 찾을 수 없습니다: version=" + rateContractVersion));
        return repository.save(settlement.recordCalculation(
                rateContract, input, calculator.calculate(input, rateContract)));
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
