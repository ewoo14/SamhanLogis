package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.SalesAccountingSlip;
import com.samhanair.logis.accounting.domain.DailyClosingKind;
import com.samhanair.logis.accounting.domain.DailyClosingSourceKind;
import com.samhanair.logis.accounting.domain.SalesAccountingSlipAllocation;
import com.samhanair.logis.accounting.domain.SalesAccountingSlipLine;
import com.samhanair.logis.accounting.domain.SalesSlipStatus;
import com.samhanair.logis.accounting.repository.SalesAccountingSlipRepository;
import com.samhanair.logis.accounting.web.dto.CreateSalesAccountingSlipRequest;
import com.samhanair.logis.accounting.web.dto.SalesAccountingSlipResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class SalesAccountingSlipService {
    private static final LocalDate DEFAULT_FROM = LocalDate.of(1900, 1, 1);
    private static final LocalDate DEFAULT_TO = LocalDate.of(9999, 12, 31);

    private final SalesAccountingSlipRepository slipRepository;
    private final SalesAccountingSlipCreateAttemptService createAttemptService;
    private final DailyClosingVerificationService dailyClosingVerificationService;

    @Transactional(readOnly = true)
    public List<SalesAccountingSlipResponse> list(
            LocalDate from,
            LocalDate to,
            String partnerCode,
            SalesSlipStatus status) {
        LocalDate resolvedFrom = from == null ? DEFAULT_FROM : from;
        LocalDate resolvedTo = to == null ? DEFAULT_TO : to;
        String normalizedPartnerCode = partnerCode == null || partnerCode.isBlank()
                ? null
                : escapeLikeLiteral(partnerCode.trim());
        return slipRepository.findByFilters(resolvedFrom, resolvedTo, normalizedPartnerCode, status)
                .stream()
                .map(SalesAccountingSlipResponse::of)
                .toList();
    }

    private static String escapeLikeLiteral(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    public SalesAccountingSlipResponse createDraft(CreateSalesAccountingSlipRequest req, String actorUserId) {
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
                log.warn("SalesAccountingSlip slipNo 충돌 retry — attempt={}", attempt);
            }
        }
    }

    private boolean isSlipNoUniqueViolation(DataIntegrityViolationException ex) {
        Throwable cause = ex.getMostSpecificCause();
        return cause != null && cause.getMessage() != null
                && cause.getMessage().contains("slip_no");
    }

    /**
     * 매출전표를 DRAFT 에서 POSTED 로 전이한다.
     *
     * @param slipNo 내부 표준 전표번호({@code yyyy/MM/dd-N}). Controller 에서 하이픈 slug 를 정규화해 전달한다.
     * @param actorUserId 처리자 ID
     */
    @Transactional
    public void post(String slipNo, String actorUserId) {
        SalesAccountingSlip slip = slipRepository.findBySlipNo(slipNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "매출전표 없음: " + slipNo));
        slip.post(actorUserId);
    }

    /**
     * 회계전표와 하위 line/allocation을 하나의 트랜잭션에서 soft-delete한다.
     *
     * <p>삭제된 allocation은 컬렉션에서 제거하지 않는다. {@link com.samhanair.logis.common.entity.BaseEntity}
     * 의 삭제 표식만 변경해야 물리 삭제와 orphanRemoval을 피하고, source line 합계 쿼리의
     * {@code is_deleted = false} 조건에 따라 삭제 후 재생성이 가능해진다.
     * 일마감 검증은 어떤 자식도 변경하기 전에 수행하므로 삭제가 생성 게이트의 우회로가 되지 않는다.
     * 이미 삭제된 전표는 {@code @SQLRestriction}으로 조회되지 않으므로 NOT_FOUND를 반환한다.
     */
    @Transactional
    public void delete(String slipNo, String actorUserId) {
        SalesAccountingSlip slip = slipRepository.findBySlipNo(slipNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "매출전표가 없습니다: " + slipNo));

        DailyClosingVerificationService.VerificationResult gate =
                dailyClosingVerificationService.requireLockedClosing(
                        slip.getSlipDate(), DailyClosingKind.SALES, DailyClosingSourceKind.SALES_SLIP,
                        slip.getPartnerId());
        if (!gate.allowed()) {
            throw new BusinessException(ErrorCode.CONFLICT, gate.userMessage());
        }

        LocalDateTime deletedAt = LocalDateTime.now();
        for (SalesAccountingSlipLine line : slip.getLines()) {
            for (SalesAccountingSlipAllocation allocation : line.getAllocations()) {
                allocation.markDeleted(actorUserId, deletedAt);
            }
            line.markDeleted(actorUserId, deletedAt);
        }
        slip.markDeleted(actorUserId, deletedAt);
        slipRepository.flush();
    }
}
