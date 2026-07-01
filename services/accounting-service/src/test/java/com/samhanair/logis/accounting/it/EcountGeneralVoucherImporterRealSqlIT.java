package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.lenient;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.service.EcountGeneralVoucherImporter;
import com.samhanair.logis.accounting.web.dto.EcountVoucherImportResult;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 회계 슬1 full-form coedit 라운드2 BE blocking fix 회귀 가드.
 *
 * <p>V49({@code ux_journal_lines_journal_line_active}) 가 {@code journal_lines(journal_id, line_no)}
 * UNIQUE 제약을 활성(is_deleted=false) 라인만 대상으로 하는 partial index 로 전환하면서,
 * {@link EcountGeneralVoucherImporter#importCsv} 의 {@code replaceLine} 이 사용하던
 * {@code ON CONFLICT (journal_id, line_no) DO UPDATE} 가 arbiter 를 잃어 PostgreSQL 42P10
 * ("there is no unique or exclusion constraint matching the ON CONFLICT specification")
 * 으로 신규 INSERT 조차 100% 실패하는 결함이 있었다 — {@code WHERE is_deleted = FALSE} 를 명시해
 * partial index 를 arbiter 로 지정해야 한다 (169행 {@code journal_no} 패턴과 동일 스타일).
 *
 * <p>기존 {@code EcountGeneralVoucherImporterTest}(Mockito {@code @Mock NamedParameterJdbcTemplate})
 * 와 {@code EcountVoucherImportControllerIT}({@code @MockBean EcountGeneralVoucherImporter})는
 * SQL 문자열이 실제로 실행되지 않아 이 결함을 잡지 못했다 (false-green,
 * memory {@code feedback_migration_fresh_postgres_probe}). 본 IT 은 importer 를 real bean 으로
 * autowire 하고 Testcontainers 실 PostgreSQL 에 upsert SQL 을 그대로 실행시켜 검증한다.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
class EcountGeneralVoucherImporterRealSqlIT extends AbstractPostgresIT {

    private static final UUID PARTNER_ID = UUID.fromString("00000000-0000-0000-0000-000000009101");

    @Autowired private EcountGeneralVoucherImporter importer;
    @Autowired private JdbcTemplate jdbcTemplate;

    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean(classes = DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUp() {
        lenient().when(partnerLookupClient.findByPartnerNameStrict("삼한상사"))
                .thenReturn(Optional.of(new PartnerSummary(
                        PARTNER_ID, "P-9101", "삼한상사", "123-45-67890", "서울")));
    }

    @Test
    @DisplayName("V49 이후 신규 1건 import 는 42P10 없이 journal_lines 에 실제 insert 된다 (ON CONFLICT arbiter 정합)")
    void importCsv_신규_전표는_ON_CONFLICT_충돌없이_journal_line을_insert한다() {
        String journalNo = "20990101-8801";

        EcountVoucherImportResult result = importer.importCsv(csv("""
                "2099/01/01 -8801\t","일반전표\t","55,000\t","삼한상사\t","슬1 라운드2 fix 회귀\t",""
                """), "realsql-it");

        assertThat(result.rejected()).isZero();
        assertThat(result.imported()).isEqualTo(1);

        UUID journalId = jdbcTemplate.queryForObject(
                "SELECT id FROM journals WHERE journal_no = ? AND is_deleted = FALSE",
                UUID.class, journalNo);
        assertThat(journalId).isNotNull();

        Integer activeLineCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM journal_lines WHERE journal_id = ? AND is_deleted = FALSE",
                Integer.class, journalId);
        assertThat(activeLineCount).isEqualTo(1);

        BigDecimal debit = jdbcTemplate.queryForObject(
                "SELECT debit_amount FROM journal_lines WHERE journal_id = ? AND line_no = 1",
                BigDecimal.class, journalId);
        assertThat(debit).isEqualByComparingTo("55000");
    }

    @Test
    @DisplayName("동일 전표번호 재import 는 journal_line 을 upsert(갱신)하고 신규 행을 만들지 않는다")
    void importCsv_동일_전표번호_재import는_journal_line을_upsert_갱신한다() {
        String journalNo = "20990101-8802";

        EcountVoucherImportResult first = importer.importCsv(csv("""
                "2099/01/01 -8802\t","일반전표\t","10,000\t","삼한상사\t","1차 import\t",""
                """), "realsql-it");
        assertThat(first.rejected()).isZero();
        assertThat(first.imported()).isEqualTo(1);

        EcountVoucherImportResult second = importer.importCsv(csv("""
                "2099/01/01 -8802\t","일반전표\t","77,000\t","삼한상사\t","2차 재import(금액 변경)\t",""
                """), "realsql-it");

        assertThat(second.rejected()).isZero();
        assertThat(second.updated()).isEqualTo(1);
        assertThat(second.imported()).isZero();

        UUID journalId = jdbcTemplate.queryForObject(
                "SELECT id FROM journals WHERE journal_no = ? AND is_deleted = FALSE",
                UUID.class, journalNo);

        Integer totalLineRows = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM journal_lines WHERE journal_id = ?",
                Integer.class, journalId);
        assertThat(totalLineRows).isEqualTo(1); // upsert = 기존 행 갱신, 중복 삽입 아님

        BigDecimal debit = jdbcTemplate.queryForObject(
                "SELECT debit_amount FROM journal_lines WHERE journal_id = ? AND line_no = 1",
                BigDecimal.class, journalId);
        assertThat(debit).isEqualByComparingTo("77000");

        String memo = jdbcTemplate.queryForObject(
                "SELECT memo FROM journal_lines WHERE journal_id = ? AND line_no = 1",
                String.class, journalId);
        assertThat(memo).isEqualTo("2차 재import(금액 변경)");
    }

    private static InputStream csv(String rows) {
        String csv = """
                "데이터관리>일반전표-Excel다운로드"
                "전표번호\t","거래유형\t","금액\t","거래처명\t","적요명\t",""
                """ + rows;
        return new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8));
    }
}
