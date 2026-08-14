package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.domain.DailyClosingKind;
import com.samhanair.logis.accounting.domain.DailyClosingSourceKind;
import com.samhanair.logis.accounting.repository.DailyClosingRepository;
import com.samhanair.logis.accounting.web.dto.DailyClosingDetailResponse;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class DailyClosingVerificationServiceTest {

    private static final LocalDate DATE = LocalDate.of(2026, 8, 14);

    @Test
    void 서버_재검증에서_불일치가_있으면_금액검증미완료로_분류한다() {
        MonthEndCloseService detailService = mock(MonthEndCloseService.class);
        when(detailService.getDailyDetail(DATE, DailyClosingKind.SALES,
                DailyClosingSourceKind.TAX_INVOICE)).thenReturn(detail(false));

        DailyClosingVerificationService service = new DailyClosingVerificationService(
                detailService, mock(DailyClosingRepository.class));

        var result = service.verifyBeforeClose(DATE, DailyClosingKind.SALES,
                DailyClosingSourceKind.TAX_INVOICE);

        assertThat(result.status()).isEqualTo(DailyClosingVerificationService.Status.AMOUNT_MISMATCH);
        assertThat(result.userMessage()).contains("금액 검증");
    }

    @Test
    void 서버_판정_실패는_사용자_수정사항이_아닌_서버판정불가로_분류한다() {
        MonthEndCloseService detailService = mock(MonthEndCloseService.class);
        when(detailService.getDailyDetail(DATE, DailyClosingKind.SALES,
                DailyClosingSourceKind.TAX_INVOICE)).thenThrow(new RuntimeException("product-service down"));

        DailyClosingVerificationService service = new DailyClosingVerificationService(
                detailService, mock(DailyClosingRepository.class));

        var result = service.verifyBeforeClose(DATE, DailyClosingKind.SALES,
                DailyClosingSourceKind.TAX_INVOICE);

        assertThat(result.status()).isEqualTo(DailyClosingVerificationService.Status.UNAVAILABLE);
        assertThat(result.userMessage()).contains("서버가 금액을 판정하지 못했습니다");
    }

    @Test
    void 요청값과_무관하게_잠긴_일마감만_생성게이트를_통과한다() {
        DailyClosingRepository repository = mock(DailyClosingRepository.class);
        UUID partnerId = UUID.randomUUID();
        when(repository.findByClosingDateAndPartnerIdAndClosingKindAndSourceKind(
                DATE, partnerId, DailyClosingKind.SALES, DailyClosingSourceKind.SALES_SLIP))
                .thenReturn(Optional.empty());
        when(repository.findByClosingDateAndPartnerIdIsNullAndClosingKindAndSourceKind(
                DATE, DailyClosingKind.SALES, DailyClosingSourceKind.SALES_SLIP))
                .thenReturn(Optional.empty());

        DailyClosingVerificationService service = new DailyClosingVerificationService(
                mock(MonthEndCloseService.class), repository);

        var result = service.requireLockedClosing(DATE, DailyClosingKind.SALES,
                DailyClosingSourceKind.SALES_SLIP, partnerId);

        assertThat(result.status()).isEqualTo(DailyClosingVerificationService.Status.CLOSING_NOT_FOUND);
        assertThat(result.userMessage()).contains("일마감");
    }

    private static DailyClosingDetailResponse detail(boolean verified) {
        return new DailyClosingDetailResponse(DATE, 1, BigDecimal.TEN, BigDecimal.ONE,
                BigDecimal.valueOf(11), BigDecimal.ZERO, List.of(),
                List.of(new DailyClosingDetailResponse.DailyProductLine(
                        "상품", "MODEL", "UNKNOWN", BigDecimal.ONE, BigDecimal.TEN,
                        BigDecimal.TEN, null, null, null, null, null, verified,
                        verified ? "VERIFIED" : "AMOUNT_MISMATCH")));
    }
}
