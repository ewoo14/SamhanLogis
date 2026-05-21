package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.ecount.EcountMig7TransformResult;
import com.samhanair.logis.common.exception.BusinessException;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

@ExtendWith(MockitoExtension.class)
class Mig7CashDisbursementTransformServiceTest {

    @Mock private NamedParameterJdbcTemplate jdbcTemplate;
    private Mig7CashDisbursementTransformService service;

    @BeforeEach
    void setUp() {
        service = new Mig7CashDisbursementTransformService(jdbcTemplate);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Object.class)))
                .thenReturn(null);
        lenient().when(jdbcTemplate.queryForObject(contains("SELECT COUNT(1)"), any(SqlParameterSource.class), eq(Integer.class)))
                .thenReturn(0);
        lenient().when(jdbcTemplate.queryForObject(contains("WITH restored"), any(SqlParameterSource.class), eq(UUID.class)))
                .thenReturn(UUID.fromString("00000000-0000-0000-0000-000000007001"));
        lenient().when(jdbcTemplate.update(anyString(), any(SqlParameterSource.class))).thenReturn(1);
    }

    @Test
    void 정상_1건_transform() {
        pending(row(1, "2026-05-20-001"));

        EcountMig7TransformResult result = service.transformFromStaging(500, "tester");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.rejected()).isZero();
    }

    @Test
    void PENDING_다건_batch_transform() {
        pending(row(1, "2026-05-20-001"), row(2, "2026-05-20-002"));

        EcountMig7TransformResult result = service.transformFromStaging(500, "tester");

        assertThat(result.imported()).isEqualTo(2);
        assertThat(result.totalRows()).isEqualTo(2);
    }

    @Test
    void PENDING_row_0건은_MIG7_STAGING_ROW_NOT_FOUND() {
        pending();

        assertThatThrownBy(() -> service.transformFromStaging(500, "tester"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("변환 대상 staging row");
    }

    @Test
    void partner_id_null은_MIG7_LOOKUP_MISS로_reject() {
        pending(row(1, "2026-05-20-001", new BigDecimal("1000"), null, "지출결의서"));

        EcountMig7TransformResult result = service.transformFromStaging(500, "tester");

        assertThat(result.rejectedSample()).extracting(EcountMig7TransformResult.RejectedRow::errorCode)
                .containsExactly("MIG7_LOOKUP_MISS");
        assertThat(statuses()).contains("REJECTED");
    }

    @Test
    void amount_0이하는_MIG7_AMOUNT_INVALID로_reject() {
        pending(row(1, "2026-05-20-001", BigDecimal.ZERO, partnerId(), "지출결의서"));

        EcountMig7TransformResult result = service.transformFromStaging(500, "tester");

        assertThat(result.rejectedSample()).extracting(EcountMig7TransformResult.RejectedRow::errorCode)
                .containsExactly("MIG7_AMOUNT_INVALID");
    }

    @Test
    void slip_no_날짜_불일치는_MIG7_DATE_INVALID로_reject() {
        pending(row(1, "BROKEN-001"));

        EcountMig7TransformResult result = service.transformFromStaging(500, "tester");

        assertThat(result.rejectedSample()).extracting(EcountMig7TransformResult.RejectedRow::errorCode)
                .containsExactly("MIG7_DATE_INVALID");
    }

    @Test
    void domain_duplicate는_MIG7_DUPLICATE_EXTERNAL_REF로_reject() {
        pending(row(1, "2026-05-20-001"));
        when(jdbcTemplate.queryForObject(contains("WITH restored"), any(SqlParameterSource.class), eq(UUID.class)))
                .thenThrow(new DuplicateKeyException("dup"));

        EcountMig7TransformResult result = service.transformFromStaging(500, "tester");

        assertThat(result.rejectedSample()).extracting(EcountMig7TransformResult.RejectedRow::errorCode)
                .containsExactly("MIG7_DUPLICATE_EXTERNAL_REF");
    }

    @Test
    void reject_sample은_source_row_no를_그대로_노출한다() {
        pending(row(7, "BROKEN-001"));

        EcountMig7TransformResult result = service.transformFromStaging(500, "tester");

        assertThat(result.rejectedSample().get(0).rowNumber()).isEqualTo(7);
    }

    @Test
    void 정상_row는_TRANSFORMED로_상태_갱신한다() {
        pending(row(1, "2026-05-20-001"));

        service.transformFromStaging(500, "tester");

        assertThat(statuses()).contains("TRANSFORMED");
    }

    @Test
    void soft_deleted_external_ref가_있으면_updated로_집계한다() {
        pending(row(1, "2026-05-20-001"));
        when(jdbcTemplate.queryForObject(contains("SELECT COUNT(1)"), any(SqlParameterSource.class), eq(Integer.class)))
                .thenReturn(1);

        EcountMig7TransformResult result = service.transformFromStaging(500, "tester");

        assertThat(result.updated()).isEqualTo(1);
        verify(jdbcTemplate).queryForObject(contains("WITH restored"), any(SqlParameterSource.class), eq(UUID.class));
    }

    private void pending(AbstractMig7CashTransformService.StagingRow... rows) {
        when(jdbcTemplate.<AbstractMig7CashTransformService.StagingRow>query(
                contains("FROM staging.ecount_expense_voucher_raw"),
                any(SqlParameterSource.class),
                org.mockito.ArgumentMatchers.<RowMapper<AbstractMig7CashTransformService.StagingRow>>any()))
                .thenReturn(List.of(rows));
    }

    private List<Object> statuses() {
        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce()).update(contains("transform_status"), params.capture());
        return params.getAllValues().stream()
                .filter(p -> p.hasValue("status"))
                .map(p -> p.getValue("status"))
                .toList();
    }

    private static AbstractMig7CashTransformService.StagingRow row(int rowNo, String slipNo) {
        return row(rowNo, slipNo, new BigDecimal("1000"), partnerId(), "지출결의서");
    }

    private static AbstractMig7CashTransformService.StagingRow row(int rowNo, String slipNo,
                                                                   BigDecimal amount, UUID partnerId,
                                                                   String transactionType) {
        return new AbstractMig7CashTransformService.StagingRow(
                "HASH", rowNo, slipNo, transactionType, amount, "삼한상사", partnerId,
                "memo", "HASH-" + rowNo);
    }

    private static UUID partnerId() {
        return UUID.fromString("00000000-0000-0000-0000-00000000a001");
    }
}
