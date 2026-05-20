package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.ecount.EcountMig9JournalResult;
import com.samhanair.logis.common.exception.BusinessException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
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
        disbursements(row(7, "CD-001", "REF-CD-001", new BigDecimal("1000"), null));

        EcountMig9JournalResult result = service.generateFromDisbursements(500, "tester");

        assertThat(result.cashDisbursementJournalsCreated()).isEqualTo(1);
        assertThat(result.rejected()).isZero();
        assertThat(journalParams().getValue("sourceType")).isEqualTo("CASH_DISBURSEMENT");
        assertThat(journalParams().getValue("sourceRef")).isEqualTo("REF-CD-001");
        assertThat(lineParams()).extracting(p -> p.getValue("accountCode")).containsExactly("831", "102");
    }

    @Test
    void 정상_CashReceipt_1건은_현금_차변과_외상매출금_대변을_생성한다() {
        receipts(row(3, "CR-001", "REF-CR-001", new BigDecimal("2000"), null));

        EcountMig9JournalResult result = service.generateFromReceipts(500, "tester");

        assertThat(result.cashReceiptJournalsCreated()).isEqualTo(1);
        assertThat(journalParams().getValue("sourceType")).isEqualTo("CASH_RECEIPT");
        assertThat(lineParams()).extracting(p -> p.getValue("accountCode")).containsExactly("102", "110");
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

        EcountMig9JournalResult result = service.generateFromDisbursements(500, "tester");

        assertThat(result.samples()).extracting(EcountMig9JournalResult.Sample::code)
                .containsExactly("MIG9_JOURNAL_DUPLICATE");
        assertThat(result.samples().get(0).message()).contains("journals_source_type_ref_uk");
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

    private void disbursements(Mig9CashJournalService.CashRow... rows) {
        when(jdbcTemplate.<Mig9CashJournalService.CashRow>query(
                contains("FROM cash_disbursements"),
                any(SqlParameterSource.class),
                any(RowMapper.class))).thenReturn(List.of(rows));
    }

    private void receipts(Mig9CashJournalService.CashRow... rows) {
        when(jdbcTemplate.<Mig9CashJournalService.CashRow>query(
                contains("FROM cash_receipts"),
                any(SqlParameterSource.class),
                any(RowMapper.class))).thenReturn(List.of(rows));
    }

    private SqlParameterSource journalParams() {
        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbcTemplate).queryForObject(contains("INSERT INTO journals"), params.capture(), eq(UUID.class));
        return params.getValue();
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
