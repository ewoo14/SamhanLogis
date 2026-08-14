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
                : escapeLikeLiteral(partnerCode.trim());
        return slipRepository.findByFilters(resolvedFrom, resolvedTo, normalizedPartnerCode, status)
                .stream()
                .map(PurchaseAccountingSlipResponse::of)
                .toList();
    }

    private static String escapeLikeLiteral(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
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

    /**
     * 입고전표를 DRAFT 에서 POSTED 로 전이한다.
     *
     * @param slipNo 내부 표준 전표번호({@code yyyy/MM/dd-N}). Controller 에서 하이픈 slug 를 정규화해 전달한다.
     * @param actorUserId 처리자 ID
     */
    @Transactional
    public void post(String slipNo, String actorUserId) {
        PurchaseAccountingSlip slip = slipRepository.findBySlipNo(slipNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "입고전표 없음: " + slipNo));
        slip.post(actorUserId);
    }
}
