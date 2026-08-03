package com.samhanair.logis.product.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.samhanair.logis.product.web.dto.EcountProductImportResult;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.ArgumentCaptor;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

/** PR #984 HIGH-1 RED: 순번코드 동명 raw 그룹이 후보 판정 실패로 누락되는 경로. */
@ExtendWith(MockitoExtension.class)
class EcountProductImporterSameNameMergeTest {

    private static final UUID PRODUCT_ID = UUID.fromString("00000000-0000-0000-0000-000000000984");

    @Mock
    private NamedParameterJdbcTemplate jdbcTemplate;

    @InjectMocks
    private EcountProductImporter importer;

    @BeforeEach
    void setUp() {
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Integer.class)))
                .thenReturn(0);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(UUID.class)))
                .thenReturn(PRODUCT_ID);
        lenient().when(jdbcTemplate.queryForList(anyString(), any(SqlParameterSource.class), eq(String.class)))
                .thenReturn(List.of());
        lenient().when(jdbcTemplate.queryForList(anyString(), any(SqlParameterSource.class), eq(UUID.class)))
                .thenAnswer(invocation -> {
                    String sql = invocation.getArgument(0);
                    if (sql.contains("is_deleted = TRUE")) {
                        return List.of();
                    }
                    return sql.contains("SELECT id") ? List.of(PRODUCT_ID) : List.of();
                });
        lenient().when(jdbcTemplate.update(anyString(), any(SqlParameterSource.class))).thenReturn(1);
    }

    @Test
    void 승인된_순번코드와_모델코드는_fingerprint가_달라도_같은_품목으로_병합된다() {
        EcountProductImportResult result = importer.importCsv(
                itemCsv(
                        row("00130", "AJ030RXH4BC1", "627,000", "652,080", ""),
                        row("AJ030RXH4BC1", "AJ030RXH4BC1 (RX다배관)", "627,000", "1,254,000", "다배관")),
                null, null, "r9-alias-precedence-red");

        assertThat(result.imported()).isOne();
        assertThat(result.aliasImported()).isEqualTo(2);
        assertThat(result.skippedGroupCount()).isZero();
    }

    @Test
    void 같은_품목명_순번코드_그룹은_대표후보_실패로_누락되지_않고_한_품목과_alias로_병합된다() {
        EcountProductImportResult result = importer.importCsv(
                itemCsv(
                        row("AAAA-00004", "삼성추가배관(벽걸이)", "0", "12,277", "10평이하"),
                        row("AAAA-00005", "삼성추가배관(벽걸이)", "0", "12,277", "10평이하")),
                null, null, "high-1-red");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.aliasImported()).isEqualTo(2);
        assertThat(result.skippedGroupCount()).isZero();
    }

    @Test
    void 같은_품목명이어도_규격과_단가가_다르면_각각의_품목과_값을_보존한다() {
        EcountProductImportResult result = importer.importCsv(
                itemCsv(
                        row("AAAA-00022", "고소작업차(스카이)", "0", "148,512", "저층용(2~8층)"),
                        row("AAAA-00023", "고소작업차(스카이)", "0", "247,521", "저층용(9층이상)")),
                null, null, "high-1-red-real-loss");

        assertThat(result.imported()).isEqualTo(2);
        assertThat(result.aliasImported()).isEqualTo(2);
        assertThat(result.skippedGroupCount()).isZero();
    }

    @Test
    void 관계_연결행의_비어_있지_않은_단가는_대표행_공백을_보완한다() {
        ArgumentCaptor<SqlParameterSource> paramsCaptor = ArgumentCaptor.forClass(SqlParameterSource.class);

        importer.importCsv(
                itemCsv(
                        rowWithPrices("MAIN-001", "제품A", "0", "0", "0", "대표규격"),
                        rowWithPrices("ALIAS-001", "제품A", "123,000", "456,000", "789,000", "연결규격")),
                relationCsv("MAIN-001", "제품A", "ALIAS-001", "제품A"), null, "r11-fieldwise");

        org.mockito.Mockito.verify(jdbcTemplate).queryForObject(
                org.mockito.ArgumentMatchers.contains("INSERT INTO products"),
                paramsCaptor.capture(), eq(UUID.class));
        assertThat((BigDecimal) paramsCaptor.getValue().getValue("outboundPrice"))
                .isEqualByComparingTo("123000");
        assertThat((BigDecimal) paramsCaptor.getValue().getValue("purchasePrice"))
                .isEqualByComparingTo("456000");
        assertThat((BigDecimal) paramsCaptor.getValue().getValue("singlePrice"))
                .isEqualByComparingTo("789000");
    }

    @Test
    void AP110RNPPHH1_싱글은_대표품목의_662000을_유지한다() {
        ArgumentCaptor<SqlParameterSource> paramsCaptor = ArgumentCaptor.forClass(SqlParameterSource.class);

        importer.importCsv(
                itemCsv(
                        rowWithPrices("AP110RNPPHH1", "AP110RNPPHH1 [프리미엄 3상 실내기]",
                                "1,331,000", "0", "662,000", ""),
                        rowWithPrices("PHN-00027", "AP110RNPPHH1 [프리미엄 3상]",
                                "1,331,000", "0", "680,000", "")),
                relationCsv("AP110RNPPHH1", "AP110RNPPHH1 [프리미엄 3상 실내기]",
                        "PHN-00027", "AP110RNPPHH1 [프리미엄 3상]"), null, "r11-ap110");

        org.mockito.Mockito.verify(jdbcTemplate).queryForObject(
                org.mockito.ArgumentMatchers.contains("INSERT INTO products"),
                paramsCaptor.capture(), eq(UUID.class));
        assertThat((BigDecimal) paramsCaptor.getValue().getValue("singlePrice"))
                .isEqualByComparingTo("662000");
    }

    @Test
    void 관계_규격명의_공백만_다르면_정규화해서_한_품목으로_병합한다() {
        ArgumentCaptor<SqlParameterSource> paramsCaptor = ArgumentCaptor.forClass(SqlParameterSource.class);

        importer.importCsv(
                itemCsv(
                        rowWithPrices("AXJ-TA3419M", "AXJ-TA3419M", "0", "0", "0", "T 분기관"),
                        rowWithPrices("SAX-00006", "AXJ-TA3419M", "0", "0", "0", "T분기관")),
                relationCsv("AXJ-TA3419M", "AXJ-TA3419M", "SAX-00006", "AXJ-TA3419M"), null,
                "r11-spec-normalize");

        org.mockito.Mockito.verify(jdbcTemplate).queryForObject(
                org.mockito.ArgumentMatchers.contains("INSERT INTO products"),
                paramsCaptor.capture(), eq(UUID.class));
        assertThat(paramsCaptor.getValue().getValue("spec")).isEqualTo("T분기관");
    }

    @Test
    void 승인된_모델코드_연결도_직접_연결행의_비어_있지_않은_값을_보완한다() {
        ArgumentCaptor<SqlParameterSource> paramsCaptor = ArgumentCaptor.forClass(SqlParameterSource.class);

        importer.importCsv(
                itemCsv(
                        rowWithPrices("AR-ED00", "AR-ED00", "0", "0", "0", ""),
                        rowWithPrices("SAR-00011", "AR-ED00", "777,000", "0", "0", "")),
                null, null, "r11-approved-fieldwise");

        org.mockito.Mockito.verify(jdbcTemplate).queryForObject(
                org.mockito.ArgumentMatchers.contains("INSERT INTO products"),
                paramsCaptor.capture(), eq(UUID.class));
        assertThat((BigDecimal) paramsCaptor.getValue().getValue("outboundPrice"))
                .isEqualByComparingTo("777000");
    }

    @Test
    void modelName_merge_update는_두_유니크_충돌을_조건부로_피하고_중복_assignment를_만들지_않는다() {
        when(jdbcTemplate.queryForList(argThat(sql -> sql.contains("UPDATE products p")),
                any(SqlParameterSource.class), eq(UUID.class)))
                .thenReturn(List.of(PRODUCT_ID));
        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);

        importer.importCsv(
                itemCsv(row("MERGE-984", "기존 시트 품목", "100,000", "70,000", "규격")),
                null, null, "high-1-sql");

        org.mockito.Mockito.verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce()).queryForList(
                sqlCaptor.capture(), any(SqlParameterSource.class), eq(UUID.class));
        String updateSql = sqlCaptor.getAllValues().stream()
                .filter(sql -> sql.contains("UPDATE products p"))
                .findFirst()
                .orElseThrow();
        assertThat(updateSql.split("outdoor_price =", -1).length - 1).isOne();
        assertThat(updateSql).contains("NOT EXISTS")
                .contains("product_code = :code")
                .contains("model_code = :code")
                .contains("p.lineage = 'SHEET'");
    }

    private static InputStream itemCsv(String... rows) {
        String header = Arrays.stream(EcountProductImporter.ITEM_HEADERS)
                .map(value -> "\"" + value + "\"")
                .collect(Collectors.joining(","));
        return stream("\"데이터관리>품목-Excel다운로드\"\n"
                + header + "\n"
                + String.join("\n", rows) + "\n");
    }

    private static String row(String code, String name, String outbound, String inbound, String specification) {
        String[] cells = {code, name, outbound, inbound, "", "", "0", "0", "0", "0", "[상품]", specification, "YES"};
        return Arrays.stream(cells)
                .map(value -> "\"" + value.replace("\"", "\"\"") + "\"")
                .collect(Collectors.joining(","));
    }

    private static String rowWithPrices(String code, String name, String outbound, String inbound,
                                        String single, String specification) {
        String[] cells = {code, name, outbound, inbound, single, "0", "0", "0", "0", "0", "[상품]",
                specification, "YES"};
        return Arrays.stream(cells)
                .map(value -> "\"" + value.replace("\"", "\"\"") + "\"")
                .collect(Collectors.joining(","));
    }

    private static InputStream relationCsv(String mainCode, String mainName,
                                           String aliasCode, String aliasName) {
        return stream("\"데이터관리>품목관계-Excel다운로드\"\n"
                + "\"대표품목코드\",\"대표품목명\",\"대표품목단위\",\"연결품목코드\",\"연결품목명\",\"연결품목단위\",\"연결품목 환산수량\",\"대표품목 환산수량\",\"수량관리기준\"\n"
                + String.join(",", quote(mainCode), quote(mainName), quote(""), quote(aliasCode), quote(aliasName),
                quote(""), quote("1"), quote("1"), quote("대표품목")) + "\n");
    }

    private static String quote(String value) {
        return "\"" + value.replace("\"", "\"\"") + "\"";
    }

    private static InputStream stream(String csv) {
        return new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8));
    }
}
