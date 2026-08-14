package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.web.dto.EcountMig4ImportResult;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

/** MIG-4 세금계산서 importer behavior 회귀 가드. */
@ExtendWith(MockitoExtension.class)
class EcountTaxInvoiceImporterTest {

    @Mock private NamedParameterJdbcTemplate jdbcTemplate;
    @Mock private PartnerLookupClient partnerLookupClient;

    private EcountTaxInvoiceImporter importer;

    @BeforeEach
    void setUp() {
        importer = new EcountTaxInvoiceImporter(jdbcTemplate, partnerLookupClient);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Object.class)))
                .thenReturn(null);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Integer.class)))
                .thenReturn(1);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(UUID.class)))
                .thenReturn(UUID.fromString("00000000-0000-0000-0000-000000000401"));
        lenient().when(jdbcTemplate.queryForList(anyString(), any(SqlParameterSource.class), eq(UUID.class)))
                .thenReturn(List.of());
        lenient().when(jdbcTemplate.update(anyString(), any(SqlParameterSource.class))).thenReturn(1);
        lenient().when(partnerLookupClient.findByPartnerCode("P-001")).thenReturn(Optional.of(partner()));
        lenient().when(partnerLookupClient.findByPartnerCode("MISS")).thenReturn(Optional.empty());
        lenient().when(partnerLookupClient.findByPartnerNameStrict("삼한상사")).thenReturn(Optional.of(partner()));
        lenient().when(partnerLookupClient.findByPartnerNameStrict("미등록거래처")).thenReturn(Optional.empty());
    }

    @Test
    void 정상_1건_단일_line을_적재한다() {
        EcountMig4ImportResult result = importer.importCsv(stream(taxCsv(row("P-001", "삼한상사",
                "100,000", "10,000", "2026/05/01", "AC-001", "1", "100,000", "2026/05/01 -1"))), "tester");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.rejected()).isZero();
    }

    @Test
    void 동일_거래처_일자_다중_line은_한_invoice_group으로_처리한다() {
        EcountMig4ImportResult result = importer.importCsv(stream(taxCsv(
                row("P-001", "삼한상사", "100,000", "10,000", "2026/05/01", "AC-001", "1", "100,000", "2026/05/01 -1") +
                row("P-001", "삼한상사", "200,000", "20,000", "2026/05/01", "AC-002", "1", "200,000", "2026/05/01 -2"))), "tester");

        assertThat(result.imported()).isEqualTo(2);
        verify(jdbcTemplate, org.mockito.Mockito.times(1))
                .queryForObject(org.mockito.ArgumentMatchers.contains("INSERT INTO tax_invoices"),
                        any(SqlParameterSource.class), eq(UUID.class));
    }

    @Test
    void partner_lookup_miss는_MIG4_LOOKUP_MISS로_reject한다() {
        EcountMig4ImportResult result = importer.importCsv(stream(taxCsv(row("MISS", "미등록거래처",
                "100,000", "10,000", "2026/05/01", "AC-001", "1", "100,000", "2026/05/01 -1"))), "tester");

        assertThat(result.rejectedSample()).extracting(EcountMig4ImportResult.RejectedRow::errorCode)
                .containsExactly("MIG4_LOOKUP_MISS");
    }

    @Test
    void partner_lookup_ambiguous는_MIG4_LOOKUP_AMBIGUOUS로_reject한다() {
        when(partnerLookupClient.findByPartnerNameStrict("중복거래처"))
                .thenThrow(new BusinessException(ErrorCode.MIG3_LOOKUP_AMBIGUOUS, "ambiguous"));

        EcountMig4ImportResult result = importer.importCsv(stream(taxCsv(row("", "중복거래처",
                "100,000", "10,000", "2026/05/01", "AC-001", "1", "100,000", "2026/05/01 -1"))), "tester");

        assertThat(result.rejectedSample()).extracting(EcountMig4ImportResult.RejectedRow::errorCode)
                .containsExactly("MIG4_LOOKUP_AMBIGUOUS");
    }

    @Test
    void 금액_문자_0_음수는_MIG4_AMOUNT_INVALID로_reject한다() {
        EcountMig4ImportResult result = importer.importCsv(stream(taxCsv(
                row("P-001", "삼한상사", "abc", "10,000", "2026/05/01", "AC-001", "1", "100,000", "2026/05/01 -1") +
                row("P-001", "삼한상사", "0", "10,000", "2026/05/01", "AC-002", "1", "100,000", "2026/05/01 -2") +
                row("P-001", "삼한상사", "-1", "10,000", "2026/05/01", "AC-003", "1", "100,000", "2026/05/01 -3"))), "tester");

        assertThat(result.rejected()).isEqualTo(3);
        assertThat(result.rejectedSample()).extracting(EcountMig4ImportResult.RejectedRow::errorCode)
                .containsOnly("MIG4_AMOUNT_INVALID");
    }

    @Test
    void 날짜_포맷_불일치는_MIG4_DATE_INVALID로_reject한다() {
        EcountMig4ImportResult result = importer.importCsv(stream(taxCsv(row("P-001", "삼한상사",
                "100,000", "10,000", "2026-05-01", "AC-001", "1", "100,000", "2026/05/01 -1"))), "tester");

        assertThat(result.rejectedSample()).extracting(EcountMig4ImportResult.RejectedRow::errorCode)
                .containsExactly("MIG4_DATE_INVALID");
    }

    @Test
    void source_row_no는_1부터_순서대로_보존한다() {
        importer.importCsv(stream(taxCsv(
                row("P-001", "삼한상사", "100,000", "10,000", "2026/05/01", "AC-001", "1", "100,000", "2026/05/01 -1") +
                row("P-001", "삼한상사", "200,000", "20,000", "2026/05/02", "AC-002", "1", "200,000", "2026/05/02 -2") +
                row("P-001", "삼한상사", "300,000", "30,000", "2026/05/03", "AC-003", "1", "300,000", "2026/05/03 -3"))), "tester");

        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce()).update(anyString(), params.capture());
        assertThat(params.getAllValues().stream()
                .filter(p -> p.hasValue("row"))
                .map(p -> (Integer) p.getValue("row"))
                .distinct()
                .toList()).contains(1, 2, 3);
    }

    @Test
    void BOM_INPUT을_정상_strip한다() {
        EcountMig4ImportResult result = importer.importCsv(stream("\uFEFF" + taxCsv(row("P-001", "삼한상사",
                "100,000", "10,000", "2026/05/01", "AC-001", "1", "100,000", "2026/05/01 -1"))), "tester");

        assertThat(result.imported()).isEqualTo(1);
    }

    @Test
    void 동일파일_2회_import는_멱등_skip한다() {
        EcountMig4ImportResult first = importer.importCsv(stream(taxCsv(row("P-001", "삼한상사",
                "100,000", "10,000", "2026/05/01", "AC-001", "1", "100,000", "2026/05/01 -1"))), "tester");
        when(jdbcTemplate.update(org.mockito.ArgumentMatchers.contains("INSERT INTO staging.ecount_tax_invoice_raw"),
                any(SqlParameterSource.class))).thenReturn(0);

        EcountMig4ImportResult second = importer.importCsv(stream(taxCsv(row("P-001", "삼한상사",
                "100,000", "10,000", "2026/05/01", "AC-001", "1", "100,000", "2026/05/01 -1"))), "tester");

        assertThat(first.imported()).isEqualTo(1);
        assertThat(second.skipped()).isEqualTo(1);
    }

    @Test
    void soft_deleted_tax_invoice_복구_CTE를_사용한다() {
        EcountMig4ImportResult result = importer.importCsv(stream(taxCsv(row("P-001", "?쇳븳?곸궗",
                "100,000", "10,000", "2026/05/01", "AC-001", "1", "100,000", "2026/05/01 -1"))), "tester");

        assertThat(result.imported()).isEqualTo(1);
        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce())
                .queryForObject(org.mockito.ArgumentMatchers.contains("UPDATE tax_invoices"),
                        any(SqlParameterSource.class), eq(UUID.class));
        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce())
                .queryForObject(org.mockito.ArgumentMatchers.contains("UPDATE tax_invoice_lines"),
                        any(SqlParameterSource.class), eq(UUID.class));
    }

    private static PartnerSummary partner() {
        return new PartnerSummary(UUID.fromString("00000000-0000-0000-0000-000000000101"),
                "P-001", "삼한상사", "123-45-67890", "서울");
    }

    private static InputStream stream(String csv) {
        return new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8));
    }

    private static String taxCsv(String rows) {
        return """
                "데이터관리>출고전표-Excel다운로드"
                "거래처코드\t","종사업장번호\t","거래처명\t","대표자명\t","주소1\t","업태\t","종목\t","Email\t","공급가액\t","부가세\t","일자\t","품목명[규격]\t","수량\t","단가\t","회계전표일자-No.\t",""
                """ + rows;
    }

    private static String row(String code, String partnerName, String supply, String vat,
                              String date, String item, String qty, String unitPrice, String slipNo) {
        return "\"%s\t\",\"\",\"%s\t\",\"대표\t\",\"주소\t\",\"업태\t\",\"종목\t\",\"mail@example.com\t\",\"%s\",\"%s\",\"%s \t\",\"%s\t\",\"%s\",\"%s\",\"%s\t\",\"\"\n"
                .formatted(code, partnerName, supply, vat, date, item, qty, unitPrice, slipNo);
    }
}
