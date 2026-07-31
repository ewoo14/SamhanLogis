package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.client.ProductAliasClient;
import com.samhanair.logis.common.ecount.EcountMig8TransformResult;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.IntStream;
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
class Mig8OrderTransformServiceTest {

    @Mock private NamedParameterJdbcTemplate jdbcTemplate;
    @Mock private PartnerLookupClient partnerLookupClient;
    @Mock private ProductAliasClient productAliasClient;
    private Mig8OrderTransformService service;

    @BeforeEach
    void setUp() {
        service = new Mig8OrderTransformService(jdbcTemplate, partnerLookupClient, productAliasClient);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Object.class)))
                .thenReturn(null);
        lenient().when(jdbcTemplate.queryForObject(contains("SELECT COUNT(1)"), any(SqlParameterSource.class), eq(Integer.class)))
                .thenReturn(0);
        lenient().when(jdbcTemplate.queryForObject(contains("INSERT INTO orders"), any(SqlParameterSource.class), eq(UUID.class)))
                .thenReturn(orderId());
        lenient().when(jdbcTemplate.queryForObject(contains("INSERT INTO order_lines"), any(SqlParameterSource.class), eq(UUID.class)))
                .thenReturn(UUID.fromString("00000000-0000-0000-0000-000000008002"));
        lenient().when(jdbcTemplate.query(contains("FROM sales_accounting_slips"), any(SqlParameterSource.class),
                        org.mockito.ArgumentMatchers.<RowMapper<String>>any()))
                .thenReturn(List.of());
        lenient().when(jdbcTemplate.update(anyString(), any(SqlParameterSource.class))).thenReturn(1);
        lenient().when(partnerLookupClient.findByPartnerNameStrict("삼한상사"))
                .thenReturn(Optional.of(partner()));
        lenient().when(productAliasClient.resolveAliases(anyList()))
                .thenReturn(Map.of("테스트품목", productId()));
    }

    @Test
    void 정상_1건_transform() {
        pending(row(1, "2026-05-20-001", "진행"));

        EcountMig8TransformResult result = service.transformFromStaging(500, "tester");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.rejected()).isZero();
    }

    @Test
    void 동일_order_no_다중_line은_1_Order_N_OrderLine으로_grouping한다() {
        pending(row(1, "2026-05-20-001", "진행"), row(2, "2026-05-20-001", "진행"));

        EcountMig8TransformResult result = service.transformFromStaging(500, "tester");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.totalRows()).isEqualTo(2);
        assertThat(statuses()).containsExactly("TRANSFORMED", "TRANSFORMED");
    }

    @Test
    void batch_boundary_같은_order_no_분리되지_않는다() {
        pending(
                row(1, "2026-05-20-001", "진행"),
                row(2, "2026-05-20-001", "진행"),
                row(3, "2026-05-20-001", "진행"),
                row(4, "2026-05-20-002", "진행"),
                row(5, "2026-05-20-003", "진행"));

        EcountMig8TransformResult result = service.transformFromStaging(2, "tester");

        assertThat(result.totalRows()).isEqualTo(5);
        assertThat(result.imported()).isEqualTo(3);
        assertThat(statuses()).containsExactly("TRANSFORMED", "TRANSFORMED", "TRANSFORMED",
                "TRANSFORMED", "TRANSFORMED");
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).query(sql.capture(), any(SqlParameterSource.class),
                org.mockito.ArgumentMatchers.<RowMapper<Mig8OrderTransformService.StagingRow>>any());
        assertThat(sql.getValue()).doesNotContain("LIMIT");
    }

    @Test
    void PENDING_row_0건은_MIG8_STAGING_ROW_NOT_FOUND() {
        pending();

        assertThatThrownBy(() -> service.transformFromStaging(500, "tester"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("변환 대상 staging row");
    }

    @Test
    void partner_lookup_miss는_MIG8_LOOKUP_MISS로_reject() {
        pending(row(1, "2026-05-20-001", "진행"));
        when(partnerLookupClient.findByPartnerNameStrict("삼한상사")).thenReturn(Optional.empty());

        EcountMig8TransformResult result = service.transformFromStaging(500, "tester");

        assertThat(result.samples()).extracting(EcountMig8TransformResult.Sample::code)
                .containsExactly("MIG8_LOOKUP_MISS");
        assertThat(statuses()).contains("REJECTED");
    }

    @Test
    void amount_invalid는_MIG8_AMOUNT_INVALID로_reject() {
        pending(row(1, "2026-05-20-001", "진행", BigDecimal.ZERO, "삼한상사", "HASH-1"));

        EcountMig8TransformResult result = service.transformFromStaging(500, "tester");

        assertThat(result.samples()).extracting(EcountMig8TransformResult.Sample::code)
                .containsExactly("MIG8_AMOUNT_INVALID");
    }

    @Test
    void order_no_날짜_불일치는_MIG8_DATE_INVALID로_reject() {
        pending(row(1, "BROKEN-001", "진행"));

        EcountMig8TransformResult result = service.transformFromStaging(500, "tester");

        assertThat(result.samples()).extracting(EcountMig8TransformResult.Sample::code)
                .containsExactly("MIG8_DATE_INVALID");
    }

    @Test
    void progress_status_unknown은_MIG8_PROGRESS_STATUS_INVALID로_reject() {
        pending(row(1, "2026-05-20-001", "보류"));

        EcountMig8TransformResult result = service.transformFromStaging(500, "tester");

        assertThat(result.samples()).extracting(EcountMig8TransformResult.Sample::code)
                .containsExactly("MIG8_PROGRESS_STATUS_INVALID");
    }

    @Test
    void domain_duplicate는_MIG8_DUPLICATE_EXTERNAL_REF로_reject() {
        pending(row(1, "2026-05-20-001", "진행"));
        when(jdbcTemplate.queryForObject(contains("INSERT INTO orders"), any(SqlParameterSource.class), eq(UUID.class)))
                .thenThrow(new DuplicateKeyException(
                        "duplicate key value violates unique constraint \"orders_external_ref_uk\""));

        EcountMig8TransformResult result = service.transformFromStaging(500, "tester");

        assertThat(result.samples()).extracting(EcountMig8TransformResult.Sample::code)
                .containsExactly("MIG8_DUPLICATE_EXTERNAL_REF");
        assertThat(result.samples().get(0).message()).contains("orders_external_ref_uk");
    }

    @Test
    void order_no_unique_violation은_constraint_name을_sample_message에_노출한다() {
        pending(row(1, "2026-05-20-001", "진행"));
        when(jdbcTemplate.queryForObject(contains("INSERT INTO orders"), any(SqlParameterSource.class), eq(UUID.class)))
                .thenThrow(new DuplicateKeyException(
                        "duplicate key value violates unique constraint \"orders_order_no_uk\""));

        EcountMig8TransformResult result = service.transformFromStaging(500, "tester");

        assertThat(result.samples()).extracting(EcountMig8TransformResult.Sample::code)
                .containsExactly("CONFLICT");
        assertThat(result.samples().get(0).message()).contains("orders_order_no_uk");
    }

    @Test
    void reject_sample은_source_row_no를_그대로_노출한다() {
        pending(row(7, "BROKEN-001", "진행"));

        EcountMig8TransformResult result = service.transformFromStaging(500, "tester");

        assertThat(result.samples().get(0).rowNumber()).isEqualTo(7);
    }

    @Test
    void 정상_row는_TRANSFORMED로_상태_갱신한다() {
        pending(row(1, "2026-05-20-001", "진행"));

        service.transformFromStaging(500, "tester");

        assertThat(statuses()).contains("TRANSFORMED");
    }

    @Test
    void 기존_external_ref가_있으면_updated로_집계한다() {
        pending(row(1, "2026-05-20-001", "진행"));
        when(jdbcTemplate.queryForObject(contains("SELECT COUNT(1)"), any(SqlParameterSource.class), eq(Integer.class)))
                .thenReturn(1);

        EcountMig8TransformResult result = service.transformFromStaging(500, "tester");

        assertThat(result.updated()).isEqualTo(1);
        verify(jdbcTemplate).queryForObject(contains("INSERT INTO orders"), any(SqlParameterSource.class), eq(UUID.class));
        verify(jdbcTemplate).queryForObject(contains("INSERT INTO order_lines"), any(SqlParameterSource.class), eq(UUID.class));
    }

    @Test
    void completed_order는_SalesAccountingSlip_cross_link한다() {
        pending(row(1, "2026-05-20-001", "완료"));
        when(jdbcTemplate.query(contains("FROM sales_accounting_slips"), any(SqlParameterSource.class),
                        org.mockito.ArgumentMatchers.<RowMapper<String>>any()))
                .thenReturn(List.of("2026-05-20-001"));

        EcountMig8TransformResult result = service.transformFromStaging(500, "tester");

        assertThat(result.completedLinkedSlipCount()).isEqualTo(1);
        assertThat(result.samples()).isEmpty();
        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbcTemplate).update(contains("SET linked_slip_no"), params.capture());
        assertThat(params.getValue().getValue("linkedSlipNo")).isEqualTo("2026-05-20-001");
    }

    @Test
    void completed_order_매칭실패는_warning이고_reject하지_않는다() {
        pending(row(1, "2026-05-20-001", "완료"));

        EcountMig8TransformResult result = service.transformFromStaging(500, "tester");

        assertThat(result.rejected()).isZero();
        assertThat(result.samples()).extracting(EcountMig8TransformResult.Sample::code)
                .containsExactly("MIG8_SLIP_LINK_MISS");
    }

    @Test
    void product_id_lookup_성공시_매핑된다() {
        pending(row(1, "2026-05-20-001", "진행"));
        doReturn(Map.of("테스트품목", productId())).when(productAliasClient)
                .resolveAliases(List.of("테스트품목"));

        service.transformFromStaging(500, "tester");

        assertThat(lineParams().getValue("productId")).isEqualTo(productId());
    }

    @Test
    void product_id_lookup_miss는_NULL_유지() {
        pending(row(1, "2026-05-20-001", "진행"));
        doReturn(Map.of()).when(productAliasClient).resolveAliases(List.of("테스트품목"));

        EcountMig8TransformResult result = service.transformFromStaging(500, "tester");

        assertThat(result.imported()).isOne();
        assertThat(result.rejected()).isOne();
        assertThat(result.samples()).extracting(EcountMig8TransformResult.Sample::code)
                .containsExactly("MIG8_LOOKUP_MISS");
        assertThat(statuses()).containsExactly("PENDING");
        assertThat(lineParams().getValue("productId")).isNull();
    }

    @Test
    void 품목명_규격_라벨은_선두_alias로_해소하고_미해소_라인도_보존한다() {
        pending(
                rowWithItemName(1, "2026-05-20-001", "테스트품목 [규격-A]"),
                rowWithItemName(2, "2026-05-20-001", "없는품목 (규격-B)"));
        doReturn(Map.of("테스트품목", productId())).when(productAliasClient)
                .resolveAliases(anyList());

        EcountMig8TransformResult result = service.transformFromStaging(500, "tester");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.rejected()).isEqualTo(1);
        assertThat(result.samples()).extracting(EcountMig8TransformResult.Sample::code)
                .containsExactly("MIG8_LOOKUP_MISS");
        assertThat(statuses()).containsExactly("PENDING", "PENDING");
        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbcTemplate, times(2)).queryForObject(
                contains("INSERT INTO order_lines"), params.capture(), eq(UUID.class));
        assertThat(params.getAllValues().get(0).getValue("productId")).isEqualTo(productId());
        assertThat(params.getAllValues().get(1).getValue("productId")).isNull();
    }

    @Test
    void resolver_일시실패는_행을_거부확정하지_않고_예외를_전파한다() {
        pending(row(1, "2026-05-20-001", "진행"));
        BusinessException unavailable =
                new BusinessException(ErrorCode.MIG20_REIMPORT_FAILED, "resolver 일시 장애");
        when(productAliasClient.resolveAliases(anyList())).thenThrow(unavailable);

        assertThatThrownBy(() -> service.transformFromStaging(500, "tester"))
                .isSameAs(unavailable);
        verify(jdbcTemplate, org.mockito.Mockito.never()).update(
                contains("staging.ecount_order_raw"), any(SqlParameterSource.class));
    }

    @Test
    void alias_resolve_후_line_insert_직전에_활성_상태를_재검증한다() {
        pending(row(1, "2026-05-20-001", "진행"));
        doReturn(Map.of("테스트품목", productId())).when(productAliasClient)
                .resolveAliases(anyList());

        service.transformFromStaging(500, "tester");

        verify(productAliasClient, times(2)).resolveAliases(anyList());
    }

    @Test
    void soft_deleted_alias_UUID가_섞인_160건은_삭제_UUID를_쓰지_않고_전건_reject한다() {
        List<Mig8OrderTransformService.StagingRow> rows = IntStream.rangeClosed(1, 160)
                .mapToObj(rowNo -> row(rowNo, "2026-05-20-" + String.format("%03d", rowNo), "진행",
                        new BigDecimal("2"), "삼한상사", "HASH-AR-EC05-" + rowNo))
                .toList();
        pending(rows.toArray(Mig8OrderTransformService.StagingRow[]::new));
        // product-service 가 soft-delete 대상 alias 를 제외하면 accounting 에는 미해소로 도착한다.
        doReturn(Map.of()).when(productAliasClient)
                .resolveAliases(List.of("테스트품목"));

        EcountMig8TransformResult result = service.transformFromStaging(500, "tester");

        assertThat(result.totalRows()).isEqualTo(160);
        assertThat(result.imported()).isEqualTo(160);
        assertThat(result.updated()).isZero();
        assertThat(result.rejected()).isEqualTo(160);
        assertThat(result.samples()).isNotEmpty()
                .first().extracting(EcountMig8TransformResult.Sample::code)
                .isEqualTo("MIG8_LOOKUP_MISS");
        assertThat(statuses()).hasSize(160).containsOnly("PENDING");
        verify(jdbcTemplate, times(160)).queryForObject(
                contains("INSERT INTO orders"), any(SqlParameterSource.class), eq(UUID.class));
        verify(jdbcTemplate, times(160)).queryForObject(
                contains("INSERT INTO order_lines"), any(SqlParameterSource.class), eq(UUID.class));
    }

    @Test
    void product_alias_auth_error는_삼키지_않고_변환을_실패시킨다() {
        pending(row(1, "2026-05-20-001", "진행"));
        BusinessException authError =
                new BusinessException(ErrorCode.MIG12_INTERNAL_AUTH_MISS, "ProductAliasClient 내부 인증 실패");
        when(productAliasClient.resolveAliases(List.of("테스트품목"))).thenThrow(authError);

        assertThatThrownBy(() -> service.transformFromStaging(500, "tester"))
                .isSameAs(authError);
    }

    @Test
    void product_alias_lookup은_group_안의_distinct_item_name으로_1회만_배치_호출한다() {
        pending(row(1, "2026-05-20-001", "진행"), row(2, "2026-05-20-001", "진행"));
        doReturn(Map.of("테스트품목", productId())).when(productAliasClient)
                .resolveAliases(List.of("테스트품목"));

        service.transformFromStaging(500, "tester");

        verify(productAliasClient, times(2)).resolveAliases(List.of("테스트품목"));
        assertThat(lineParams().getValue("productId")).isEqualTo(productId());
    }

    private void pending(Mig8OrderTransformService.StagingRow... rows) {
        when(jdbcTemplate.<Mig8OrderTransformService.StagingRow>query(
                contains("FROM staging.ecount_order_raw"),
                any(SqlParameterSource.class),
                org.mockito.ArgumentMatchers.<RowMapper<Mig8OrderTransformService.StagingRow>>any()))
                .thenReturn(List.of(rows));
    }

    private List<Object> statuses() {
        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce()).update(contains("staging.ecount_order_raw"), params.capture());
        return params.getAllValues().stream()
                .filter(p -> p.hasValue("status"))
                .map(p -> p.getValue("status"))
                .toList();
    }

    private SqlParameterSource lineParams() {
        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce())
                .queryForObject(contains("INSERT INTO order_lines"), params.capture(), eq(UUID.class));
        return params.getAllValues().get(0);
    }

    private static Mig8OrderTransformService.StagingRow row(int rowNo, String orderNo, String status) {
        return row(rowNo, orderNo, status, new BigDecimal("2"), "삼한상사", "HASH-" + rowNo);
    }

    private static Mig8OrderTransformService.StagingRow row(int rowNo, String orderNo, String status,
                                                            BigDecimal quantity, String partnerName,
                                                            String externalRef) {
        return new Mig8OrderTransformService.StagingRow(
                "HASH", rowNo, orderNo, orderNo, LocalDate.of(2026, 5, 20),
                partnerName, "김담당", "2026-06-20", "월말", "참조", status, "테스트품목",
                quantity, new BigDecimal("1000"), new BigDecimal("2000"), new BigDecimal("200"),
                LocalDate.of(2026, 6, 20), externalRef);
    }

    private static Mig8OrderTransformService.StagingRow rowWithItemName(
            int rowNo, String orderNo, String itemName) {
        Mig8OrderTransformService.StagingRow base = row(rowNo, orderNo, "진행");
        return new Mig8OrderTransformService.StagingRow(
                base.sourceFileHash(), base.sourceRowNo(), base.orderNo(), base.legacyOrderNo(),
                base.orderDate(), base.partnerName(), base.managerName(), base.validUntil(),
                base.paymentTerms(), base.reference(), base.progressStatus(), itemName,
                base.quantity(), base.unitPrice(), base.supplyAmount(), base.vatAmount(),
                base.itemDueDate(), base.externalRef());
    }

    private static PartnerSummary partner() {
        return new PartnerSummary(partnerId(), "P-001", "삼한상사", "123-45-67890", "서울");
    }

    private static UUID partnerId() {
        return UUID.fromString("00000000-0000-0000-0000-00000000a001");
    }

    private static UUID orderId() {
        return UUID.fromString("00000000-0000-0000-0000-000000008001");
    }

    private static UUID productId() {
        return UUID.fromString("00000000-0000-0000-0000-00000000b001");
    }
}
