package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;

import com.samhanair.logis.accounting.client.ChatRoomMappingClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.accounting.domain.AccountCategory;
import com.samhanair.logis.accounting.domain.ChartOfAccount;
import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.JournalLine;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.accounting.repository.ChartOfAccountRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceBatchRepository;
import com.samhanair.logis.accounting.domain.TaxInvoiceBatch;
import com.samhanair.logis.accounting.web.dto.LedgerImageResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

/**
 * LedgerImageService 단위 테스트 — BE-A9.
 *
 * <p>커버 시나리오 4건:
 * <ul>
 *   <li>분개 line — 정상 라인 시간순 + 누적 잔액</li>
 *   <li>잔액 — 차/대 누적 정확</li>
 *   <li>단톡방 join — chatRoomNames 응답 포함</li>
 *   <li>거래처 not found — partnerCode 미존재 시 NOT_FOUND</li>
 * </ul>
 *
 * <p>SP-08-FU2 P2-4 — ChartOfAccountRepository Mock 추가 (accountName 매핑용 — lenient stub).
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class LedgerImageServiceTest {

    @Mock private JournalLineRepository journalLineRepository;
    /** SP-08-FU2 P2-4 — accountName 매핑 캐시 조회용. lenient stub (빈 목록 반환). */
    @Mock private ChartOfAccountRepository chartOfAccountRepository;
    @Mock private PartnerLookupClient partnerLookupClient;
    @Mock private ChatRoomMappingClient chatRoomMappingClient;
    @Mock private TaxInvoiceBatchRepository taxInvoiceBatchRepository;
    @Spy private ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());

    @InjectMocks private LedgerImageService service;

    @BeforeEach
    void stubChartOfAccount() {
        // chartOfAccountRepository 기본 stub — accountName lookup 시 빈 리스트 반환 (lenient)
        lenient().when(chartOfAccountRepository.findAllById(org.mockito.ArgumentMatchers.anyCollection()))
                .thenReturn(List.of());
    }

    private static final LocalDate FROM = LocalDate.of(2026, 5, 1);
    private static final LocalDate TO = LocalDate.of(2026, 5, 31);

    @Test
    @DisplayName("분개 line — 정상 라인 시간순 + 누적 잔액")
    void normalLines() {
        UUID partnerId = UUID.randomUUID();
        when(partnerLookupClient.findByPartnerCode("P-001"))
                .thenReturn(Optional.of(new PartnerSummary(partnerId, "P-001",
                        "샘플", "111", "주소")));
        when(chatRoomMappingClient.findChatRoomNamesByPartnerCode("P-001"))
                .thenReturn(List.of("샘플단톡"));

        Journal j1 = newJournal("20260510-1", LocalDate.of(2026, 5, 10), "매출");
        JournalLine debit = JournalLine.create(j1, 1, "110",
                new BigDecimal("110000"), BigDecimal.ZERO, partnerId, "외상매출");
        when(journalLineRepository.findPartnerLinesInRange(eq(partnerId), eq(FROM), eq(TO)))
                .thenReturn(List.of(debit));

        LedgerImageResponse resp = service.getLedger("P-001", FROM, TO);

        assertThat(resp.partnerCode()).isEqualTo("P-001");
        assertThat(resp.partnerName()).isEqualTo("샘플");
        assertThat(resp.chatRoomNames()).containsExactly("샘플단톡");
        assertThat(resp.lines()).hasSize(1);
        assertThat(resp.lines().get(0).balance()).isEqualByComparingTo("110000");
    }

    @Test
    @DisplayName("잔액 — 차/대 누적 정확 (debit 누적 + credit 차감)")
    void balanceAccumulation() {
        UUID partnerId = UUID.randomUUID();
        when(partnerLookupClient.findByPartnerCode("P-002"))
                .thenReturn(Optional.of(new PartnerSummary(partnerId, "P-002",
                        "잔액테스트", "222", "")));
        lenient().when(chatRoomMappingClient.findChatRoomNamesByPartnerCode(any()))
                .thenReturn(List.of());

        Journal j1 = newJournal("20260501-1", LocalDate.of(2026, 5, 1), "매출1");
        JournalLine line1 = JournalLine.create(j1, 1, "110",
                new BigDecimal("100000"), BigDecimal.ZERO, partnerId, "");
        Journal j2 = newJournal("20260510-1", LocalDate.of(2026, 5, 10), "수금");
        JournalLine line2 = JournalLine.create(j2, 1, "110",
                BigDecimal.ZERO, new BigDecimal("30000"), partnerId, "");
        Journal j3 = newJournal("20260520-1", LocalDate.of(2026, 5, 20), "매출2");
        JournalLine line3 = JournalLine.create(j3, 1, "110",
                new BigDecimal("50000"), BigDecimal.ZERO, partnerId, "");
        when(journalLineRepository.findPartnerLinesInRange(eq(partnerId), eq(FROM), eq(TO)))
                .thenReturn(List.of(line1, line2, line3));

        LedgerImageResponse resp = service.getLedger("P-002", FROM, TO);

        assertThat(resp.lines()).hasSize(3);
        assertThat(resp.lines().get(0).balance()).isEqualByComparingTo("100000");
        assertThat(resp.lines().get(1).balance()).isEqualByComparingTo("70000");
        assertThat(resp.lines().get(2).balance()).isEqualByComparingTo("120000");
    }

    @Test
    @DisplayName("단톡방 join — 여러 단톡방 매핑 응답 포함")
    void multipleChatRooms() {
        UUID partnerId = UUID.randomUUID();
        when(partnerLookupClient.findByPartnerCode("P-003"))
                .thenReturn(Optional.of(new PartnerSummary(partnerId, "P-003", "단톡테스트", "", "")));
        when(chatRoomMappingClient.findChatRoomNamesByPartnerCode("P-003"))
                .thenReturn(List.of("단톡A", "단톡B", "단톡C"));
        when(journalLineRepository.findPartnerLinesInRange(eq(partnerId), eq(FROM), eq(TO)))
                .thenReturn(List.of());

        LedgerImageResponse resp = service.getLedger("P-003", FROM, TO);

        assertThat(resp.chatRoomNames()).containsExactly("단톡A", "단톡B", "단톡C");
        assertThat(resp.lines()).isEmpty();
    }

    @Test
    @DisplayName("거래처 not found — NOT_FOUND")
    void partnerNotFound() {
        when(partnerLookupClient.findByPartnerCode("UNKNOWN")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getLedger("UNKNOWN", FROM, TO))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("존재하지 않는 거래처");
    }

    @Test
    @DisplayName("partner-service UNAVAILABLE은 거래처 미존재 404로 붕괴하지 않는다")
    void partnerUnavailableIsNotNotFound() {
        when(partnerLookupClient.findByPartnerCodeResult("P-DOWN"))
                .thenReturn(PartnerLookupClient.LookupResult.unavailable());

        assertThatThrownBy(() -> service.getLedger("P-DOWN", FROM, TO))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException failure = (BusinessException) ex;
                    assertThat(failure.getErrorCode())
                            .isEqualTo(ErrorCode.PARTNER_IDENTITY_LOOKUP_UNAVAILABLE);
                    assertThat(failure.getMessage())
                            .contains("거래처 조회를 일시적으로")
                            .doesNotContain("존재하지 않는 거래처");
                });
    }

    @Test
    @DisplayName("조회 결과는 기존 TaxInvoiceBatch 스냅샷 계약으로 자동 저장된다")
    void getLedger_autoSavesSnapshotUsingExistingBatchContract() {
        UUID partnerId = UUID.randomUUID();
        when(partnerLookupClient.findByPartnerCode("P-AUTO"))
                .thenReturn(Optional.of(new PartnerSummary(partnerId, "P-AUTO", "자동저장", "", "")));
        when(chatRoomMappingClient.findChatRoomNamesByPartnerCode("P-AUTO"))
                .thenReturn(List.of());
        when(journalLineRepository.findPartnerLinesInRange(eq(partnerId), eq(FROM), eq(TO)))
                .thenReturn(List.of());

        service.getLedger("P-AUTO", FROM, TO);

        verify(taxInvoiceBatchRepository).save(any(TaxInvoiceBatch.class));
    }

    @Test
    @DisplayName("SP-08-FU2 P2-4 — accountName 매핑: ChartOfAccount 조회 결과가 LedgerLine.accountName 에 반영")
    void accountNameMappedFromChartOfAccount() {
        UUID partnerId = UUID.randomUUID();
        when(partnerLookupClient.findByPartnerCode("P-004"))
                .thenReturn(Optional.of(new PartnerSummary(partnerId, "P-004", "계정명테스트", "", "")));
        when(chatRoomMappingClient.findChatRoomNamesByPartnerCode("P-004"))
                .thenReturn(List.of());

        Journal j1 = newJournal("20260501-2", LocalDate.of(2026, 5, 1), "매출");
        JournalLine line = JournalLine.create(j1, 1, "110",
                new BigDecimal("50000"), BigDecimal.ZERO, partnerId, "외상매출");
        when(journalLineRepository.findPartnerLinesInRange(eq(partnerId), eq(FROM), eq(TO)))
                .thenReturn(List.of(line));

        // ChartOfAccount stub — code="110", name="외상매출금"
        ChartOfAccount coa = ChartOfAccount.create("110", "외상매출금",
                AccountCategory.ASSET, "100", true, 1);
        when(chartOfAccountRepository.findAllById(Set.of("110")))
                .thenReturn(List.of(coa));

        LedgerImageResponse resp = service.getLedger("P-004", FROM, TO);

        assertThat(resp.lines()).hasSize(1);
        assertThat(resp.lines().get(0).accountCode()).isEqualTo("110");
        assertThat(resp.lines().get(0).accountName()).isEqualTo("외상매출금");
    }

    private static Journal newJournal(String no, LocalDate date, String desc) {
        Journal j = Journal.create(no, date, desc, JournalSourceType.MANUAL, (java.util.UUID) null);
        try {
            Field idField = Journal.class.getDeclaredField("id");
            idField.setAccessible(true);
            idField.set(j, UUID.randomUUID());
        } catch (Exception ignore) {
            // ignore — id 미지정 허용
        }
        return j;
    }
}
