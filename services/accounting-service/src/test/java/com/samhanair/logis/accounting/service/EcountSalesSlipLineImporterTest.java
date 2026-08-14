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
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

/** MIG-4 출고전표 라인 importer behavior 회귀 가드. */
@ExtendWith(MockitoExtension.class)
class EcountSalesSlipLineImporterTest {

    @Mock private NamedParameterJdbcTemplate jdbcTemplate;
    @Mock private PartnerLookupClient partnerLookupClient;

    private EcountSalesSlipLineImporter importer;

    @BeforeEach
    void setUp() {
        importer = new EcountSalesSlipLineImporter(jdbcTemplate, partnerLookupClient);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Object.class)))
                .thenReturn(null);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Integer.class)))
                .thenReturn(1);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(UUID.class)))
                .thenReturn(UUID.fromString("00000000-0000-0000-0000-000000000501"));
        lenient().when(jdbcTemplate.query(anyString(), any(SqlParameterSource.class),
                org.mockito.ArgumentMatchers.<RowMapper<Object>>any())).thenReturn(List.of());
        lenient().when(jdbcTemplate.update(anyString(), any(SqlParameterSource.class))).thenReturn(1);
        lenient().when(partnerLookupClient.findByPartnerCode("P-001")).thenReturn(Optional.of(partner()));
        lenient().when(partnerLookupClient.findByPartnerCode("MISS")).thenReturn(Optional.empty());
        lenient().when(partnerLookupClient.findByPartnerNameStrict("삼한상사")).thenReturn(Optional.of(partner()));
        lenient().when(partnerLookupClient.findByPartnerNameStrict("미등록거래처")).thenReturn(Optional.empty());
    }

    @Test
    void 매칭_slip_존재_line_추가() {
        existingSlip("2026-05-01-001", false, "P-001", "삼한상사");

        EcountMig4ImportResult result = importer.importCsv(stream(salesCsv(row("2026/05/01 -1", "P-001", "삼한상사", "100,000", "0531"))), "tester");

        assertThat(result.updated()).isEqualTo(1);
        assertThat(result.linkedSlipCount()).isEqualTo(1);
    }

    @Test
    void 매칭_slip_미존재_신규_생성() {
        EcountMig4ImportResult result = importer.importCsv(stream(salesCsv(row("2026/05/01 -1", "P-001", "삼한상사", "100,000", "0531"))), "tester");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.unlinkedSlipCount()).isEqualTo(1);
    }

    @Test
    void linkedSlipCount_unlinkedSlipCount_정확() {
        existingSlip("2026-05-01-001", false, "P-001", "삼한상사");

        EcountMig4ImportResult result = importer.importCsv(stream(salesCsv(
                row("2026/05/01 -1", "P-001", "삼한상사", "100,000", "0531") +
                row("2026/05/01 -2", "P-001", "삼한상사", "200,000", "0531"))), "tester");

        assertThat(result.linkedSlipCount()).isEqualTo(1);
        assertThat(result.unlinkedSlipCount()).isEqualTo(1);
    }

    @Test
    void 전표번호_포맷_불일치는_MIG4_SLIP_NO_INVALID() {
        EcountMig4ImportResult result = importer.importCsv(stream(salesCsv(row("bad-slip", "P-001", "삼한상사", "100,000", "0531"))), "tester");

        assertThat(result.rejectedSample()).extracting(EcountMig4ImportResult.RejectedRow::errorCode)
                .containsExactly("MIG4_SLIP_NO_INVALID");
    }

    @Test
    void partner_lookup_miss는_MIG4_LOOKUP_MISS() {
        EcountMig4ImportResult result = importer.importCsv(stream(salesCsv(row("2026/05/01 -1", "MISS", "미등록거래처", "100,000", "0531"))), "tester");

        assertThat(result.rejectedSample()).extracting(EcountMig4ImportResult.RejectedRow::errorCode)
                .containsExactly("MIG4_LOOKUP_MISS");
    }

    @Test
    void 입금예정일_MMDD_year_결합_LocalDate_정확() {
        importer.importCsv(stream(salesCsv(row("2026/05/01 -1", "P-001", "삼한상사", "100,000", "0430"))), "tester");

        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce()).update(anyString(), params.capture());
        assertThat(params.getAllValues().stream()
                .filter(p -> p.hasValue("dueDate"))
                .map(p -> p.getValue("dueDate"))
                .toList()).contains(java.time.LocalDate.of(2026, 4, 30));
    }

    @Test
    void source_row_no는_1부터_보존한다() {
        importer.importCsv(stream(salesCsv(
                row("2026/05/01 -1", "P-001", "삼한상사", "100,000", "0531") +
                row("2026/05/01 -2", "P-001", "삼한상사", "200,000", "0531") +
                row("2026/05/01 -3", "P-001", "삼한상사", "300,000", "0531"))), "tester");

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
        EcountMig4ImportResult result = importer.importCsv(stream("\uFEFF" + salesCsv(row("2026/05/01 -1", "P-001", "삼한상사", "100,000", "0531"))), "tester");

        assertThat(result.imported()).isEqualTo(1);
    }

    @Test
    void 동일파일_2회_import는_멱등_skip한다() {
        EcountMig4ImportResult first = importer.importCsv(stream(salesCsv(row("2026/05/01 -1", "P-001", "삼한상사", "100,000", "0531"))), "tester");
        when(jdbcTemplate.update(org.mockito.ArgumentMatchers.contains("INSERT INTO staging.ecount_sales_slip_line_raw"),
                any(SqlParameterSource.class))).thenReturn(0);

        EcountMig4ImportResult second = importer.importCsv(stream(salesCsv(row("2026/05/01 -1", "P-001", "삼한상사", "100,000", "0531"))), "tester");

        assertThat(first.imported()).isEqualTo(1);
        assertThat(second.skipped()).isEqualTo(1);
    }

    @Test
    void active_slip_partner_정보는_덮어쓰지_않고_mismatch만_보고한다() {
        existingSlip("2026-05-01-001", false, "OLD", "기존거래처");

        EcountMig4ImportResult result = importer.importCsv(stream(salesCsv(row("2026/05/01 -1", "P-001", "삼한상사", "100,000", "0531"))), "tester");

        assertThat(result.mismatchCount()).isEqualTo(1);
        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce()).update(anyString(), params.capture());
        assertThat(params.getAllValues().stream()
                .filter(p -> p.hasValue("partnerCode") && p.hasValue("id"))
                .toList()).isEmpty();
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private void existingSlip(String slipNo, boolean deleted, String partnerCode, String partnerName) {
        when(jdbcTemplate.query(anyString(), any(SqlParameterSource.class), any(RowMapper.class)))
                .thenAnswer(invocation -> {
                    SqlParameterSource params = invocation.getArgument(1);
                    Object canonical = params.getValue("canonical");
                    if (!slipNo.equals(canonical)) {
                        return List.of();
                    }
                    RowMapper mapper = invocation.getArgument(2);
                    java.sql.ResultSet rs = org.mockito.Mockito.mock(java.sql.ResultSet.class);
                    when(rs.getObject("id")).thenReturn(UUID.fromString("00000000-0000-0000-0000-000000000502"));
                    when(rs.getString("slip_no")).thenReturn(slipNo);
                    when(rs.getBoolean("is_deleted")).thenReturn(deleted);
                    when(rs.getString("partner_code")).thenReturn(partnerCode);
                    when(rs.getString("partner_name")).thenReturn(partnerName);
                    return List.of(mapper.mapRow(rs, 0));
                });
    }

    private static PartnerSummary partner() {
        return new PartnerSummary(UUID.fromString("00000000-0000-0000-0000-000000000101"),
                "P-001", "삼한상사", "123-45-67890", "서울");
    }

    private static InputStream stream(String csv) {
        return new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8));
    }

    private static String salesCsv(String rows) {
        return """
                "데이터관리>출고전표-Excel다운로드"
                "일자-No.\t","거래처코드\t","거래처명\t","품목명[규격]\t","수량\t","단가\t","공급가액\t","부가세\t","합계\t","입금예정일\t",""
                """ + rows;
    }

    private static String row(String slipNo, String partnerCode, String partnerName, String supply, String dueDate) {
        return "\"%s\t\",\"%s\t\",\"%s\t\",\"AC-001 [표준]\t\",\"1\",\"%s\",\"%s\",\"10,000\",\"110,000\",\"%s\t\",\"\"\n"
                .formatted(slipNo, partnerCode, partnerName, supply, supply, dueDate);
    }
}
