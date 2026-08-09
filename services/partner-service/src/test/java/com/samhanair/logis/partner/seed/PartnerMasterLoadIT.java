package com.samhanair.logis.partner.seed;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.partner.PartnerServiceApplication;
import com.samhanair.logis.partner.dto.EcountPartnerImportResult;
import com.samhanair.logis.partner.it.AbstractPostgresIT;
import com.samhanair.logis.partner.service.EcountPartnerImporter;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

/**
 * #896 실제 XLSX 정본을 일회용 Testcontainers PostgreSQL에 두 번 적재하는 멱등성 관문.
 * 공유 DB 접속 정보는 사용하지 않으며, 컨테이너 종료 시 데이터가 함께 회수된다.
 */
@SpringBootTest(classes = PartnerServiceApplication.class)
class PartnerMasterLoadIT extends AbstractPostgresIT {

    private static final Path SOURCE = locateSource();

    private static Path locateSource() {
        Path current = Path.of("").toAbsolutePath();
        while (current != null) {
            Path candidate = current.resolve("docs/migration/896-sheet/ecount/거래처등록.xlsx");
            if (Files.exists(candidate)) return candidate;
            current = current.getParent();
        }
        throw new IllegalStateException("#896 정본 XLSX를 워크트리에서 찾지 못했습니다");
    }

    @Autowired
    private EcountPartnerImporter importer;

    @Autowired
    private NamedParameterJdbcTemplate jdbcTemplate;

    @BeforeEach
    void cleanOneShotDatabase() {
        jdbcTemplate.update("DELETE FROM staging.ecount_partner_raw", new MapSqlParameterSource());
        jdbcTemplate.update("DELETE FROM partner_credit_history", new MapSqlParameterSource());
        jdbcTemplate.update("DELETE FROM partner_attachments", new MapSqlParameterSource());
        jdbcTemplate.update("DELETE FROM partners", new MapSqlParameterSource());
    }

    @Test
    void 정본_XLSX를_두번_적재해_행수_값_UUID가_같고_두번째는_update만_한다() throws Exception {
        byte[] source = Files.readAllBytes(SOURCE);

        EcountPartnerImportResult first = importer.importXlsx(
                new java.io.ByteArrayInputStream(source), "896-it");
        Map<String, String> firstSnapshot = snapshot();

        EcountPartnerImportResult second = importer.importXlsx(
                new java.io.ByteArrayInputStream(source), "896-it");
        Map<String, String> secondSnapshot = snapshot();
        assertThat(first.totalRows()).isEqualTo(7253);
        assertThat(first.imported() + first.updated()).isEqualTo(7253);
        assertThat(first.heldParseFailureRows()).isZero();
        assertThat(first.updated()).isZero();
        assertThat(first.excludedTrailerRows()).isEqualTo(1);
        assertThat(second.imported()).isZero();
        assertThat(second.updated()).isEqualTo(first.imported());
        assertThat(secondSnapshot).isEqualTo(firstSnapshot);
        assertThat(count("partners")).isEqualTo(first.imported());
        assertThat(count("staging.ecount_partner_raw")).isEqualTo(7253);
        assertThat(countWhere("partners", "outstanding_balance = 0")).isEqualTo(first.imported());
        assertThat(first.registrationDateParsedCount()).isEqualTo(2423);
        assertThat(first.createdAtLoadTimeCount()).isEqualTo(4830);
        assertThat(first.registrationDateParsedCount() + first.createdAtLoadTimeCount()).isEqualTo(7253);
        assertThat(countWhere("partners", "created_at IS NOT NULL")).isEqualTo(7253);
    }

    private Map<String, String> snapshot() {
        return new LinkedHashMap<>(jdbcTemplate.query(
                "SELECT partner_code, id::text || '|' || coalesce(name, '') || '|' || coalesce(credit_limit::text, 'NULL') || '|' || status || '|' || coalesce(partner_group1, 'NULL') || '|' || created_at::text FROM partners ORDER BY partner_code",
                new MapSqlParameterSource(), rs -> {
                    Map<String, String> values = new LinkedHashMap<>();
                    while (rs.next()) values.put(rs.getString(1), rs.getString(2));
                    return values;
                }));
    }

    private int count(String table) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM " + table,
                new MapSqlParameterSource(), Integer.class);
    }

    private int countWhere(String table, String predicate) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM " + table + " WHERE " + predicate,
                new MapSqlParameterSource(), Integer.class);
    }
}
