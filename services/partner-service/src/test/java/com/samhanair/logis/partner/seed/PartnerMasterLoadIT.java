package com.samhanair.logis.partner.seed;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.partner.PartnerServiceApplication;
import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.domain.PartnerCreditHistory;
import com.samhanair.logis.partner.dto.EcountPartnerImportResult;
import com.samhanair.logis.partner.it.AbstractPostgresIT;
import com.samhanair.logis.partner.repository.PartnerCreditHistoryRepository;
import com.samhanair.logis.partner.repository.PartnerRepository;
import com.samhanair.logis.partner.service.EcountPartnerImporter;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;

/**
 * #896 실제 XLSX 정본을 일회용 Testcontainers PostgreSQL에 두 번 적재하는 멱등성 관문.
 * 공유 DB 접속 정보는 사용하지 않으며, 컨테이너 종료 시 데이터가 함께 회수된다.
 */
@SpringBootTest(classes = PartnerServiceApplication.class)
@AutoConfigureMockMvc
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

    @Autowired
    private PartnerRepository partnerRepository;

    @Autowired
    private PartnerCreditHistoryRepository partnerCreditHistoryRepository;

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void allowAdminActions() {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);
    }

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

    @Test
    void RED_A_등록일자_있는_신규행의_DB_created_at은_등록일_자정이다() {
        importer.importCsv(csv("RED-A", "20230814"), "r3-it");

        String createdAt = jdbcTemplate.queryForObject(
                "SELECT created_at::text FROM partners WHERE partner_code = 'RED-A'",
                new MapSqlParameterSource(), String.class);

        System.out.println("GREEN-A SELECT created_at FROM partners WHERE partner_code='RED-A' => " + createdAt);
        assertThat(createdAt).startsWith("2023-08-14 00:00:00");
    }

    @Test
    void RED_B_등록일자_있는_기존행의_DB_created_at은_등록일_자정으로_교정된다() {
        importer.importCsv(csv("RED-B", "20230101"), "r3-it");

        importer.importCsv(csv("RED-B", "20230814"), "r3-it");

        String createdAt = jdbcTemplate.queryForObject(
                "SELECT created_at::text FROM partners WHERE partner_code = 'RED-B'",
                new MapSqlParameterSource(), String.class);

        System.out.println("GREEN-B SELECT created_at FROM partners WHERE partner_code='RED-B' => " + createdAt);
        assertThat(createdAt).startsWith("2023-08-14 00:00:00");
    }

    @Test
    void RED_C_등록일자_없는_행은_연속_적재해도_DB_created_at이_불변이다() {
        importer.importCsv(csv("RED-C", "임시"), "r3-it");
        LocalDateTime first = jdbcTemplate.queryForObject(
                "SELECT created_at FROM partners WHERE partner_code = 'RED-C'",
                new MapSqlParameterSource(), LocalDateTime.class);

        importer.importCsv(csv("RED-C", "임시"), "r3-it");
        LocalDateTime second = jdbcTemplate.queryForObject(
                "SELECT created_at FROM partners WHERE partner_code = 'RED-C'",
                new MapSqlParameterSource(), LocalDateTime.class);

        System.out.println("GREEN-C SELECT created_at FROM partners WHERE partner_code='RED-C' => first="
                + first + ", second=" + second);
        assertThat(second).isEqualTo(first);
    }

    @Test
    void RED_A_관리자_삭제_후_같은_코드_재적재는_원래_UUID를_복원해야한다() throws Exception {
        String code = "RED-UUID-RESTORE";
        importer.importCsv(csv(code, "20230814", "10"), "r6-it");
        String beforeUuid = jdbcTemplate.queryForObject(
                "SELECT id::text FROM partners WHERE partner_code = :code AND is_deleted = false",
                new MapSqlParameterSource("code", code), String.class);

        mockMvc.perform(MockMvcRequestBuilders.delete("/admin/partners/{partnerCode}", code)
                        .header("X-User-Id", "10000000-0000-0000-0000-000000000102")
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk());

        importer.importCsv(csv(code, "20230814"), "r6-it");

        String state = jdbcTemplate.queryForObject(
                "SELECT string_agg(id::text || '|' || is_deleted::text, ',' ORDER BY is_deleted, id) "
                        + "FROM partners WHERE partner_code = :code",
                new MapSqlParameterSource("code", code), String.class);
        String activeUuid = jdbcTemplate.queryForObject(
                "SELECT id::text FROM partners WHERE partner_code = :code AND is_deleted = false",
                new MapSqlParameterSource("code", code), String.class);
        System.out.println("RED-A SELECT partner_code='" + code + "' before_uuid=" + beforeUuid
                + " active_uuid=" + activeUuid + " rows=" + state);

        assertThat(activeUuid).isEqualTo(beforeUuid);
        assertThat(state).isEqualTo(beforeUuid + "|false");
    }

    @Test
    void RED_B_삭제행을_참조하던_FK_자식은_재적재_후_고아가_되지_않는다() throws Exception {
        String code = "RED-FK-RESTORE";
        importer.importCsv(csv(code, "20230814", "10"), "r6-it");
        Partner original = partnerRepository.findByPartnerCode(code).orElseThrow();
        partnerCreditHistoryRepository.save(
                PartnerCreditHistory.creditLimitChange(original, java.math.BigDecimal.TEN, "r6-it"));

        mockMvc.perform(MockMvcRequestBuilders.delete("/admin/partners/{partnerCode}", code)
                        .header("X-User-Id", "10000000-0000-0000-0000-000000000102")
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk());
        importer.importCsv(csv(code, "20230814", "10"), "r6-it");

        Integer orphanReferenceRows = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM partner_credit_history h "
                        + "WHERE h.partner_id <> (SELECT p.id FROM partners p "
                        + "WHERE p.partner_code = :code AND p.is_deleted = false)",
                new MapSqlParameterSource("code", code), Integer.class);
        Integer referenceRows = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM partner_credit_history h "
                        + "JOIN partners p ON p.id = h.partner_id WHERE p.partner_code = :code",
                new MapSqlParameterSource("code", code), Integer.class);
        System.out.println("RED-B SELECT orphan_reference_rows=" + orphanReferenceRows
                + " reference_rows=" + referenceRows + " partner_code='" + code + "'");

        assertThat(referenceRows).isEqualTo(1);
        assertThat(orphanReferenceRows).isZero();
    }

    @Test
    void RED_C_비활성_거래처는_파일의_YES만으로_활성화되지_않는다() {
        String code = "RED-STATUS-PRESERVE";
        importer.importCsv(csv(code, "20230814", "", "NO"), "r6-it");
        importer.importCsv(csv(code, "20230814", "", "YES"), "r6-it");

        String statusValue = jdbcTemplate.queryForObject(
                "SELECT status::text FROM partners WHERE partner_code = :code AND is_deleted = false",
                new MapSqlParameterSource("code", code), String.class);
        System.out.println("RED-C SELECT status FROM partners WHERE partner_code='" + code
                + "' => " + statusValue);
        assertThat(statusValue).isEqualTo("SUSPENDED");
    }

    private ByteArrayInputStream csv(String code, String registrationDate) {
        return csv(code, registrationDate, "", "YES");
    }

    private ByteArrayInputStream csv(String code, String registrationDate, String creditLimit) {
        return csv(code, registrationDate, creditLimit, "YES");
    }

    private ByteArrayInputStream csv(String code, String registrationDate, String creditLimit,
                                     String usageFlag) {
        String value = "\uFEFF\"데이터관리>거래처-Excel다운로드\"\n"
                + "\"거래처코드\t\",\"등록일자\t\",\"담당자명\t\",\"종사업장번호\t\",\"거래처명\t\","
                + "\"대표자명\t\",\"주소1\t\",\"전화번호\t\",\"핸드폰번호\t\",\"검색창내용\t\","
                + "\"특이사항\t\",\"그룹\t\",\"사용구분\t\",\"이체정보\t\",\"여신한도\t\",\"최초작성일자\t\",\"\"\n"
                + String.format("\"%s\t\",\"%s\t\",\"담당자\t\",\"\t\",\"R3 거래처\t\",\"대표\t\",\"서울\t\",\"\t\",\"\t\",\"\t\",\"\t\",\"일반업체\t\",\"%s\t\",\"등록\t\",\"%s\t\",\"\t\",\"\"\n", code, registrationDate, usageFlag, creditLimit);
        return new ByteArrayInputStream(value.getBytes(StandardCharsets.UTF_8));
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
