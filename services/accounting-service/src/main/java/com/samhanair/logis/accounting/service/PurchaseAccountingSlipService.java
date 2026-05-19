package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.PurchaseAccountingSlip;
import com.samhanair.logis.accounting.domain.PurchaseSlipStatus;
import com.samhanair.logis.accounting.repository.PurchaseAccountingSlipRepository;
import com.samhanair.logis.accounting.web.dto.CreatePurchaseAccountingSlipRequest;
import com.samhanair.logis.accounting.web.dto.PurchaseAccountingSlipResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class PurchaseAccountingSlipService {
    private static final LocalDate DEFAULT_FROM = LocalDate.of(1900, 1, 1);
    private static final LocalDate DEFAULT_TO = LocalDate.of(9999, 12, 31);

    private final PurchaseAccountingSlipRepository slipRepository;
    private final PurchaseAccountingSlipCreateAttemptService createAttemptService;

    @Transactional(readOnly = true)
    public List<PurchaseAccountingSlipResponse> list(
            LocalDate from,
            LocalDate to,
            String partnerCode,
            PurchaseSlipStatus status) {
        LocalDate resolvedFrom = from == null ? DEFAULT_FROM : from;
        LocalDate resolvedTo = to == null ? DEFAULT_TO : to;
        String normalizedPartnerCode = partnerCode == null || partnerCode.isBlank()
                ? null
                : partnerCode.trim();
        return slipRepository.findByFilters(resolvedFrom, resolvedTo, normalizedPartnerCode, status)
                .stream()
                .map(PurchaseAccountingSlipResponse::of)
                .toList();
    }

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
