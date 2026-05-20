package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.web.dto.EcountMig4ImportResult;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

/** MIG-4 주문서 importer behavior 회귀 가드. */
@ExtendWith(MockitoExtension.class)
class EcountOrderImporterTest {

    @Mock private NamedParameterJdbcTemplate jdbcTemplate;

    private EcountOrderImporter importer;

    @BeforeEach
    void setUp() {
        importer = new EcountOrderImporter(jdbcTemplate);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Object.class)))
                .thenReturn(null);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Integer.class)))
                .thenReturn(1);
        lenient().when(jdbcTemplate.update(anyString(), any(SqlParameterSource.class))).thenReturn(1);
    }

    @Test
    void staging_적재_정상() {
        EcountMig4ImportResult result = importer.importCsv(stream(orderCsv(row("2026/05/01 -1", "완료"))), "tester");

        assertThat(result.imported()).isEqualTo(1);
    }

    @Test
    void multi_file_idempotent는_file_hash별로_분리된다() {
        EcountMig4ImportResult first = importer.importCsv(stream(orderCsv(row("2026/05/01 -1", "완료"))), "tester");
        EcountMig4ImportResult second = importer.importCsv(stream(orderCsv(row("2026/05/01 -2", "완료"))), "tester");

        assertThat(first.imported()).isEqualTo(1);
        assertThat(second.imported()).isEqualTo(1);
        assertThat(first.sourceFileHash()).isNotEqualTo(second.sourceFileHash());
    }

    @Test
    void unknown_status는_unknownStatusCount만_올리고_rejected와_중복집계하지_않는다() {
        EcountMig4ImportResult result = importer.importCsv(stream(orderCsv(row("2026/05/01 -1", "알수없음"))), "tester");

        assertThat(result.unknownStatusCount()).isEqualTo(1);
        assertThat(result.rejected()).isZero();
    }

    @Test
    void linkedSlipCount_정확() {
        when(jdbcTemplate.queryForObject(org.mockito.ArgumentMatchers.contains("SELECT COUNT(1)"),
                any(SqlParameterSource.class), eq(Integer.class))).thenReturn(1);

        EcountMig4ImportResult result = importer.importCsv(stream(orderCsv(row("2026/05/01 -1", "완료"))), "tester");

        assertThat(result.linkedSlipCount()).isEqualTo(1);
        assertThat(result.unlinkedSlipCount()).isZero();
    }

    @Test
    void unlinkedSlipCount_정확() {
        when(jdbcTemplate.queryForObject(org.mockito.ArgumentMatchers.contains("SELECT COUNT(1)"),
                any(SqlParameterSource.class), eq(Integer.class))).thenReturn(0);

        EcountMig4ImportResult result = importer.importCsv(stream(orderCsv(row("2026/05/01 -1", "완료"))), "tester");

        assertThat(result.linkedSlipCount()).isZero();
        assertThat(result.unlinkedSlipCount()).isEqualTo(1);
    }

    @Test
    void BOM_INPUT을_정상_strip한다() {
        EcountMig4ImportResult result = importer.importCsv(stream("\uFEFF" + orderCsv(row("2026/05/01 -1", "완료"))), "tester");

        assertThat(result.imported()).isEqualTo(1);
    }

    @Test
    void 동일파일_2회_import는_멱등_skip한다() {
        EcountMig4ImportResult first = importer.importCsv(stream(orderCsv(row("2026/05/01 -1", "완료"))), "tester");
        when(jdbcTemplate.update(org.mockito.ArgumentMatchers.contains("INSERT INTO staging.ecount_order_raw"),
                any(SqlParameterSource.class))).thenReturn(0);

        EcountMig4ImportResult second = importer.importCsv(stream(orderCsv(row("2026/05/01 -1", "완료"))), "tester");

        assertThat(first.imported()).isEqualTo(1);
        assertThat(second.skipped()).isEqualTo(1);
    }

    private static InputStream stream(String csv) {
        return new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8));
    }

    private static String orderCsv(String rows) {
        return """
                "데이터관리>주문서-Excel다운로드"
                "일자-No.\t","거래처명\t","담당자명\t","유효기간\t","결제조건\t","참조\t","진행상태\t","품목명[규격]\t","수량\t","단가\t","공급가액[외화]\t","부가세\t","품목별납기일자\t",""
                """ + rows;
    }

    private static String row(String orderNo, String status) {
        return "\"%s\t\",\"삼한상사\t\",\"홍길동\t\",\"\",\"\",\"\",\"%s\t\",\"AC-001 [표준]\t\",\"1\",\"100,000\",\"100,000\",\"10,000\",\"2026/05/31 \t\",\"\"\n"
                .formatted(orderNo, status);
    }
}
