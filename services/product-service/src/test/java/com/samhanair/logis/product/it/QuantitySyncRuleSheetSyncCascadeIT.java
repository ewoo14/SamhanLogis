package com.samhanair.logis.product.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.product.client.GoogleSheetsClient;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.QuantitySyncConflictPolicy;
import com.samhanair.logis.product.domain.QuantitySyncEstimateCategory;
import com.samhanair.logis.product.domain.QuantitySyncInactiveBehavior;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.service.ProductService;
import com.samhanair.logis.product.service.ProductSheetSyncService;
import com.samhanair.logis.product.service.QuantitySyncRuleService;
import com.samhanair.logis.product.web.dto.CreateProductRequest;
import com.samhanair.logis.product.web.dto.ProductResponse;
import com.samhanair.logis.product.web.dto.QuantitySyncRuleRequest;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.annotation.DirtiesContext;

/**
 * 재수렴 R4 결함 A U-3 정적 관찰 — {@link ProductSheetSyncService#syncTab} 이 시트에서
 * 사라진 품목을 무조건 soft-delete 하는데, 그 품목을 활성 수량 동기화 규칙이 참조 중이면
 * V24 deferred constraint trigger 가 커밋 시점에 위반을 던져 "그 탭 전체 sync 트랜잭션이
 * 롤백될 수 있다"는 관찰을 <b>실행으로 확증/반증</b>한다(Google Sheets 자격증명 없이
 * {@code GoogleSheetsClient} 를 {@code @MockBean} 으로 격리 — memory
 * feedback_it_mockbean_external_clients.md 가드, {@link ProductSheetSyncServiceIT} 와 동일 패턴).
 *
 * <p><b>실행 결과 — "전체 탭 롤백" 주장은 반증됐다.</b> {@code syncAll()} 이
 * {@code syncTab(mapping, defaultCategory)} 를 self-invocation(같은 클래스 인스턴스, {@code this}
 * 경유)으로 호출하므로 {@code syncTab} 의 {@code @Transactional} 은 Spring AOP 프록시를 타지
 * 않아 적용되지 않는다(memory feedback_self_invocation_transactional_bypass.md 와 동일 함정,
 * 새로 발견). 실측 스택트레이스는 예외가 {@code ProductSheetSyncService.java:1282}
 * ({@code productRepository.save(p)}, soft-delete 루프 내부) 에서 그 저장 호출 자신의
 * 독립 mini-transaction(Spring Data JPA repository proxy 의 자체 {@code @Transactional})
 * commit 중에 발생함을 보여준다 — 즉 "탭 전체 = 1 transaction" 이 아니라 "row(정확히는
 * repository 호출) 하나 = transaction 하나"다. 따라서:
 * <ul>
 *   <li>먼저 처리된 무관한 품목(KEEP)의 가격 갱신은 이미 커밋되어 그대로 남는다.</li>
 *   <li>규칙이 참조하는 품목(GONE) 자신의 soft-delete 만 그 자리에서 rollback 되어
 *       {@code is_deleted=false} 로 남는다(fail-closed — 의도한 안전망과 결과적으로 같다).</li>
 *   <li>{@code syncAll()} 은 예외를 catch 해 정상 반환하고, {@code TabSyncResult.error} 필드에
 *       원인 텍스트를 <b>그대로</b> 담는다 — 이 경로는 애초에 {@code GlobalExceptionHandler}
 *       를 거치지 않으므로(컨트롤러 예외가 아니라 {@code syncAll()} 내부 try/catch 가 직접
 *       잡음) 결함 A 의 "동시 편집 충돌 또는 제약 위반" 마스킹이 처음부터 발생하지 않는다 —
 *       U-1 은 이 경로에서 <b>이미</b> 성립해 있었다(원문은 raw Hibernate/Postgres 텍스트라
 *       한국어로 다듬어지진 않았지만 원인이 뭉개지지 않는다).</li>
 * </ul>
 *
 * <p>이 실행 결과에 따라 이번 라운드는 {@code ProductSheetSyncService.java} 를 수정하지
 * 않는다 — U-1(원인이 드러나는가)이 이미 참이라 결함 A/B 의 fix 범위(GlobalExceptionHandler
 * 번역기)가 이 경로에 적용될 필요도, 적용될 경로도 없다. self-invocation 으로 인한
 * "시트 1 tab 씩 별도 트랜잭션" 문서화 오류(JavaDoc:70)와 "실패한 row 이후 같은 회차의
 * 나머지 soft-delete 후보가 스킵되고 다음 회차에 재시도되는" 거동은 U-1 범위 밖의 별도
 * 결함류로 판단해 이번 라운드 fix 범위에 포함하지 않는다(보고서에 정직히 기록).
 */
@SpringBootTest(properties = {
        "app.scheduling.enabled=false",
        "google.sheets.sheet-id=test-sheet-id",
        "google.sheets.endpoint-override=http://localhost:0"
})
@DirtiesContext
@WithMockUser(username = "test-sync")
class QuantitySyncRuleSheetSyncCascadeIT extends AbstractPostgresIT {

    private static final String LEGACY_REF = "896-r4-u3";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @MockBean
    private GoogleSheetsClient sheetsClient;

    @Autowired
    private ProductSheetSyncService syncService;

    @Autowired
    private ProductService productService;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private QuantitySyncRuleService quantitySyncRuleService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private javax.sql.DataSource dataSource;

    @BeforeEach
    void setUp() throws Exception {
        cleanup();
        syncService.clearHashCacheForTest();
        lenient().doNothing().when(sheetsClient).invalidateCache();
        lenient().when(sheetsClient.readSheetFormulas(anyString(), anyString())).thenReturn(List.of());
        lenient().when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
    }

    /**
     * 재수렴 R4 fix 작업 중 자체 발견 — 이 {@code @AfterEach} 가 누락돼 있었다. 이 테스트는
     * GONE 자신의 soft-delete는 rollback되지만(then 3) R4U3_RULE 자체는 정상 커밋되어 남는다
     * — {@code @BeforeEach} 의 {@code cleanup()} 만으로는 "이 클래스가 마지막으로 실행"되는
     * 순서에서 다음 클래스로 누출된다. 실측: product-service 전체 스위트 3회 중 2회에서
     * {@code QuantitySyncRuleCrudIT}의 범위 없는 {@code service.list(null)}이 이 R4U3_RULE을
     * 주워 실패했다(테스트 클래스 실행 순서가 비결정적이라 매번 재현되지는 않음 — 진짜
     * flaky가 아니라 이 누락된 정리가 원인).
     */
    @AfterEach
    void tearDown() {
        cleanup();
    }

    @Test
    void U3_규칙참조품목이_시트에서_사라져도_같은_탭의_무관한_갱신은_유지되고_원인도_드러난다() throws Exception {
        // given: 실 API로 품목 3개 생성 — GONE(규칙 source, 이번 sync에서 시트 탈락),
        // PARTNER(규칙 target, 매 sync 시트에 계속 존재), KEEP(규칙과 무관, 매 sync 존재 +
        // 가격 변경으로 "갱신이 실제로 커밋되는가"의 대조군).
        String goneCode = createHomeMultiProduct("R4U3-GONE");
        String partnerCode = createHomeMultiProduct("R4U3-PARTNER");
        String keepCode = createHomeMultiProduct("R4U3-KEEP");

        quantitySyncRuleService.create(ruleRequest("R4U3_RULE", goneCode, partnerCode), "qa-u3");

        // 1차 sync — 셋 다 시트에 존재(베이스라인 rowHash 확립)
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
                row("R4U3 GONE", goneCode, "", "1,000,000", "", "900,000"),
                row("R4U3 PARTNER", partnerCode, "", "1,000,000", "", "900,000"),
                row("R4U3 KEEP", keepCode, "", "1,000,000", "", "900,000")
        ));
        ProductSheetSyncService.SyncSummary baseline = syncService.syncAll();
        assertThat(baseline.byTab.get("홈멀티").error).isNull();

        // when: 2차 sync — GONE만 시트에서 사라짐. PARTNER는 그대로(규칙 반대편이 멀쩡해야
        // "GONE 하나 때문에" 라는 변수만 격리된다). KEEP은 가격이 바뀐 채로 남아 "무관한
        // 갱신이 실제로 커밋되는가"를 관찰한다.
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
                row("R4U3 PARTNER", partnerCode, "", "1,000,000", "", "900,000"),
                row("R4U3 KEEP", keepCode, "", "1,999,000", "", "1,500,000")
        ));

        // when
        ProductSheetSyncService.SyncSummary summary = syncService.syncAll();

        // then 1 — syncAll()은 예외를 던지지 않고 정상 반환한다(내부 try/catch가 흡수).
        ProductSheetSyncService.TabSyncResult homeTab = summary.byTab.get("홈멀티");
        assertThat(homeTab).isNotNull();

        // then 2 — "탭 전체 롤백" 반증: 무관한 KEEP의 가격 갱신은 실제로 커밋되어 있다.
        // (self-invocation으로 매 productRepository.save() 호출이 독립 mini-transaction —
        // KEEP은 GONE보다 먼저/독립적으로 커밋되므로 GONE의 실패와 무관하게 살아남는다.)
        Optional<Product> keepAfter = productRepository.findByModelCodeAndIsDeletedFalse(keepCode);
        assertThat(keepAfter).isPresent();
        assertThat(keepAfter.get().getReleasePrice()).isEqualByComparingTo(new BigDecimal("1999000"));

        // then 3 — fail-closed 확인: 규칙이 참조하는 GONE 자신은 soft-delete가 rollback되어
        // is_deleted=false로 남는다(단종/삭제 가드와 결과적으로 동일한 안전망).
        Boolean goneDeleted = jdbcTemplate.queryForObject(
                "SELECT is_deleted FROM products WHERE model_code = ?", Boolean.class, goneCode);
        assertThat(goneDeleted).isFalse();

        // then 4 — U-1: 이 경로는 GlobalExceptionHandler를 거치지 않지만(컨트롤러 예외가 아님),
        // TabSyncResult.error가 "동시 편집 충돌 또는 제약 위반" 같은 범용 문구로 뭉개지지 않고
        // V24 트리거의 원문 RAISE EXCEPTION 사유를 그대로 담아 원인을 드러낸다.
        assertThat(homeTab.error)
                .isNotNull()
                .doesNotContain("동시 편집 충돌 또는 제약 위반")
                .contains("quantity_sync cannot reference deleted or invisible product");
    }

    private String createHomeMultiProduct(String code) {
        java.util.UUID categoryId = jdbcTemplate.queryForObject(
                "SELECT id FROM categories ORDER BY id LIMIT 1", java.util.UUID.class);
        CreateProductRequest req = new CreateProductRequest(
                code + " 품목", code, categoryId, BigDecimal.ZERO, BigDecimal.ZERO,
                "KRW", null, null, null, ProductCategory.HOME_MULTI, null, null, null, null,
                null, null, null, UsageScope.BOTH, List.of(EstimateCategory.HOME_MULTI), null);
        ProductResponse created = productService.create(req);
        return created.modelCode();
    }

    private QuantitySyncRuleRequest ruleRequest(String ruleKey, String sourceCode, String targetCode)
            throws Exception {
        JsonNode condition = MAPPER.readTree("{}");
        return new QuantitySyncRuleRequest(ruleKey, QuantitySyncEstimateCategory.HOME_MULTI,
                ruleKey + " 이름", true, "SUM", condition, QuantitySyncInactiveBehavior.ZERO,
                QuantitySyncConflictPolicy.ADD, 10, LEGACY_REF,
                List.of(new QuantitySyncRuleRequest.SourceRequest(sourceCode, new BigDecimal("1"))),
                List.of(new QuantitySyncRuleRequest.TargetRequest(targetCode, new BigDecimal("1"), "NONE", 1)));
    }

    private void cleanup() {
        // 세 DELETE를 한 transaction으로 묶는다 — 별도 auto-commit 문으로 나누면 그 사이
        // 순간에 deferred constraint trigger가 "rule must have active source and target
        // rows"로 오탐한다(다른 quantitysync IT와 동일 원인 — 이 파일도 자체 발견 시점에
        // 함께 맞춘다).
        runInTransaction(connection -> {
            execute(connection, """
                    DELETE FROM quantity_sync_source
                     WHERE rule_id IN (SELECT id FROM quantity_sync_rule WHERE legacy_ref = ?)
                    """, LEGACY_REF);
            execute(connection, """
                    DELETE FROM quantity_sync_target
                     WHERE rule_id IN (SELECT id FROM quantity_sync_rule WHERE legacy_ref = ?)
                    """, LEGACY_REF);
            execute(connection, "DELETE FROM quantity_sync_rule WHERE legacy_ref = ?", LEGACY_REF);
        });
        // syncAll()이 매칭된 기존 품목마다 upsertPriceHistory()를 호출해 price_history 행을
        // 만든다(ProductSheetSyncService.java:1194/1232) — FK price_history_product_id_fkey
        // 때문에 products보다 먼저 지워야 한다(자체 발견 — 첫 시도에서 FK 위반으로 확인).
        jdbcTemplate.update("""
                DELETE FROM price_history
                 WHERE product_id IN (SELECT id FROM products WHERE model_code LIKE 'R4U3-%')
                """);
        jdbcTemplate.update("""
                DELETE FROM product_estimate_exposure
                 WHERE product_id IN (SELECT id FROM products WHERE model_code LIKE 'R4U3-%')
                """);
        jdbcTemplate.update("DELETE FROM products WHERE model_code LIKE 'R4U3-%'");
    }

    private void runInTransaction(SqlWork work) {
        try (java.sql.Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                work.run(connection);
                connection.commit();
            } catch (Exception failure) {
                connection.rollback();
                throw new IllegalStateException("cleanup 실패", failure);
            }
        } catch (java.sql.SQLException e) {
            throw new IllegalStateException("cleanup 연결 실패", e);
        }
    }

    private void execute(java.sql.Connection connection, String sql, String param) throws java.sql.SQLException {
        try (java.sql.PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, param);
            statement.executeUpdate();
        }
    }

    @FunctionalInterface
    private interface SqlWork {
        void run(java.sql.Connection connection) throws Exception;
    }

    /** 홈멀티 시트 헤더 + data row — {@link ProductSheetSyncServiceIT} 와 동일 포맷. */
    @SafeVarargs
    private static List<List<Object>> homeMultiRows(List<Object>... dataRows) {
        java.util.List<java.util.List<Object>> all = new java.util.ArrayList<>();
        all.add(List.of("품 명", "모델명", "비고", "출고가", "비고", "납품가"));
        for (List<Object> r : dataRows) all.add(r);
        return all;
    }

    private static List<Object> row(Object... vals) {
        return List.of(vals);
    }
}
