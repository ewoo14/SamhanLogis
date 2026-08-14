package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
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
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
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

/** MIG-3 입고전표 importer RED 가드. */
@ExtendWith(MockitoExtension.class)
class EcountPurchaseSlipImporterTest {

    @Mock private NamedParameterJdbcTemplate jdbcTemplate;
    @Mock private PartnerLookupClient partnerLookupClient;

    private EcountPurchaseSlipImporter importer;

    @BeforeEach
    void setUp() {
        importer = new EcountPurchaseSlipImporter(jdbcTemplate, partnerLookupClient);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Object.class)))
                .thenReturn(null);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Integer.class)))
                .thenReturn(0);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(UUID.class)))
                .thenReturn(UUID.fromString("00000000-0000-0000-0000-000000000301"));
        lenient().when(jdbcTemplate.update(anyString(), any(SqlParameterSource.class))).thenReturn(1);
        lenient().when(partnerLookupClient.findByPartnerNameStrict("삼한상사"))
                .thenReturn(Optional.of(new PartnerSummary(
                        UUID.fromString("00000000-0000-0000-0000-000000000101"),
                        "P-001", "삼한상사", "123-45-67890", "서울")));
    }

    @Test
    void importCsv_정상_1건을_purchaseSlip으로_적재한다() {
        EcountVoucherImportResult result = importer.importCsv(stream(purchaseCsv("""
                "2026/05/18 -253\t","입고전표 I(매입)\t","1,200\t","삼한상사\t","원자재 매입\t",""
                """)), "tester");

        assertThat(result.totalRows()).isEqualTo(1);
        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.rejected()).isZero();

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce()).queryForObject(
                sql.capture(), any(SqlParameterSource.class), org.mockito.ArgumentMatchers.<Class<?>>any());
        assertThat(sql.getAllValues())
                .anySatisfy(value -> assertThat(value).contains("pg_advisory_xact_lock"));

        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce()).queryForObject(
                sql.capture(), any(SqlParameterSource.class), eq(UUID.class));
        assertThat(sql.getAllValues())
                .anySatisfy(value -> assertThat(value)
                        .contains("purchase_accounting_slips")
                        .contains("WITH restored")
                        .contains("is_deleted = TRUE"));
    }

    @Test
    void importCsv_partner_lookup_miss는_MIG3_LOOKUP_MISS로_reject한다() {
        when(partnerLookupClient.findByPartnerNameStrict("미등록거래처")).thenReturn(Optional.empty());

        EcountVoucherImportResult result = importer.importCsv(stream(purchaseCsv("""
                "2026/05/18 -253\t","입고전표 I(매입)\t","1,200\t","미등록거래처\t","원자재 매입\t",""
                """)), "tester");

        assertThat(result.imported()).isZero();
        assertThat(result.rejected()).isEqualTo(1);
        assertThat(result.rejectedSample())
                .extracting(EcountVoucherImportResult.RejectedRow::errorCode)
                .containsExactly("MIG3_LOOKUP_MISS");
        assertThat(result.rejectedSample().get(0).message()).contains("미등록거래처");
    }

    @Test
    void importCsv_금액_0이하는_MIG3_SLIP_AMOUNT_INVALID로_reject한다() {
        EcountVoucherImportResult result = importer.importCsv(stream(purchaseCsv("""
                "2026/05/18 -253\t","입고전표 I(매입)\t","0\t","삼한상사\t","원자재 매입\t",""
                """)), "tester");

        assertThat(result.rejected()).isEqualTo(1);
        assertThat(result.rejectedSample())
                .extracting(EcountVoucherImportResult.RejectedRow::errorCode)
                .containsExactly("MIG3_SLIP_AMOUNT_INVALID");
    }

    @Test
    void importCsv_동일파일_전표번호_중복은_MIG3_VOUCHER_NO_DUPLICATE로_reject한다() {
        EcountVoucherImportResult result = importer.importCsv(stream(purchaseCsv("""
                "2026/05/18 -253\t","입고전표 I(매입)\t","1,200\t","삼한상사\t","원자재 매입\t",""
                "2026/05/18 -253\t","입고전표 I(매입)\t","3,400\t","삼한상사\t","원자재 추가\t",""
                """)), "tester");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.rejected()).isEqualTo(1);
        assertThat(result.rejectedSample())
                .extracting(EcountVoucherImportResult.RejectedRow::errorCode)
                .containsExactly("MIG3_VOUCHER_NO_DUPLICATE");
    }

    @Test
    void importCsv_source_row_no는_데이터행_기준_1부터_증가한다() {
        importer.importCsv(stream(purchaseCsv("""
                "2026/05/18 -253\t","입고전표 I(매입)\t","1,200\t","삼한상사\t","원자재 매입\t",""
                "2026/05/19 -254\t","입고전표 I(매입)\t","3,400\t","삼한상사\t","원자재 추가\t",""
                "2026/05/20 -255\t","입고전표 I(매입)\t","5,600\t","삼한상사\t","원자재 추가2\t",""
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
    void importCsv_행별_형식오류가_다른행_import를_막지_않는다() {
        EcountVoucherImportResult result = importer.importCsv(stream(purchaseCsv("""
                "bad-voucher\t","입고전표 I(매입)\t","1,200\t","삼한상사\t","오류\t",""
                "2026/05/19 -254\t","입고전표 I(매입)\t","3,400\t","삼한상사\t","정상\t",""
                """)), "tester");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.rejected()).isEqualTo(1);
        assertThat(result.rejectedSample())
                .extracting(EcountVoucherImportResult.RejectedRow::errorCode)
                .containsExactly("MIG3_VOUCHER_NO_INVALID");
    }

    @Test
    void importCsv_header_mismatch는_MIG3_CSV_HEADER_MISMATCH로_전환한다() {
        assertThatThrownBy(() -> importer.importCsv(stream("""
                "잘못된헤더\t","금액\t"
                "x\t","1\t"
                """), "tester"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.MIG3_CSV_HEADER_MISMATCH));
    }

    @Test
    void rawHeaderCrossCheck() throws Exception {
        try (InputStream fixture = EcountPurchaseSlipImporterTest.class
                .getResourceAsStream("/ecount-raw-fixtures/voucher-purchase.csv")) {
            assertThat(fixture).isNotNull();
            EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(fixture.readAllBytes());
            EcountCsvSupport.validateHeader(parsed.header(), EcountPurchaseSlipImporter.HEADERS);
            // raw 파일은 docs/migration/ecount-data/raw/ 에 회사/자택 PC 에만 존재 (CI Linux 미존재).
            // 존재 시 fixture 와 cross-check, 미존재 시 skip (feedback_testcontainers_windows_docker 답습).
            Path raw = rawPath("입고전표I-Excel다운로드(20260501~20260519_1).csv");
            org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(raw),
                    "raw CSV (" + raw + ") 미존재 → cross-check skip");
            EcountCsvSupport.ParsedCsv rawCsv = EcountCsvSupport.parse(Files.readAllBytes(raw));
            assertThat(normalized(parsed.header())).containsExactly(normalized(rawCsv.header()));
        }
    }

    private static InputStream stream(String csv) {
        return new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8));
    }

    private static String purchaseCsv(String rows) {
        return """
                "데이터관리>입고전표 I-Excel다운로드"
                "전표번호\t","거래유형\t","금액\t","거래처명\t","적요명\t",""
                """ + rows;
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
