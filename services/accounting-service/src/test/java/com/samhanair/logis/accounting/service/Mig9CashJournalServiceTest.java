package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.KftcDepositRecord;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.CashReceipt;
import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.accounting.domain.TaxInvoiceLine;
import com.samhanair.logis.accounting.repository.JournalRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.common.ecount.EcountMig9JournalResult;
import com.samhanair.logis.common.exception.BusinessException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.data.domain.PageImpl;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

@ExtendWith(MockitoExtension.class)
class Mig9CashJournalServiceTest {

    @Mock private NamedParameterJdbcTemplate jdbcTemplate;
    private Mig9CashJournalService service;

    @BeforeEach
    void setUp() {
        service = new Mig9CashJournalService(jdbcTemplate);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Object.class)))
                .thenReturn(null);
        lenient().when(jdbcTemplate.queryForObject(contains("chart_of_accounts"), any(SqlParameterSource.class), eq(String.class)))
                .thenAnswer(invocation -> {
                    SqlParameterSource params = invocation.getArgument(1);
                    if (params.hasValue("code")) {
                        String code = (String) params.getValue("code");
                        return switch (code) {
                            case "102" -> "102";
                            case "110" -> "110";
                            default -> throw new EmptyResultDataAccessException(1);
                        };
                    }
                    String name = (String) params.getValue("name");
                    return switch (name) {
                        case "지급수수료" -> "831";
                        case "보통예금" -> "102";
                        case "외상매출금" -> "110";
                        default -> throw new EmptyResultDataAccessException(1);
                    };
                });
        lenient().when(jdbcTemplate.queryForObject(contains("INSERT INTO journals"), any(SqlParameterSource.class), eq(UUID.class)))
                .thenReturn(journalId());
        lenient().when(jdbcTemplate.update(anyString(), any(SqlParameterSource.class))).thenReturn(1);
    }

    @Test
    void 정상_CashDisbursement_1건은_Journal과_Line_2건을_생성한다() {
        Mig9CashJournalService.CashRow row =
                row(7, "CD-001", "REF-CD-001", new BigDecimal("1000"), null);
        disbursements(row);

        EcountMig9JournalResult result = service.generateFromDisbursements(500, "tester");

        assertThat(result.cashDisbursementJournalsCreated()).isEqualTo(1);
        assertThat(result.rejected()).isZero();
        SqlParameterSource journal = journalParams();
        assertThat(journal.getValue("journalNo")).isEqualTo("JD-" + row.slipNo());
        assertThat(journal.getValue("sourceType")).isEqualTo("CASH_DISBURSEMENT");
        assertThat(journal.getValue("sourceRef")).isEqualTo(row.externalRef());
        List<SqlParameterSource> lines = lineParams();
        assertThat(lines).extracting(p -> p.getValue("accountCode")).containsExactly("831", "102");
        assertThat(lines).extracting(p -> p.getValue("partnerId"))
                .containsExactly(row.partnerId(), row.partnerId());
        assertThat(lines).extracting(p -> p.getValue("debitAmount"))
                .containsExactly(row.amount(), BigDecimal.ZERO);
        assertThat(lines).extracting(p -> p.getValue("creditAmount"))
                .containsExactly(BigDecimal.ZERO, row.amount());
    }

    @Test
    void multi_row_disbursement_2건은_각각_Journal_생성한다() {
        disbursements(
                row(1, "CD-001", "REF-CD-001", new BigDecimal("1000"), null),
                row(2, "CD-002", "REF-CD-002", new BigDecimal("2000"), null));

        EcountMig9JournalResult result = service.generateFromDisbursements(500, "tester");

        assertThat(result.cashDisbursementJournalsCreated()).isEqualTo(2);
        assertThat(result.skipped()).isZero();
        assertThat(result.rejected()).isZero();
        assertThat(journalParams(2)).extracting(p -> p.getValue("journalNo"))
                .containsExactly("JD-CD-001", "JD-CD-002");
    }

    @Test
    void disbursement_journal_no는_JD_접두사를_사용한다() {
        disbursements(row(1, "SAME-001", "REF-CD-SAME", new BigDecimal("1000"), null));

        service.generateFromDisbursements(500, "tester");

        assertThat(journalParams().getValue("journalNo")).isEqualTo("JD-SAME-001");
    }

    @Test
    void receipt_journal_no는_JR_접두사를_사용한다() {
        receipts(row(1, "SAME-001", "REF-CR-SAME", new BigDecimal("1000"), null));

        service.generateFromReceipts(500, "tester");

        assertThat(journalParams().getValue("journalNo")).isEqualTo("JR-SAME-001");
    }

    @Test
    void slip_no_충돌_안전성_검증() {
        disbursements(row(1, "SAME-001", "REF-CD-SAME", new BigDecimal("1000"), null));
        service.generateFromDisbursements(500, "tester");
        SqlParameterSource disbursementJournal = journalParams();

        clearInvocations(jdbcTemplate);
        receipts(row(1, "SAME-001", "REF-CR-SAME", new BigDecimal("1000"), null));
        service.generateFromReceipts(500, "tester");
        SqlParameterSource receiptJournal = journalParams();

        assertThat(disbursementJournal.getValue("journalNo")).isEqualTo("JD-SAME-001");
        assertThat(receiptJournal.getValue("journalNo")).isEqualTo("JR-SAME-001");
    }

    @Test
    void 정상_CashReceipt_1건은_현금_차변과_외상매출금_대변을_생성한다() {
        receipts(row(3, "CR-001", "REF-CR-001", new BigDecimal("2000"), null));

        EcountMig9JournalResult result = service.generateFromReceipts(500, "tester");

        assertThat(result.cashReceiptJournalsCreated()).isEqualTo(1);
        assertThat(journalParams().getValue("sourceType")).isEqualTo("CASH_RECEIPT");
        assertThat(lineParams()).extracting(p -> p.getValue("accountCode"))
                .containsExactly(
                        CashReceipt.DEFAULT_DEBIT_ACCOUNT_CODE,
                        CashReceipt.DEFAULT_CREDIT_ACCOUNT_CODE);
    }

    @Test
    void receipt_기본_계정_코드가_없으면_MIG9_DEFAULT_ACCOUNT_MISSING_reject() {
        receipts(row(1, "CR-001", "REF-CR-001", new BigDecimal("1000"), null));
        when(jdbcTemplate.queryForObject(contains("chart_of_accounts"), any(SqlParameterSource.class), eq(String.class)))
                .thenThrow(new EmptyResultDataAccessException(1));

        EcountMig9JournalResult result = service.generateFromReceipts(500, "tester");

        assertThat(result.rejected()).isEqualTo(1);
        assertThat(result.samples()).extracting(EcountMig9JournalResult.Sample::code)
                .containsExactly("MIG9_DEFAULT_ACCOUNT_MISSING");
        assertThat(result.samples().get(0).message())
                .contains("보통예금(102)/외상매출금(110)");
    }

    @Test
    void receipt_MIG9_조회는_수기입금보고서를_제외하고_DEPOSIT_REPORT만_대상으로_한다() {
        receipts(row(3, "CR-001", "REF-CR-001", new BigDecimal("2000"), null));

        service.generateFromReceipts(500, "tester");

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).query(sql.capture(), any(SqlParameterSource.class),
                org.mockito.ArgumentMatchers.<RowMapper<Mig9CashJournalService.CashRow>>any());
        assertThat(sql.getValue()).contains("kind = 'DEPOSIT_REPORT'");
        // 라이브 취소(CANCELLED, journal_id null) 행에 유령 POSTED 분개가 생기지 않도록 CONFIRMED 만 대상.
        assertThat(sql.getValue()).contains("status = 'CONFIRMED'");
    }

    @Test
    void receipt_link는_journal_id가_비어있는_행에만_기록한다() {
        receipts(row(4, "CR-LINK", "REF-CR-LINK", new BigDecimal("3000"), null));

        service.generateFromReceipts(500, "tester");

        ArgumentCaptor<String> updateSql = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce())
                .update(updateSql.capture(), any(SqlParameterSource.class));
        String linkSql = updateSql.getAllValues().stream()
                .filter(value -> value.contains("UPDATE cash_receipts"))
                .findFirst()
                .orElseThrow();
        // 라이브 confirm/PATCH 와의 레이스에서 last-write-wins 고아 분개를 차단하는 SQL 가드.
        assertThat(linkSql).contains("journal_id IS NULL");
    }

    @Test
    void journal_id가_이미_있으면_skip한다() {
        disbursements(row(1, "CD-SKIP", "REF-SKIP", new BigDecimal("1000"), journalId()));

        EcountMig9JournalResult result = service.generateFromDisbursements(500, "tester");

        assertThat(result.skipped()).isEqualTo(1);
        assertThat(result.cashDisbursementJournalsCreated()).isZero();
    }

    @Test
    void 대상_cash_row가_없으면_MIG9_CASH_ROW_NOT_FOUND() {
        disbursements();

        assertThatThrownBy(() -> service.generateFromDisbursements(500, "tester"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("CashDisbursement");
    }

    @Test
    void 기본_계정이_없으면_MIG9_DEFAULT_ACCOUNT_MISSING_reject() {
        disbursements(row(1, "CD-001", "REF-CD-001", new BigDecimal("1000"), null));
        when(jdbcTemplate.queryForObject(contains("chart_of_accounts"), any(SqlParameterSource.class), eq(String.class)))
                .thenThrow(new EmptyResultDataAccessException(1));

        EcountMig9JournalResult result = service.generateFromDisbursements(500, "tester");

        assertThat(result.rejected()).isEqualTo(1);
        assertThat(result.samples()).extracting(EcountMig9JournalResult.Sample::code)
                .containsExactly("MIG9_DEFAULT_ACCOUNT_MISSING");
    }

    @Test
    void amount가_0이하면_MIG9_CASH_AMOUNT_INVALID_reject() {
        disbursements(row(1, "CD-001", "REF-CD-001", BigDecimal.ZERO, null));

        EcountMig9JournalResult result = service.generateFromDisbursements(500, "tester");

        assertThat(result.samples()).extracting(EcountMig9JournalResult.Sample::code)
                .containsExactly("MIG9_CASH_AMOUNT_INVALID");
    }

    @Test
    void source_type_ref_unique_충돌은_MIG9_JOURNAL_DUPLICATE_reject() {
        disbursements(row(1, "CD-001", "REF-CD-001", new BigDecimal("1000"), null));
        when(jdbcTemplate.queryForObject(contains("INSERT INTO journals"), any(SqlParameterSource.class), eq(UUID.class)))
                .thenThrow(new DuplicateKeyException(
                        "duplicate key value violates unique constraint \"journals_source_type_ref_uk\""));

        assertThatThrownBy(() -> service.generateFromDisbursements(500, "tester"))
                .isInstanceOf(DuplicateKeyException.class);
    }

    @Test
    void duplicate_journal은_ON_CONFLICT_skip하고_다음_row는_정상_처리된다() {
        disbursements(
                row(1, "CD-DUP", "REF-DUP", new BigDecimal("1000"), null),
                row(2, "CD-NEXT", "REF-NEXT", new BigDecimal("2000"), null));
        when(jdbcTemplate.queryForObject(contains("INSERT INTO journals"), any(SqlParameterSource.class), eq(UUID.class)))
                .thenReturn(null)
                .thenReturn(journalId());

        EcountMig9JournalResult result = service.generateFromDisbursements(500, "tester");

        assertThat(result.skipped()).isEqualTo(1);
        assertThat(result.rejected()).isZero();
        assertThat(result.cashDisbursementJournalsCreated()).isEqualTo(1);
        assertThat(journalSql(2).get(0)).contains("ON CONFLICT (source_type, source_ref) DO NOTHING");
        assertThat(journalParams(2)).extracting(p -> p.getValue("journalNo"))
                .containsExactly("JD-CD-DUP", "JD-CD-NEXT");
    }

    @Test
    void 알수없는_DuplicateKeyException은_그대로_던진다() {
        disbursements(row(1, "CD-001", "REF-CD-001", new BigDecimal("1000"), null));
        when(jdbcTemplate.queryForObject(contains("INSERT INTO journals"), any(SqlParameterSource.class), eq(UUID.class)))
                .thenThrow(new DuplicateKeyException("other_unique"));

        assertThatThrownBy(() -> service.generateFromDisbursements(500, "tester"))
                .isInstanceOf(DuplicateKeyException.class);
    }

    @Test
    void reject_sample은_source_row_no를_보존한다() {
        disbursements(row(42, "CD-001", "REF-CD-001", BigDecimal.ZERO, null));

        EcountMig9JournalResult result = service.generateFromDisbursements(500, "tester");

        assertThat(result.samples().get(0).rowNumber()).isEqualTo(42);
    }

    @Test
    void JournalLine_차대_금액은_균형을_맞춘다() {
        receipts(row(1, "CR-001", "REF-CR-001", new BigDecimal("2500"), null));

        service.generateFromReceipts(500, "tester");

        List<SqlParameterSource> lines = lineParams();
        assertThat(lines).extracting(p -> p.getValue("debitAmount")).containsExactly(new BigDecimal("2500"), BigDecimal.ZERO);
        assertThat(lines).extracting(p -> p.getValue("creditAmount")).containsExactly(BigDecimal.ZERO, new BigDecimal("2500"));
    }

    @Test
    void cash_journal_id를_갱신한다() {
        disbursements(row(1, "CD-001", "REF-CD-001", new BigDecimal("1000"), null));

        service.generateFromDisbursements(500, "tester");

        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbcTemplate).update(contains("UPDATE cash_disbursements"), params.capture());
        assertThat(params.getValue().getValue("journalId")).isEqualTo(journalId());
    }

    @Test
    void DepositMatchService_분개_DRAFT도_CashReceipt_기본_입금계정을_사용한다() {
        KftcClient kftcClient = mock(KftcClient.class);
        PartnerLookupClient partnerLookupClient = mock(PartnerLookupClient.class);
        TaxInvoiceRepository taxInvoiceRepository = mock(TaxInvoiceRepository.class);
        JournalRepository journalRepository = mock(JournalRepository.class);
        JournalNumberService journalNumberService = mock(JournalNumberService.class);
        DepositMatchAuditRecorder auditRecorder = mock(DepositMatchAuditRecorder.class);
        DynamicPermissionClient dynamicPermissionClient = mock(DynamicPermissionClient.class);
        DepositMatchService depositMatchService = new DepositMatchService(
                kftcClient,
                partnerLookupClient,
                taxInvoiceRepository,
                journalRepository,
                journalNumberService,
                auditRecorder,
                dynamicPermissionClient);
        UUID partnerId = partnerId();
        TaxInvoice invoice = TaxInvoice.create(
                partnerId, "1234567890", "삼한입금상사", "서울",
                LocalDate.of(2026, 7, 3), "입금 매칭");
        invoice.addLine(TaxInvoiceLine.createWithAmounts(
                invoice, 1, "운송료", null, null,
                BigDecimal.ONE, new BigDecimal("10000"),
                new BigDecimal("10000"), new BigDecimal("1000"), null));
        invoice.issue("TI-001", "tester");

        when(kftcClient.fetchDeposits(any(), any(), anyString(), anyString()))
                .thenReturn(List.of(new KftcDepositRecord(
                        "P-CR-001",
                        new BigDecimal("11000.00"),
                        LocalDate.of(2026, 7, 3),
                        "120000",
                        "***-****-1234",
                        "입금",
                        "TX-001")));
        when(partnerLookupClient.findByPartnerCode("P-CR-001"))
                .thenReturn(Optional.of(new PartnerSummary(
                        partnerId, "P-CR-001", "삼한입금상사", "123-45-67890", "서울")));
        when(taxInvoiceRepository.findByFiltersWithType(any(), any(), any(), any(), eq(partnerId), any()))
                .thenReturn(new PageImpl<>(List.of(invoice)));
        when(journalNumberService.next(LocalDate.of(2026, 7, 3))).thenReturn("2026/07/03-1");
        when(journalRepository.save(any(Journal.class))).thenAnswer(invocation -> invocation.getArgument(0));

        List<DepositMatchResult> results = depositMatchService.fetchAndMatch(
                LocalDate.of(2026, 7, 3),
                LocalDate.of(2026, 7, 3),
                "088000000000000000000001",
                "DRY_RUN",
                partnerId,
                null);

        assertThat(results).hasSize(1);
        assertThat(results.get(0).status()).isEqualTo(DepositMatchStatus.MATCHED);
        ArgumentCaptor<Journal> journal = ArgumentCaptor.forClass(Journal.class);
        verify(journalRepository).save(journal.capture());
        assertThat(journal.getValue().getLines()).extracting(line -> line.getAccountCode())
                .containsExactly(
                        CashReceipt.DEFAULT_DEBIT_ACCOUNT_CODE,
                        CashReceipt.DEFAULT_CREDIT_ACCOUNT_CODE);
    }

    private void disbursements(Mig9CashJournalService.CashRow... rows) {
        when(jdbcTemplate.<Mig9CashJournalService.CashRow>query(
                contains("FROM cash_disbursements"),
                any(SqlParameterSource.class),
                org.mockito.ArgumentMatchers.<RowMapper<Mig9CashJournalService.CashRow>>any()))
                .thenReturn(List.of(rows));
    }

    private void receipts(Mig9CashJournalService.CashRow... rows) {
        when(jdbcTemplate.<Mig9CashJournalService.CashRow>query(
                contains("FROM cash_receipts"),
                any(SqlParameterSource.class),
                org.mockito.ArgumentMatchers.<RowMapper<Mig9CashJournalService.CashRow>>any()))
                .thenReturn(List.of(rows));
    }

    private SqlParameterSource journalParams() {
        return journalParams(1).get(0);
    }

    private List<SqlParameterSource> journalParams(int times) {
        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbcTemplate, org.mockito.Mockito.times(times))
                .queryForObject(contains("INSERT INTO journals"), params.capture(), eq(UUID.class));
        return params.getAllValues();
    }

    private List<String> journalSql(int times) {
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate, org.mockito.Mockito.times(times))
                .queryForObject(sql.capture(), any(SqlParameterSource.class), eq(UUID.class));
        return sql.getAllValues().stream()
                .filter(value -> value.contains("INSERT INTO journals"))
                .toList();
    }

    private List<SqlParameterSource> lineParams() {
        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbcTemplate, org.mockito.Mockito.times(2)).update(contains("INSERT INTO journal_lines"), params.capture());
        return params.getAllValues();
    }

    private static Mig9CashJournalService.CashRow row(int rowNo, String slipNo, String externalRef,
                                                       BigDecimal amount, UUID journalId) {
        return new Mig9CashJournalService.CashRow(
                rowNo, cashId(), slipNo, partnerId(), amount, LocalDate.of(2026, 5, 20),
                "메모", journalId, externalRef);
    }

    private static UUID cashId() {
        return UUID.fromString("00000000-0000-0000-0000-000000009001");
    }

    private static UUID partnerId() {
        return UUID.fromString("00000000-0000-0000-0000-00000000a001");
    }

    private static UUID journalId() {
        return UUID.fromString("00000000-0000-0000-0000-00000000b001");
    }
}
