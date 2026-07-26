package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.repository.DailyClosingRepository;
import com.samhanair.logis.accounting.repository.PurchaseAccountingSlipRepository;
import com.samhanair.logis.accounting.repository.SalesAccountingSlipRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.accounting.web.dto.DailyClosingResponse;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

/**
 * [#929 재수렴 3차 V1] {@code DailyClosingService.list()} 의 partnerCode 필터가 URI path
 * 세그먼트로 안전하지 않은 입력(특수문자)에서도 목록 페이지를 깨뜨리지 않는지 고정한다.
 *
 * <p>재현 — partnerCode 필터에 '%'·'/'·".."류 문자가 들어오면 {@link PartnerLookupClient}
 * 가 partnerCode 를 URI path 세그먼트({@code /internal/partners/{partnerCode}})로 그대로
 * 사용해 partner-service 의 Spring Security StrictHttpFirewall 이 403/400 을 반환하고,
 * client 는 이를 각각 {@code MIG12_INTERNAL_AUTH_MISS}(503 fail-fast)·{@code UNAVAILABLE}
 * (502 로 격상, {@code PartnerLookupSupport.foundOrNull})로 승격한다 — 필터 입력 오타 하나로
 * 목록 페이지 전체가 깨진다. {@code DailyClosingService.java:216-217} 의 javadoc 은 이미
 * "필터 입력 오타에 페이지 전체가 깨지지 않는다"를 명시적 불변식으로 선언하고 있다.
 *
 * <p>[#929 재수렴 4차 D1·D2] 전달 가능/불가 판정 자체는 계약이 있는 client 로 옮겼다
 * ({@code PartnerLookupCodeTransportGuardTest}) — 이 클래스는 service 의 몫만 고정한다.
 *
 * <p>이 테스트는 3개 그룹으로 구성된다:
 * <ol>
 *   <li>전달 불가 입력(client NOT_FOUND) — 하드 오류 없이 빈 페이지, repository 미조회</li>
 *   <li>전달 가능한 자유입력 — 과차단 없이 여전히 조회로 넘어감</li>
 *   <li>전달 가능한 입력이 실제로 매칭되는 무회귀 경로</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
class DailyClosingServiceListPartnerFilterTest {

    private static final LocalDate FROM = LocalDate.of(2026, 7, 1);
    private static final LocalDate TO = LocalDate.of(2026, 7, 26);

    @Mock private DailyClosingRepository dailyClosingRepository;
    @Mock private TaxInvoiceRepository taxInvoiceRepository;
    @Mock private SalesAccountingSlipRepository salesAccountingSlipRepository;
    @Mock private PurchaseAccountingSlipRepository purchaseAccountingSlipRepository;
    @Mock private PartnerLookupClient partnerLookupClient;
    @Mock private DynamicPermissionClient dynamicPermissionClient;

    @InjectMocks private DailyClosingService dailyClosingService;

    /**
     * 리뷰 실측(#929 재수렴 3차 V1) 5개 입력 — 각각 partner-service 를 direct 호출하면
     * 403(percent/semicolon) 또는 400/500(slash·backslash·경로순회)을 반환해 client 가
     * 503/502 로 승격시킨 값들이다.
     *
     * <p>[#929 재수렴 4차 D1·D2] "네트워크 호출을 생략한다"는 단언은 계약이 있는
     * {@link PartnerLookupClient} 로 옮겼다(PartnerLookupCodeTransportGuardTest) — service 마다
     * 가드를 두면 하나만 빠져도 그 화면이 깨지고(3차가 ';' 를 빠뜨려 실제로 그랬다) 같은 계약을
     * 쓰는 나머지 15개 호출부가 남는다. 여기서는 service 의 몫만 고정한다: client 가 NOT_FOUND 를
     * 돌려주면 목록은 하드 오류 없이 빈 페이지로 성사하고 repository 를 건드리지 않는다.
     */
    @ParameterizedTest(name = "partnerCode=[{0}] 는 빈 페이지로 성사하고 repository 를 조회하지 않는다")
    @ValueSource(strings = {"50%", "P-2026-0004%", "%2F", "..", "P/2026", "P-2026-0004;"})
    @DisplayName("V1 — 전달 불가 partnerCode 필터(client NOT_FOUND)는 빈 페이지로 성사한다")
    void untransportablePartnerCodeFilter_resolvesToEmptyPage(String unsafeCode) {
        when(partnerLookupClient.findByPartnerCodeResult(unsafeCode))
                .thenReturn(PartnerLookupClient.LookupResult.notFound());

        Page<DailyClosingResponse> result = dailyClosingService.list(
                FROM, TO, null, null, unsafeCode, Pageable.ofSize(20), null);

        assertThat(result.getTotalElements())
                .as("partnerCode=[%s] 필터가 빈 페이지 대신 예외/다른 결과를 만듦", unsafeCode)
                .isZero();
        assertThat(result.getContent()).isEmpty();
        verifyNoInteractions(dailyClosingRepository);
    }

    /**
     * 리뷰 실측 — 특수문자를 포함해도 path 세그먼트 인코딩상 안전한 값은 여전히 200 으로
     * partner-service 까지 도달한다(#929 재수렴 3차 브리핑 표). 가드가 과차단하지 않음을 고정한다.
     */
    @ParameterizedTest(name = "partnerCode=[{0}] 는 여전히 partner-service 조회로 넘어간다(과차단 아님)")
    @ValueSource(strings = {"A&B", "서울에어컨", "a b", "#123", "P+2026", "P?x"})
    @DisplayName("V1 — 안전한 자유입력 필터는 특수문자가 있어도 과차단되지 않는다")
    void safeFreeTextPartnerCodeFilter_stillReachesPartnerService(String safeCode) {
        when(partnerLookupClient.findByPartnerCodeResult(safeCode))
                .thenReturn(PartnerLookupClient.LookupResult.notFound());

        Page<DailyClosingResponse> result = dailyClosingService.list(
                FROM, TO, null, null, safeCode, Pageable.ofSize(20), null);

        assertThat(result.getTotalElements()).isZero();
        verify(partnerLookupClient).findByPartnerCodeResult(safeCode);
    }

    @Test
    @DisplayName("V1 무회귀 — 안전한 partnerCode 가 실제로 존재하면 resolvedPartnerId 로 필터링한다")
    void safePartnerCodeFound_filtersByResolvedPartnerId() {
        UUID partnerId = UUID.randomUUID();
        PartnerSummary summary = new PartnerSummary(partnerId, "P-2026-0004", "테스트거래처", "1234567890", null);
        when(partnerLookupClient.findByPartnerCodeResult("P-2026-0004"))
                .thenReturn(PartnerLookupClient.LookupResult.found(summary));
        when(dailyClosingRepository.findByDateRangeAndKinds(
                eq(FROM), eq(TO), isNull(), isNull(), eq(partnerId), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));

        Page<DailyClosingResponse> result = dailyClosingService.list(
                FROM, TO, null, null, "P-2026-0004", Pageable.ofSize(20), null);

        assertThat(result.getTotalElements()).isZero();
        verify(dailyClosingRepository).findByDateRangeAndKinds(
                eq(FROM), eq(TO), isNull(), isNull(), eq(partnerId), any(Pageable.class));
    }
}
