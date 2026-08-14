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
import com.samhanair.logis.accounting.web.dto.EcountVoucherImportResult;
import com.samhanair.logis.common.ecount.EcountCsvSupport;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
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

/** MIG-3 출고전표 importer 회귀 가드. */
@ExtendWith(MockitoExtension.class)
class EcountSalesSlipImporterTest {

    @Mock private NamedParameterJdbcTemplate jdbcTemplate;
    @Mock private PartnerLookupClient partnerLookupClient;

    private EcountSalesSlipImporter importer;

    @BeforeEach
    void setUp() {
        importer = new EcountSalesSlipImporter(jdbcTemplate, partnerLookupClient);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Object.class)))
                .thenReturn(null);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Integer.class)))
                .thenReturn(0);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(UUID.class)))
                .thenReturn(UUID.fromString("00000000-0000-0000-0000-000000000302"));
        lenient().when(jdbcTemplate.update(anyString(), any(SqlParameterSource.class))).thenReturn(1);
        lenient().when(partnerLookupClient.findByPartnerNameStrict("삼한상사"))
                .thenReturn(Optional.of(partner()));
    }

    @Test
    void importCsv_정상_1건을_salesSlip으로_적재한다() {
        EcountVoucherImportResult result = importer.importCsv(stream(salesCsv("""
                "2026/05/19 -213\t","출고전표 I(매출)\t","2,778,000\t","삼한상사\t","제품 매출\t",""
                """)), "tester");

        assertThat(result.totalRows()).isEqualTo(1);
        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.posted()).isEqualTo(1);
        assertThat(result.rejected()).isZero();
    }

    @Test
    void importCsv_partner_lookup_miss는_MIG3_LOOKUP_MISS로_reject한다() {
        when(partnerLookupClient.findByPartnerNameStrict("미등록거래처")).thenReturn(Optional.empty());

        EcountVoucherImportResult result = importer.importCsv(stream(salesCsv("""
                "2026/05/19 -213\t","출고전표 I(매출)\t","2,778,000\t","미등록거래처\t","제품 매출\t",""
                """)), "tester");

        assertThat(result.imported()).isZero();
        assertThat(result.rejected()).isEqualTo(1);
        assertThat(result.rejectedSample())
                .extracting(EcountVoucherImportResult.RejectedRow::errorCode)
                .containsExactly("MIG3_LOOKUP_MISS");
    }

    @Test
    void importCsv_금액_문자는_MIG3_SLIP_AMOUNT_INVALID로_reject한다() {
        EcountVoucherImportResult result = importer.importCsv(stream(salesCsv("""
                "2026/05/19 -213\t","출고전표 I(매출)\t","abc\t","삼한상사\t","제품 매출\t",""
                """)), "tester");

        assertThat(result.rejected()).isEqualTo(1);
        assertThat(result.rejectedSample())
                .extracting(EcountVoucherImportResult.RejectedRow::errorCode)
                .containsExactly("MIG3_SLIP_AMOUNT_INVALID");
    }

    @Test
    void importCsv_동일파일_전표번호_중복은_MIG3_VOUCHER_NO_DUPLICATE로_reject한다() {
        EcountVoucherImportResult result = importer.importCsv(stream(salesCsv("""
                "2026/05/19 -213\t","출고전표 I(매출)\t","2,778,000\t","삼한상사\t","제품 매출\t",""
                "2026/05/19 -213\t","출고전표 I(매출)\t","100\t","삼한상사\t","중복\t",""
                """)), "tester");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.rejected()).isEqualTo(1);
        assertThat(result.rejectedSample())
                .extracting(EcountVoucherImportResult.RejectedRow::errorCode)
                .containsExactly("MIG3_VOUCHER_NO_DUPLICATE");
    }

    @Test
    void importCsv_source_row_no는_데이터행_기준_1부터_증가한다() {
        importer.importCsv(stream(salesCsv("""
                "2026/05/19 -213\t","출고전표 I(매출)\t","100\t","삼한상사\t","매출1\t",""
                "2026/05/19 -214\t","출고전표 I(매출)\t","200\t","삼한상사\t","매출2\t",""
                "2026/05/19 -215\t","출고전표 I(매출)\t","300\t","삼한상사\t","매출3\t",""
                """)), "tester");

        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce()).update(anyString(), params.capture());
        assertThat(params.getAllValues().stream()
                .filter(p -> p.hasValue("row"))
                .map(p -> (Integer) p.getValue("row"))
                .distinct()
                .toList()).containsExactly(1, 2, 3);
    }

    @Test
    void importCsv_BOM_입력을_정상_처리한다() {
        EcountVoucherImportResult result = importer.importCsv(stream("\uFEFF" + salesCsv("""
                "2026/05/19 -213\t","출고전표 I(매출)\t","100\t","삼한상사\t","BOM\t",""
                """)), "tester");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.rejected()).isZero();
    }

    @Test
    void importCsv_동일파일_2회_import는_멱등_skip한다() {
        EcountVoucherImportResult first = importer.importCsv(stream(salesCsv("""
                "2026/05/19 -213\t","출고전표 I(매출)\t","100\t","삼한상사\t","매출\t",""
                """)), "tester");
        when(jdbcTemplate.update(org.mockito.ArgumentMatchers.contains("INSERT INTO staging.ecount_sales_slip_raw"),
                any(SqlParameterSource.class))).thenReturn(0);

        EcountVoucherImportResult second = importer.importCsv(stream(salesCsv("""
                "2026/05/19 -213\t","출고전표 I(매출)\t","100\t","삼한상사\t","매출\t",""
                """)), "tester");

        assertThat(first.imported()).isEqualTo(1);
        assertThat(second.skipped()).isEqualTo(1);
        assertThat(second.imported()).isZero();
    }

    @Test
    void importCsv_행별_형식오류가_다른행_import를_막지_않는다() {
        EcountVoucherImportResult result = importer.importCsv(stream(salesCsv("""
                "bad-voucher\t","출고전표 I(매출)\t","100\t","삼한상사\t","오류\t",""
                "2026/05/19 -214\t","출고전표 I(매출)\t","200\t","삼한상사\t","정상\t",""
                """)), "tester");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.rejected()).isEqualTo(1);
        assertThat(result.rejectedSample())
                .extracting(EcountVoucherImportResult.RejectedRow::errorCode)
                .containsExactly("MIG3_VOUCHER_NO_INVALID");
    }

    @Test
    void rawHeaderCrossCheck() throws Exception {
        try (InputStream fixture = EcountSalesSlipImporterTest.class
                .getResourceAsStream("/ecount-raw-fixtures/voucher-sales.csv")) {
            assertThat(fixture).isNotNull();
            EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(fixture.readAllBytes());
            EcountCsvSupport.validateHeader(parsed.header(), EcountSalesSlipImporter.HEADERS);
            // raw 파일은 docs/migration/ecount-data/raw/ 에 회사/자택 PC 에만 존재 (CI Linux 미존재).
            Path raw = rawPath("출고전표I-Excel다운로드(20260501~20260519_1).csv");
            org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(raw),
                    "raw CSV (" + raw + ") 미존재 → cross-check skip");
            EcountCsvSupport.ParsedCsv rawCsv = EcountCsvSupport.parse(Files.readAllBytes(raw));
            assertThat(normalized(parsed.header())).containsExactly(normalized(rawCsv.header()));
        }
    }

    private static InputStream stream(String csv) {
        return new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8));
    }

    private static String salesCsv(String rows) {
        return """
                "데이터관리>출고전표 I-Excel다운로드"
                "전표번호\t","거래유형\t","금액\t","거래처명\t","적요명\t",""
                """ + rows;
    }

    private static PartnerSummary partner() {
        return new PartnerSummary(
                UUID.fromString("00000000-0000-0000-0000-000000000101"),
                "P-001", "삼한상사", "123-45-67890", "서울");
    }

    private static Path rawPath(String fileName) {
        Path fromRoot = Path.of("docs", "migration", "ecount-data", "raw", fileName);
        if (Files.exists(fromRoot)) {
            return fromRoot;
        }
        return Path.of("..", "..", "docs", "migration", "ecount-data", "raw", fileName).normalize();
    }

    private static String[] normalized(String[] row) {
        return java.util.Arrays.stream(row)
                .map(EcountCsvSupport::stripCell)
                .toArray(String[]::new);
    }
}
