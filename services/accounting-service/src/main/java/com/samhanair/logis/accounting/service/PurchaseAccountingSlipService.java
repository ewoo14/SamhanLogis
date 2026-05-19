package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.PurchaseAccountingSlip;
import com.samhanair.logis.accounting.repository.PurchaseAccountingSlipRepository;
import com.samhanair.logis.accounting.web.dto.CreatePurchaseAccountingSlipRequest;
import com.samhanair.logis.accounting.web.dto.PurchaseAccountingSlipResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class PurchaseAccountingSlipService {

    private final PurchaseAccountingSlipRepository slipRepository;
    private final PurchaseAccountingSlipCreateAttemptService createAttemptService;

    public PurchaseAccountingSlipResponse createDraft(CreatePurchaseAccountingSlipRequest req, String actorUserId) {
        int attempt = 0;
        while (true) {
            try {
                attempt++;
                return createAttemptService.createDraftAttempt(req, actorUserId);
            } catch (DataIntegrityViolationException ex) {
                if (attempt >= 2 || !isSlipNoUniqueViolation(ex)) {
                    throw new BusinessException(ErrorCode.SAS_SLIP_NO_CONFLICT,
                            "slipNo 생성 충돌 (attempt=" + attempt + ")", ex);
                }
                log.warn("PurchaseAccountingSlip slipNo 충돌 retry — attempt={}", attempt);
            }
        }
    }

    private boolean isSlipNoUniqueViolation(DataIntegrityViolationException ex) {
        Throwable cause = ex.getMostSpecificCause();
        return cause != null && cause.getMessage() != null
                && cause.getMessage().contains("slip_no");
    }

    @Transactional
    public void post(String slipNo, String actorUserId) {
        PurchaseAccountingSlip slip = slipRepository.findBySlipNo(slipNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "매입전표 없음: " + slipNo));
        slip.post(actorUserId);
    }
}
