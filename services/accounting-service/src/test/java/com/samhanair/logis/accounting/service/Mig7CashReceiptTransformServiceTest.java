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
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

@ExtendWith(MockitoExtension.class)
class Mig7CashReceiptTransformServiceTest {

    @Mock private NamedParameterJdbcTemplate jdbcTemplate;
    private Mig7CashReceiptTransformService service;

    @BeforeEach
    void setUp() {
        service = new Mig7CashReceiptTransformService(jdbcTemplate);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Object.class)))
                .thenReturn(null);
        lenient().when(jdbcTemplate.queryForObject(contains("SELECT COUNT(1)"), any(SqlParameterSource.class), eq(Integer.class)))
                .thenReturn(0);
        lenient().when(jdbcTemplate.queryForObject(contains("WITH restored"), any(SqlParameterSource.class), eq(UUID.class)))
                .thenReturn(UUID.fromString("00000000-0000-0000-0000-000000007101"));
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
        pending(row(1, "2026-05-20-001", new BigDecimal("1000"), null, "입금보고서"));

        EcountMig7TransformResult result = service.transformFromStaging(500, "tester");

        assertThat(result.rejectedSample()).extracting(EcountMig7TransformResult.RejectedRow::errorCode)
                .containsExactly("MIG7_LOOKUP_MISS");
    }

    @Test
    void amount_null은_MIG7_AMOUNT_INVALID로_reject() {
        pending(row(1, "2026-05-20-001", null, partnerId(), "입금보고서"));

        EcountMig7TransformResult result = service.transformFromStaging(500, "tester");

        assertThat(result.rejectedSample()).extracting(EcountMig7TransformResult.RejectedRow::errorCode)
                .containsExactly("MIG7_AMOUNT_INVALID");
    }

    @Test
    void 거래유형_불일치는_MIG7_KIND_INVALID로_reject() {
        pending(row(1, "2026-05-20-001", new BigDecimal("1000"), partnerId(), "지출결의서"));

        EcountMig7TransformResult result = service.transformFromStaging(500, "tester");

        assertThat(result.rejectedSample()).extracting(EcountMig7TransformResult.RejectedRow::errorCode)
                .containsExactly("MIG7_KIND_INVALID");
    }

    @Test
    void 정상_row는_TRANSFORMED로_상태_갱신한다() {
        pending(row(1, "2026-05-20-001"));

        service.transformFromStaging(500, "tester");

        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce()).update(contains("transform_status"), params.capture());
        assertThat(params.getAllValues().stream()
                .filter(p -> p.hasValue("status"))
                .map(p -> p.getValue("status"))
                .toList()).contains("TRANSFORMED");
    }

    private void pending(AbstractMig7CashTransformService.StagingRow... rows) {
        when(jdbcTemplate.<AbstractMig7CashTransformService.StagingRow>query(
                contains("FROM staging.ecount_deposit_report_raw"),
                any(SqlParameterSource.class),
                any(RowMapper.class))).thenReturn(List.of(rows));
    }

    private static AbstractMig7CashTransformService.StagingRow row(int rowNo, String slipNo) {
        return row(rowNo, slipNo, new BigDecimal("1000"), partnerId(), "입금보고서");
    }

    private static AbstractMig7CashTransformService.StagingRow row(int rowNo, String slipNo,
                                                                   BigDecimal amount, UUID partnerId,
                                                                   String transactionType) {
        return new AbstractMig7CashTransformService.StagingRow(
                "HASH", rowNo, slipNo, transactionType, amount, "삼한상사", partnerId,
                "memo", "HASH-" + rowNo);
    }

    private static UUID partnerId() {
        return UUID.fromString("00000000-0000-0000-0000-00000000a002");
    }
}
