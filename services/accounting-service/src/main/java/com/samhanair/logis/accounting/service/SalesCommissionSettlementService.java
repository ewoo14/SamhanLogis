package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.GroupwareSettlementApprovalClient;
import com.samhanair.logis.accounting.domain.SalesCommissionSettlement;
import com.samhanair.logis.accounting.domain.SalesCommissionRateContract;
import com.samhanair.logis.accounting.domain.SalesCommissionSettlementCalculationInput;
import com.samhanair.logis.accounting.domain.SalesCommissionSettlementSnapshotHistory;
import com.samhanair.logis.accounting.domain.SalesCommissionSettlementStatus;
import com.samhanair.logis.accounting.repository.SalesCommissionRateContractRepository;
import com.samhanair.logis.accounting.repository.SalesCommissionSettlementRepository;
import com.samhanair.logis.accounting.repository.SalesCommissionSettlementSnapshotHistoryRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.time.LocalDate;
import java.util.UUID;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
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
    private final SalesCommissionSettlementSnapshotHistoryRepository historyRepository;
    private final GroupwareSettlementApprovalClient groupwareApprovalClient;
    private final SalesCommissionSettlementApprovalClaimService claimService;

    /** Spring이 repository·채번기·BigDecimal 계산기를 함께 주입하는 생성 경계. */
    @Autowired
    public SalesCommissionSettlementService(SalesCommissionSettlementRepository repository,
                                            SalesCommissionRateContractRepository rateContractRepository,
                                            SalesCommissionSettlementNumberService numberService,
                                            SalesCommissionSettlementCalculator calculator,
                                            SalesCommissionSettlementSnapshotHistoryRepository historyRepository,
                                            GroupwareSettlementApprovalClient groupwareApprovalClient,
                                            SalesCommissionSettlementApprovalClaimService claimService) {
        this.repository = repository;
        this.rateContractRepository = rateContractRepository;
        this.numberService = numberService;
        this.calculator = calculator;
        this.historyRepository = historyRepository;
        this.groupwareApprovalClient = groupwareApprovalClient;
        this.claimService = claimService;
    }

    /** 결재 claim wiring 전 기존 단위 호출자와의 호환 생성 경계. */
    public SalesCommissionSettlementService(SalesCommissionSettlementRepository repository,
                                            SalesCommissionRateContractRepository rateContractRepository,
                                            SalesCommissionSettlementNumberService numberService,
                                            SalesCommissionSettlementCalculator calculator,
                                            SalesCommissionSettlementSnapshotHistoryRepository historyRepository,
                                            GroupwareSettlementApprovalClient groupwareApprovalClient) {
        this(repository, rateContractRepository, numberService, calculator, historyRepository,
                groupwareApprovalClient, null);
    }

    /** S1 호환 생성 경계. 계산기 연결 전 호출자도 동일한 번호·확정 경로를 사용한다. */
    public SalesCommissionSettlementService(SalesCommissionSettlementRepository repository,
                                            SalesCommissionRateContractRepository rateContractRepository,
                                            SalesCommissionSettlementNumberService numberService) {
        this(repository, rateContractRepository, numberService, new SalesCommissionSettlementCalculator(), null, null);
    }

    /** 기존 S1/S2 단위 테스트와 호출자의 계산기 주입 생성 경계를 유지한다. */
    public SalesCommissionSettlementService(SalesCommissionSettlementRepository repository,
                                            SalesCommissionRateContractRepository rateContractRepository,
                                            SalesCommissionSettlementNumberService numberService,
                                            SalesCommissionSettlementCalculator calculator) {
        this(repository, rateContractRepository, numberService, calculator, null, null);
    }

    /** 번호를 소비하지 않는 DRAFT 정산서를 생성한다. */
    public SalesCommissionSettlement createDraft(LocalDate settlementDate) {
        return repository.save(SalesCommissionSettlement.createDraft(settlementDate));
    }

    /** 활성 정산서를 페이지 단위로 조회한다. soft-delete 행은 repository restriction으로 제외된다. */
    @Transactional(readOnly = true)
    public Page<SalesCommissionSettlement> list(Pageable pageable) {
        return repository.findAll(pageable);
    }

    /** 내부 식별자로 정산서 상세를 조회한다. UUID는 화면 표시용이 아니다. */
    @Transactional(readOnly = true)
    public SalesCommissionSettlement getOne(UUID settlementId) {
        return repository.findById(settlementId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "영업수수료 정산서를 찾을 수 없습니다: " + settlementId));
    }

    /** DRAFT 정산서를 정산 기준일 번호와 함께 확정한다. */
    public SalesCommissionSettlement confirm(UUID settlementId) {
        SalesCommissionSettlement settlement = repository.findById(settlementId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "영업수수료 정산서를 찾을 수 없습니다: " + settlementId));
        if (settlement.isRecalculationRequired()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "확정 취소 후 재확정하려면 최신 요율로 먼저 재계산해야 합니다");
        }
        String documentNo = settlement.getDocumentNo() == null
                ? numberService.next(settlement.getSettlementDate())
                : settlement.getDocumentNo();
        return repository.save(settlement.confirm(documentNo));
    }

    /** 결재가 붙지 않은 CONFIRMED 정산서의 확정을 취소하고 과거 snapshot을 이력화한다. */
    public SalesCommissionSettlement cancelConfirmation(UUID settlementId) {
        SalesCommissionSettlement settlement = claimService == null
                ? findSettlement(settlementId)
                : repository.findByIdAndIsDeletedFalseForUpdate(settlementId)
                        .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                                "영업수수료 정산서를 찾을 수 없습니다: " + settlementId));
        if (settlement.getStatus() != SalesCommissionSettlementStatus.CONFIRMED) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "CONFIRMED 상태에서만 영업수수료 정산 확정을 취소할 수 있습니다");
        }
        if (groupwareApprovalClient == null || groupwareApprovalClient
                .hasActiveSettlementApproval(settlement.getDocumentNo())) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "결재가 올라가 있어 영업수수료 정산 확정을 취소할 수 없습니다. 결재를 먼저 회수·반려해 주세요");
        }
        if (claimService != null) {
            claimService.assertNoActiveClaimsForLockedSettlement(settlement);
        }
        if (historyRepository == null) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "정산 snapshot 이력 저장소가 구성되지 않았습니다");
        }
        historyRepository.save(SalesCommissionSettlementSnapshotHistory.capture(settlement));
        return repository.save(settlement.cancelConfirmation());
    }

    /** 확정 취소로 DRAFT가 된 정산서의 기준일을 변경한다. */
    public SalesCommissionSettlement changeSettlementDate(UUID settlementId, LocalDate settlementDate) {
        return repository.save(findSettlement(settlementId).changeSettlementDate(settlementDate));
    }

    /** 정산서에 보관된 과거 확정 snapshot을 조회한다. */
    @Transactional(readOnly = true)
    public List<SalesCommissionSettlementSnapshotHistory> listSnapshotHistory(UUID settlementId) {
        if (historyRepository == null) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "정산 snapshot 이력 저장소가 구성되지 않았습니다");
        }
        return historyRepository.findAllBySettlementIdAndIsDeletedFalseOrderByCreatedAtAsc(settlementId);
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

    private SalesCommissionSettlement findSettlement(UUID settlementId) {
        return repository.findById(settlementId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "영업수수료 정산서를 찾을 수 없습니다: " + settlementId));
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
