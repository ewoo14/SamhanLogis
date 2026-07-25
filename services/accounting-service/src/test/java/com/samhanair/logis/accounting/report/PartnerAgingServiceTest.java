package com.samhanair.logis.accounting.report;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository.PartnerAccountTotal;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.math.BigDecimal;
import java.lang.reflect.RecordComponent;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * PartnerAgingService 단위 테스트.
 *
 * <p>fixture 분개 라인 시나리오 (110 외상매출금):
 * <ul>
 *   <li>거래처 A: debit 500,000 / credit 100,000 → 잔액 400,000</li>
 *   <li>거래처 B: debit 300,000 / credit 300,000 → 잔액 0 (제외)</li>
 *   <li>기타(null): debit 200,000 / credit 50,000 → 잔액 150,000 (ETC 그룹)</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PartnerAgingServiceTest {

    @Mock
    private JournalLineRepository journalLineRepository;

    @Mock
    private PartnerLookupClient partnerLookupClient;

    @InjectMocks
    private PartnerAgingService partnerAgingService;

    private static final LocalDate AS_OF = LocalDate.of(2026, 5, 10);
    private static final UUID PARTNER_A = UUID.randomUUID();
    private static final UUID PARTNER_B = UUID.randomUUID();
    private static final LocalDate OLDEST_DATE = LocalDate.of(2026, 2, 1);

    @BeforeEach
    void setUp() {
        // 110 외상매출금 집계 stub
        when(journalLineRepository.aggregateAgingByAccount(eq("110"), any(LocalDate.class)))
                .thenReturn(List.of(
                        partnerTotal(PARTNER_A, "110", new BigDecimal("500000"), new BigDecimal("100000")),
                        partnerTotal(PARTNER_B, "110", new BigDecimal("300000"), new BigDecimal("300000")),
                        partnerTotal(null,      "110", new BigDecimal("200000"), new BigDecimal("50000"))
                ));

        // 201 외상매입금 집계 stub
        when(journalLineRepository.aggregateAgingByAccount(eq("201"), any(LocalDate.class)))
                .thenReturn(List.of(
                        partnerTotal(PARTNER_A, "201", new BigDecimal("100000"), new BigDecimal("600000"))
                ));

        // partnerLookupClient stub
        when(partnerLookupClient.findByPartnerIdsBatch(anyList()))
                .thenAnswer(invocation -> {
                    @SuppressWarnings("unchecked")
                    List<UUID> ids = invocation.getArgument(0, List.class);
                    if (ids.contains(PARTNER_A)) {
                        return Map.of(PARTNER_A,
                                new PartnerSummary(PARTNER_A, "P-001", "삼한물류", "111-22-33333", null));
                    }
                    return Map.of();
                });

        // oldestJournalDate stub
        when(journalLineRepository.findOldestJournalDate(eq(PARTNER_A), any(), any(LocalDate.class)))
                .thenReturn(Optional.of(OLDEST_DATE));
        when(journalLineRepository.findOldestJournalDate(eq(PARTNER_B), any(), any(LocalDate.class)))
                .thenReturn(Optional.empty());
    }

    @Test
    @DisplayName("미수금(RECEIVABLE) — 거래처 잔액 양수만 포함, 0인 거래처 제외")
    void findReceivable_excludesZeroBalance() {
        PartnerAgingResponse resp = partnerAgingService.findReceivable(AS_OF);

        assertThat(resp.type()).isEqualTo("RECEIVABLE");
        assertThat(resp.accountCode()).isEqualTo("110");
        // PARTNER_B 잔액 0 → 제외. PARTNER_A + ETC 2건
        assertThat(resp.lines()).hasSize(2);
    }

    @Test
    @DisplayName("미수금(RECEIVABLE) — 거래처 잔액 및 partnerCode 검증")
    void findReceivable_partnerBalanceAndCode() {
        PartnerAgingResponse resp = partnerAgingService.findReceivable(AS_OF);

        PartnerAgingLine lineA = resp.lines().stream()
                .filter(l -> "P-001".equals(l.partnerCode()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("거래처 A 라인 없음"));

        assertThat(lineA.balance()).isEqualByComparingTo("400000");
        assertThat(lineA.bizNo()).isEqualTo("1112233333");
        assertThat(lineA.partnerName()).isEqualTo("삼한물류");
    }

    @Test
    @DisplayName("미수금(RECEIVABLE) — oldestUnpaidDate 및 agingDays 검증")
    void findReceivable_agingDays() {
        PartnerAgingResponse resp = partnerAgingService.findReceivable(AS_OF);

        PartnerAgingLine lineA = resp.lines().stream()
                .filter(l -> "P-001".equals(l.partnerCode()))
                .findFirst()
                .orElseThrow();

        assertThat(lineA.oldestUnpaidDate()).isEqualTo(OLDEST_DATE);
        // 2026-02-01 ~ 2026-05-10 = 98일
        assertThat(lineA.agingDays()).isEqualTo(98);
    }

    @Test
    @DisplayName("미수금(RECEIVABLE) — partnerId null 라인은 '기타' 그룹으로 집계")
    void findReceivable_etcGroup() {
        PartnerAgingResponse resp = partnerAgingService.findReceivable(AS_OF);

        PartnerAgingLine etc = resp.lines().stream()
                .filter(l -> "ETC".equals(l.partnerCode()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("ETC 그룹 없음"));

        assertThat(etc.partnerName()).isEqualTo("기타");
        assertThat(etc.balance()).isEqualByComparingTo("150000");
        assertThat(PartnerAgingLine.class.getRecordComponents())
                .extracting(RecordComponent::getName)
                .doesNotContain("partnerId");
    }

    @Test
    @DisplayName("미지급금(PAYABLE) — credit - debit 잔액 계산")
    void findPayable_balanceCalculation() {
        PartnerAgingResponse resp = partnerAgingService.findPayable(AS_OF);

        assertThat(resp.type()).isEqualTo("PAYABLE");
        assertThat(resp.accountCode()).isEqualTo("201");
        assertThat(resp.lines()).hasSize(1);

        PartnerAgingLine line = resp.lines().get(0);
        // credit 600,000 - debit 100,000 = 500,000
        assertThat(line.balance()).isEqualByComparingTo("500000");
    }

    @Test
    @DisplayName("SP-08-FU2 P2-3 회귀 — findByPartnerId 실 구현 후 partnerCode/partnerName 정상 표시")
    void findReceivable_partnerIdLookup_returnsCodeAndName() {
        // PARTNER_A 는 setUp 에서 batch lookup → "P-001" / "삼한물류" stub 이미 설정됨.
        PartnerAgingResponse resp = partnerAgingService.findReceivable(AS_OF);

        PartnerAgingLine lineA = resp.lines().stream()
                .filter(l -> "P-001".equals(l.partnerCode()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("거래처 A 라인 없음 (findByPartnerId 미구현 fallback 의심)"));

        // 실 구현 시 "(미조회)" 대신 정상 거래처명 반환
        assertThat(lineA.partnerName()).isEqualTo("삼한물류");
        assertThat(lineA.partnerCode()).isEqualTo("P-001");
    }

    @Test
    @DisplayName("UUID 비노출 회귀 — findByPartnerId empty 반환 시 미등록 + 미조회 표시")
    void findReceivable_partnerIdLookup_emptyFallback() {
        // PARTNER_B 는 setUp 에서 batch lookup 미포함. 잔액은 0 이므로 제외됨.
        // 잔액 있는 별도 거래처 C 로 검증
        UUID partnerC = UUID.randomUUID();
        when(journalLineRepository.aggregateAgingByAccount(eq("110"), any(LocalDate.class)))
                .thenReturn(List.of(
                        partnerTotal(partnerC, "110", new BigDecimal("100000"), BigDecimal.ZERO)
                ));
        when(partnerLookupClient.findByPartnerIdsBatch(anyList()))
                .thenReturn(Map.of());
        when(journalLineRepository.findOldestJournalDate(eq(partnerC), any(), any(LocalDate.class)))
                .thenReturn(Optional.empty());

        PartnerAgingResponse resp = partnerAgingService.findReceivable(AS_OF);

        assertThat(resp.lines()).hasSize(1);
        PartnerAgingLine lineC = resp.lines().get(0);
        // empty fallback: UUID 를 응답 필드로도 노출하지 않는다.
        assertThat(PartnerAgingLine.class.getRecordComponents())
                .extracting(RecordComponent::getName)
                .doesNotContain("partnerId");
        assertThat(lineC.partnerCode()).isEqualTo("미등록");
        assertThat(lineC.bizNo()).isEqualTo("");
        assertThat(lineC.partnerCode()).isNotEqualTo(partnerC.toString());
        assertThat(lineC.partnerName()).isEqualTo("(미조회)");
    }

    @Test
    @DisplayName("partner-service 5xx — 대표 구 Map 소비처도 빈 맵 200 대신 502 fail-closed")
    void findReceivable_partnerServiceUnavailable_returns502() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://partner-service");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken("test-token");
        // #831 R-6: 프로덕션 생성자가 이제 자체 timeout requestFactory 를 설정해 MockRestServiceServer
        // 의 mock requestFactory 를 덮어쓰므로, build() 까지 마친 RestClient 를 테스트 전용 생성자로 주입한다.
        PartnerLookupClient realClient = new PartnerLookupClient(builder.build(), props, new ObjectMapper());
        PartnerAgingService service = new PartnerAgingService(journalLineRepository, realClient);

        server.expect(requestTo("http://partner-service/internal/partners/lookup-by-ids"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));

        assertThatThrownBy(() -> service.findReceivable(AS_OF))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.PARTNER_IDENTITY_LOOKUP_UNAVAILABLE));
        server.verify();
    }

    // ── fixture 헬퍼 ──

    private PartnerAccountTotal partnerTotal(UUID partnerId, String accountCode,
                                              BigDecimal debit, BigDecimal credit) {
        return new PartnerAccountTotal() {
            @Override public UUID getPartnerId()       { return partnerId; }
            @Override public String getAccountCode()   { return accountCode; }
            @Override public BigDecimal getDebitTotal()  { return debit; }
            @Override public BigDecimal getCreditTotal() { return credit; }
        };
    }
}
