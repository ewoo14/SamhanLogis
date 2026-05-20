package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.ecount.EcountMig6ImportResult;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

@ExtendWith(MockitoExtension.class)
class EcountBankAccountImporterTest {

    @Mock private NamedParameterJdbcTemplate jdbcTemplate;
    private EcountBankAccountImporter importer;

    @BeforeEach
    void setUp() {
        importer = new EcountBankAccountImporter(jdbcTemplate);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Object.class)))
                .thenReturn(null);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Integer.class)))
                .thenReturn(0);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(UUID.class)))
                .thenReturn(UUID.fromString("00000000-0000-0000-0000-000000006101"));
        lenient().when(jdbcTemplate.update(anyString(), any(SqlParameterSource.class))).thenReturn(1);
    }

    @Test
    void 통장계좌_정상_import() {
        EcountMig6ImportResult result = importer.importCsv(stream(csv(row("079815326474401", "국민예금", "정기예.적금(1059)", "YES"))), "tester");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.rejected()).isZero();
    }

    @Test
    void 계좌코드_중복은_skip으로_멱등처리한다() {
        lenient().when(jdbcTemplate.update(anyString(), any(SqlParameterSource.class))).thenReturn(0);

        EcountMig6ImportResult result = importer.importCsv(stream(csv(row("079815326474401", "국민예금", "정기예.적금(1059)", "YES"))), "tester");

        assertThat(result.skipped()).isEqualTo(1);
    }

    @Test
    void 사용값_unknown은_MIG6_BOOLEAN_FLAG_INVALID로_reject한다() {
        EcountMig6ImportResult result = importer.importCsv(stream(csv(row("079815326474401", "국민예금", "정기예.적금(1059)", "maybe"))), "tester");

        assertThat(result.rejectedSample()).extracting(EcountMig6ImportResult.RejectedRow::errorCode)
                .containsExactly("MIG6_BOOLEAN_FLAG_INVALID");
    }

    @Test
    void source_row_no는_데이터행_기준_1부터_증가한다() {
        importer.importCsv(stream(csv(row("001", "A", "현금(1019)", "YES") + row("002", "B", "현금(1019)", "YES"))), "tester");

        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce()).update(anyString(), params.capture());
        List<Integer> rows = params.getAllValues().stream()
                .filter(p -> p.hasValue("row"))
                .map(p -> (Integer) p.getValue("row"))
                .distinct()
                .toList();
        assertThat(rows).containsExactly(1, 2);
    }

    @Test
    void BOM_INPUT() {
        EcountMig6ImportResult result = importer.importCsv(stream("\uFEFF" + csv(row("001", "A", "현금(1019)", "YES"))), "tester");

        assertThat(result.imported()).isEqualTo(1);
    }

    @Test
    void 외화통장_사용은_parseUsageFlag로_true_처리한다() {
        importer.importCsv(stream(csv(rowWithForeignCurrency("001", "A", "현금(1019)", "사용", "YES"))), "tester");

        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce()).queryForObject(contains("INSERT INTO bank_accounts"),
                params.capture(), eq(UUID.class));
        assertThat(params.getValue().getValue("foreignCurrency")).isEqualTo(true);
    }

    @Test
    void 외화통장_unknown은_MIG6_BOOLEAN_FLAG_INVALID로_reject한다() {
        EcountMig6ImportResult result = importer.importCsv(stream(csv(rowWithForeignCurrency("001", "A", "현금(1019)", "모름", "YES"))), "tester");

        assertThat(result.rejectedSample()).extracting(EcountMig6ImportResult.RejectedRow::errorCode)
                .containsExactly("MIG6_BOOLEAN_FLAG_INVALID");
    }

    @Test
    void bank_account_duplicate는_MIG6_BANK_ACCOUNT_CODE_DUPLICATE로_reject한다() {
        when(jdbcTemplate.queryForObject(contains("INSERT INTO bank_accounts"), any(SqlParameterSource.class), eq(UUID.class)))
                .thenThrow(new DuplicateKeyException("dup"));

        EcountMig6ImportResult result = importer.importCsv(stream(csv(row("001", "A", "현금(1019)", "YES"))), "tester");

        assertThat(result.rejectedSample()).extracting(EcountMig6ImportResult.RejectedRow::errorCode)
                .containsExactly("MIG6_BANK_ACCOUNT_CODE_DUPLICATE");
    }

    static InputStream stream(String csv) {
        return new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8));
    }

    static String csv(String rows) {
        return """
                "데이터관리>통장계좌-Excel다운로드"
                "계좌코드\t","계좌명\t","계정명(계정코드)\t\t","검색창내용\t","적요\t","외화통장\t","사용\t",""
                """ + rows;
    }

    static String row(String code, String name, String account, String active) {
        return rowWithForeignCurrency(code, name, account, "미사용", active);
    }

    static String rowWithForeignCurrency(String code, String name, String account, String foreignCurrency, String active) {
        return "\"%s\t\",\"%s\t\",\"%s\t\",\"\",\"\",\"%s\t\",\"%s\t\",\"\"\n"
                .formatted(code, name, account, foreignCurrency, active);
    }
}
