package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.DailyClosing;
import com.samhanair.logis.accounting.domain.DailyClosingKind;
import com.samhanair.logis.accounting.domain.DailyClosingSourceKind;
import com.samhanair.logis.accounting.repository.DailyClosingRepository;
import com.samhanair.logis.accounting.web.dto.DailyClosingDetailResponse;
import java.time.LocalDate;
import java.util.UUID;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Q5 서버 권위 일마감 검증과 회계전표 생성 게이트. */
@Service
@RequiredArgsConstructor
public class DailyClosingVerificationService {

    private final MonthEndCloseService monthEndCloseService;
    private final DailyClosingRepository dailyClosingRepository;

    /** 일마감 저장 전에 서버 재검증 결과를 계산한다. 요청 Boolean은 이 경로에 없다. */
    @Transactional(readOnly = true)
    public VerificationResult verifyBeforeClose(LocalDate date, DailyClosingKind kind,
                                                DailyClosingSourceKind sourceKind) {
        try {
            DailyClosingDetailResponse detail = monthEndCloseService.getDailyDetail(date, kind, sourceKind);
            boolean hasAmount = detail.totalAmount() != null && detail.totalAmount().signum() > 0;
            boolean verified = detail.productSummaries() != null
                    && (!hasAmount || !detail.productSummaries().isEmpty())
                    && detail.productSummaries().stream().allMatch(this::isVerified);
            return verified
                    ? VerificationResult.verified()
                    : VerificationResult.amountMismatch();
        } catch (RuntimeException ex) {
            return VerificationResult.unavailable();
        }
    }

    /** 회계전표 생성 전에 서버가 잠근 일마감 snapshot을 확인한다. */
    @Transactional(readOnly = true)
    public VerificationResult requireLockedClosing(LocalDate date, DailyClosingKind kind,
                                                   DailyClosingSourceKind sourceKind,
                                                   UUID partnerId) {
        DailyClosing closing = partnerId == null ? null : dailyClosingRepository
                .findByClosingDateAndPartnerIdAndClosingKindAndSourceKind(date, partnerId, kind, sourceKind)
                .orElse(null);
        if (closing == null) {
            closing = dailyClosingRepository
                    .findByClosingDateAndPartnerIdIsNullAndClosingKindAndSourceKind(date, kind, sourceKind)
                    .orElse(null);
        }
        if (closing == null) {
            closing = dailyClosingRepository.findAllByDateRange(date, date).stream()
                    .filter(candidate -> candidate.getClosingKind() == kind)
                    .filter(candidate -> candidate.isLocked())
                    .filter(candidate -> partnerId == null
                            ? candidate.getPartnerId() == null
                            : Objects.equals(candidate.getPartnerId(), partnerId)
                                    || candidate.getPartnerId() == null)
                    .findFirst()
                    .orElse(null);
        }
        if (closing == null || !closing.isLocked()) {
            return VerificationResult.closingNotFound();
        }
        return VerificationResult.verified();
    }

    private boolean isVerified(DailyClosingDetailResponse.DailyProductLine line) {
        return Boolean.TRUE.equals(line.verified());
    }

    public enum Status {
        VERIFIED,
        CLOSING_NOT_FOUND,
        AMOUNT_MISMATCH,
        UNAVAILABLE
    }

    public record VerificationResult(Status status, String userMessage) {
        static VerificationResult verified() {
            return new VerificationResult(Status.VERIFIED, "");
        }

        static VerificationResult closingNotFound() {
            return new VerificationResult(Status.CLOSING_NOT_FOUND,
                    "일마감을 먼저 완료해 주세요");
        }

        static VerificationResult amountMismatch() {
            return new VerificationResult(Status.AMOUNT_MISMATCH,
                    "금액 검증을 완료해 주세요");
        }

        static VerificationResult unavailable() {
            return new VerificationResult(Status.UNAVAILABLE,
                    "서버가 금액을 판정하지 못했습니다. 잠시 후 다시 시도해 주세요");
        }

        public boolean allowed() {
            return status == Status.VERIFIED;
        }
    }
}
