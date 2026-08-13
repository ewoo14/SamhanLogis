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
import org.mockito.InOrder;
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
                            case "8319", "1039", "1089" -> code;
                            default -> throw new EmptyResultDataAccessException(1);
                        };
                    }
                    throw new EmptyResultDataAccessException(1);
                });
        lenient().when(jdbcTemplate.<UUID>query(contains("INSERT INTO journals"), any(SqlParameterSource.class),
                        org.mockito.ArgumentMatchers.<RowMapper<UUID>>any()))
                .thenReturn(List.of(journalId()));
        lenient().when(jdbcTemplate.update(anyString(), any(SqlParameterSource.class))).thenReturn(1);
    }

    @Test
    void 정상_CashDisbursement_1건은_Journal과_Line_2건을_생성한다() {
        Mig9CashJournalService.CashRow row =
                disbursementRow(7, "CD-001", "REF-CD-001", new BigDecimal("1000"), null);
        disbursements(row);

        EcountMig9JournalResult result = service.generateFromDisbursements(500, "tester");

        assertThat(result.cashDisbursementJournalsCreated()).isEqualTo(1);
        assertThat(result.rejected()).isZero();
        SqlParameterSource journal = journalParams();
        assertThat(journal.getValue("journalNo")).isEqualTo("JD-" + row.slipNo());
        assertThat(journal.getValue("sourceType")).isEqualTo("CASH_DISBURSEMENT");
        assertThat(journal.getValue("sourceRef")).isEqualTo(row.externalRef());
        // #772 fix — CASH_DISBURSEMENT 는 CashReceipt 와 무관하므로 cash_receipt_id 는 NULL 이어야
        // 한다(row.id() 가 cash_disbursements.id 라 CashReceipt UUID 로 오배선되면 안 됨).
        assertThat(journal.getValue("cashReceiptId")).isNull();
        List<SqlParameterSource> lines = lineParams();
        assertThat(lines).extracting(p -> p.getValue("accountCode")).containsExactly("8319", "1039");
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
                disbursementRow(1, "CD-001", "REF-CD-001", new BigDecimal("1000"), null),
                disbursementRow(2, "CD-002", "REF-CD-002", new BigDecimal("2000"), null));

        EcountMig9JournalResult result = service.generateFromDisbursements(500, "tester");

        assertThat(result.cashDisbursementJournalsCreated()).isEqualTo(2);
        assertThat(result.skipped()).isZero();
        assertThat(result.rejected()).isZero();
        assertThat(journalParams(2)).extracting(p -> p.getValue("journalNo"))
                .containsExactly("JD-CD-001", "JD-CD-002");
    }

    @Test
    void disbursement_journal_no는_JD_접두사를_사용한다() {
        disbursements(disbursementRow(1, "SAME-001", "REF-CD-SAME", new BigDecimal("1000"), null));

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
        disbursements(disbursementRow(1, "SAME-001", "REF-CD-SAME", new BigDecimal("1000"), null));
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
        // #772 fix — MIG-9 CashReceipt 배치 게시분도 cash_receipt_id 를 채운다(V56 backfill 의존 없이
        // 신규 생성분부터 즉시 정합). row.id() 는 cash_receipts.id 그 자체(cashId()).
        assertThat(journalParams().getValue("cashReceiptId")).isEqualTo(cashId());
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
                .contains("보통예금(1039)/외상매출금(1089)");
    }

    @Test
    void receipt_MIG9_조회는_수기입금보고서를_제외하고_DEPOSIT_REPORT만_대상으로_한다() {
        receipts(row(3, "CR-001", "REF-CR-001", new BigDecimal("2000"), null));

        service.generateFromReceipts(500, "tester");

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce()).query(sql.capture(), any(SqlParameterSource.class),
                org.mockito.ArgumentMatchers.<RowMapper<Mig9CashJournalService.CashRow>>any());
        String pendingSql = sql.getAllValues().stream()
                .filter(value -> value.contains("FROM cash_receipts"))
                .findFirst()
                .orElseThrow();
        assertThat(pendingSql).contains("kind = 'DEPOSIT_REPORT'");
        // 라이브 취소(CANCELLED, journal_id null) 행에 유령 POSTED 분개가 생기지 않도록 CONFIRMED 만 대상.
        assertThat(pendingSql).contains("status = 'CONFIRMED'");
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
        assertThat(linkSql).contains("version = version + 1");
        // pendingRows SELECT 이후 라이브 cancel 이 선행 커밋된 행(CANCELLED, journal_id NULL)에
        // 유령 POSTED 분개가 링크되는 TOCTOU 차단 — status 재확인은 receipts 링크에만 있어야 한다.
        assertThat(linkSql).contains("status = 'CONFIRMED'");
        // CONFIRMED PATCH 가 pendingRows SELECT 이후 먼저 커밋된 경우 stale 금액/거래처로 만든
        // 분개가 링크되지 않도록 SELECT 당시 version 도 함께 비교한다.
        assertThat(linkSql).contains("version = :cashVersion");
    }

    @Test
    void disbursement_link_SQL은_status_조건_없이_journal_id_가드만_사용한다() {
        disbursements(disbursementRow(4, "CD-LINK", "REF-CD-LINK", new BigDecimal("3000"), null));

        service.generateFromDisbursements(500, "tester");

        ArgumentCaptor<String> updateSql = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce())
                .update(updateSql.capture(), any(SqlParameterSource.class));
        String linkSql = updateSql.getAllValues().stream()
                .filter(value -> value.contains("UPDATE cash_disbursements"))
                .findFirst()
                .orElseThrow();
        // cash_disbursements 에는 status(V27)·version(V49=cash_receipts 전용) 컬럼이 없다 —
        // 어느 쪽이든 섞이면 배치가 42703 으로 전면 실패한다. 공백 변형까지 막도록 토큰 자체를 금지.
        assertThat(linkSql).contains("journal_id IS NULL");
        assertThat(linkSql).doesNotContain("status");
        assertThat(linkSql).doesNotContain("version");
    }

    @Test
    void receipt_link가_0건이면_생성한_journal을_보상삭제하고_skip한다() {
        receipts(row(4, "CR-LINK-RACE", "REF-CR-LINK-RACE", new BigDecimal("3000"), null));
        when(jdbcTemplate.update(contains("UPDATE cash_receipts"), any(SqlParameterSource.class)))
                .thenReturn(0);

        EcountMig9JournalResult result = service.generateFromReceipts(500, "tester");

        assertThat(result.cashReceiptJournalsCreated()).isZero();
        assertThat(result.skipped()).isEqualTo(1);
        InOrder inOrder = org.mockito.Mockito.inOrder(jdbcTemplate);
        ArgumentCaptor<SqlParameterSource> lineDeleteParams = ArgumentCaptor.forClass(SqlParameterSource.class);
        ArgumentCaptor<SqlParameterSource> journalDeleteParams = ArgumentCaptor.forClass(SqlParameterSource.class);
        inOrder.verify(jdbcTemplate).update(contains("DELETE FROM journal_lines"), lineDeleteParams.capture());
        inOrder.verify(jdbcTemplate).update(contains("DELETE FROM journals"), journalDeleteParams.capture());
        assertThat(lineDeleteParams.getValue().getValue("journalId")).isEqualTo(journalId());
        assertThat(journalDeleteParams.getValue().getValue("journalId")).isEqualTo(journalId());
    }

    @Test
    void disbursement_link가_0건이면_생성한_journal을_보상삭제하고_skip한다() {
        disbursements(disbursementRow(4, "CD-LINK-RACE", "REF-CD-LINK-RACE", new BigDecimal("3000"), null));
        when(jdbcTemplate.update(contains("UPDATE cash_disbursements"), any(SqlParameterSource.class)))
                .thenReturn(0);

        EcountMig9JournalResult result = service.generateFromDisbursements(500, "tester");

        assertThat(result.cashDisbursementJournalsCreated()).isZero();
        assertThat(result.skipped()).isEqualTo(1);
        InOrder inOrder = org.mockito.Mockito.inOrder(jdbcTemplate);
        ArgumentCaptor<SqlParameterSource> lineDeleteParams = ArgumentCaptor.forClass(SqlParameterSource.class);
        ArgumentCaptor<SqlParameterSource> journalDeleteParams = ArgumentCaptor.forClass(SqlParameterSource.class);
        inOrder.verify(jdbcTemplate).update(contains("DELETE FROM journal_lines"), lineDeleteParams.capture());
        inOrder.verify(jdbcTemplate).update(contains("DELETE FROM journals"), journalDeleteParams.capture());
        assertThat(lineDeleteParams.getValue().getValue("journalId")).isEqualTo(journalId());
        assertThat(journalDeleteParams.getValue().getValue("journalId")).isEqualTo(journalId());
    }

    @Test
    void journal_id가_이미_있으면_skip한다() {
        disbursements(disbursementRow(1, "CD-SKIP", "REF-SKIP", new BigDecimal("1000"), journalId()));

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
        disbursements(disbursementRow(1, "CD-001", "REF-CD-001", new BigDecimal("1000"), null));
        when(jdbcTemplate.queryForObject(contains("chart_of_accounts"), any(SqlParameterSource.class), eq(String.class)))
                .thenThrow(new EmptyResultDataAccessException(1));

        EcountMig9JournalResult result = service.generateFromDisbursements(500, "tester");

        assertThat(result.rejected()).isEqualTo(1);
        assertThat(result.samples()).extracting(EcountMig9JournalResult.Sample::code)
                .containsExactly("MIG9_DEFAULT_ACCOUNT_MISSING");
    }

    @Test
    void amount가_0이하면_MIG9_CASH_AMOUNT_INVALID_reject() {
        disbursements(disbursementRow(1, "CD-001", "REF-CD-001", BigDecimal.ZERO, null));

        EcountMig9JournalResult result = service.generateFromDisbursements(500, "tester");

        assertThat(result.samples()).extracting(EcountMig9JournalResult.Sample::code)
                .containsExactly("MIG9_CASH_AMOUNT_INVALID");
    }

    @Test
    void source_type_ref_unique_충돌은_DuplicateKeyException을_그대로_전파한다() {
        disbursements(disbursementRow(1, "CD-001", "REF-CD-001", new BigDecimal("1000"), null));
        when(jdbcTemplate.<UUID>query(contains("INSERT INTO journals"), any(SqlParameterSource.class),
                        org.mockito.ArgumentMatchers.<RowMapper<UUID>>any()))
                .thenThrow(new DuplicateKeyException(
                        "duplicate key value violates unique constraint \"journals_source_type_ref_uk\""));

        assertThatThrownBy(() -> service.generateFromDisbursements(500, "tester"))
                .isInstanceOf(DuplicateKeyException.class);
    }

    @Test
    void duplicate_journal은_ON_CONFLICT_skip하고_다음_row는_정상_처리된다() {
        disbursements(
                disbursementRow(1, "CD-DUP", "REF-DUP", new BigDecimal("1000"), null),
                disbursementRow(2, "CD-NEXT", "REF-NEXT", new BigDecimal("2000"), null));
        when(jdbcTemplate.<UUID>query(contains("INSERT INTO journals"), any(SqlParameterSource.class),
                        org.mockito.ArgumentMatchers.<RowMapper<UUID>>any()))
                .thenReturn(List.of())
                .thenReturn(List.of(journalId()));

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
        disbursements(disbursementRow(1, "CD-001", "REF-CD-001", new BigDecimal("1000"), null));
        when(jdbcTemplate.<UUID>query(contains("INSERT INTO journals"), any(SqlParameterSource.class),
                        org.mockito.ArgumentMatchers.<RowMapper<UUID>>any()))
                .thenThrow(new DuplicateKeyException("other_unique"));

        assertThatThrownBy(() -> service.generateFromDisbursements(500, "tester"))
                .isInstanceOf(DuplicateKeyException.class);
    }

    @Test
    void reject_sample은_source_row_no를_보존한다() {
        disbursements(disbursementRow(42, "CD-001", "REF-CD-001", BigDecimal.ZERO, null));

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
        disbursements(disbursementRow(1, "CD-001", "REF-CD-001", new BigDecimal("1000"), null));

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
                .query(contains("INSERT INTO journals"), params.capture(),
                        org.mockito.ArgumentMatchers.<RowMapper<UUID>>any());
        return params.getAllValues();
    }

    private List<String> journalSql(int times) {
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate, org.mockito.Mockito.times(times))
                .query(contains("INSERT INTO journals"), any(SqlParameterSource.class),
                        org.mockito.ArgumentMatchers.<RowMapper<UUID>>any());
        verify(jdbcTemplate, org.mockito.Mockito.atLeast(times))
                .query(sql.capture(), any(SqlParameterSource.class),
                        org.mockito.ArgumentMatchers.<RowMapper<UUID>>any());
        return sql.getAllValues().stream()
                .filter(value -> value.contains("INSERT INTO journals"))
                .toList();
    }

    private List<SqlParameterSource> lineParams() {
        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbcTemplate, org.mockito.Mockito.times(2)).update(contains("INSERT INTO journal_lines"), params.capture());
        return params.getAllValues();
    }

    /** cash_receipts fixture — version 컬럼이 실존하므로 신규 행 기본값 0L 을 그대로 사용한다. */
    private static Mig9CashJournalService.CashRow row(int rowNo, String slipNo, String externalRef,
                                                       BigDecimal amount, UUID journalId) {
        return new Mig9CashJournalService.CashRow(
                rowNo, cashId(), slipNo, partnerId(), amount, LocalDate.of(2026, 5, 20),
                "메모", journalId, externalRef, 0L);
    }

    /**
     * cash_disbursements fixture — {@code pendingRows()} 가 disbursements 조회 시
     * {@code NULL::bigint AS version} 으로 프로젝션한다(V49 version 컬럼은 cash_receipts 전용,
     * disbursements 에는 컬럼 자체가 없음). 프로덕션과 동일하게 version 을 null 로 고정해
     * 실제로 존재하지 않는 값(0L)을 fixture 가 흉내 내지 않도록 한다.
     */
    private static Mig9CashJournalService.CashRow disbursementRow(int rowNo, String slipNo, String externalRef,
                                                                   BigDecimal amount, UUID journalId) {
        return new Mig9CashJournalService.CashRow(
                rowNo, cashId(), slipNo, partnerId(), amount, LocalDate.of(2026, 5, 20),
                "메모", journalId, externalRef, null);
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
