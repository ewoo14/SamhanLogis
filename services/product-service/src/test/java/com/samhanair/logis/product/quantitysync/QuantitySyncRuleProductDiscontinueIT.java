package com.samhanair.logis.product.quantitysync;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.product.ProductServiceApplication;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.QuantitySyncConflictPolicy;
import com.samhanair.logis.product.domain.QuantitySyncEstimateCategory;
import com.samhanair.logis.product.domain.QuantitySyncInactiveBehavior;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.it.AbstractPostgresIT;
import com.samhanair.logis.product.service.ProductService;
import com.samhanair.logis.product.service.QuantitySyncRuleService;
import com.samhanair.logis.product.quantitysync.QuantitySyncRuleValidator.Draft;
import com.samhanair.logis.product.web.dto.QuantitySyncRuleRequest;
import com.samhanair.logis.product.web.dto.UpdateProductRequest;
import com.samhanair.logis.product.web.dto.UpdateProductUsageRequest;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * R1 결함 2(a) [MED] · 결함 3 [MED] — 품목 단종/삭제가 수량 동기화 규칙 때문에 막힐 때
 * 사용자가 원인을 알 수 있는지(J-4), 그리고 비활성 규칙은 그 강제력이 없는지(J-3)를
 * 실 {@link ProductService} + 실 {@link QuantitySyncRuleService} + 실 Postgres로 검증한다.
 *
 * <p>fail-closed 자체(활성 규칙이 참조하면 막는다)는 결함이 아니었다 — 원인이 "동시 편집
 * 충돌 또는 제약 위반"으로 위장되는 것과, 비활성 규칙까지 강제력을 갖는 것이 결함이었다.
 */
@SpringBootTest(classes = ProductServiceApplication.class)
class QuantitySyncRuleProductDiscontinueIT extends AbstractPostgresIT {

    private static final String CREATED_BY = "896-S2-DISCONTINUE";
    private static final String LEGACY_REF = "896-disc";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private DataSource dataSource;

    @Autowired
    private ProductService productService;

    @Autowired
    private QuantitySyncRuleService quantitySyncRuleService;

    @SpyBean
    private QuantitySyncRuleValidator quantitySyncRuleValidator;

    @BeforeEach
    void setUp() {
        cleanup();
    }

    @AfterEach
    void tearDown() {
        cleanup();
    }

    @Test
    void 활성_규칙이_참조하면_단종이_거부되고_원인이_드러난다() throws Exception {
        UUID sourceId = product("DISC-SRC-A");
        product("DISC-TGT-B");
        quantitySyncRuleService.create(request("DISC_RULE_A", true, "DISC-SRC-A", "DISC-TGT-B"), "qa-disc");

        assertThatThrownBy(() -> productService.discontinue(sourceId))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("수량 동기화")
                .hasMessageContaining("DISC_RULE_A");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT status FROM products WHERE id = ?", String.class, sourceId))
                .isEqualTo("ACTIVE");
    }

    @Test
    void 활성_규칙이_참조하면_삭제도_거부되고_원인이_드러난다() throws Exception {
        UUID sourceId = product("DISC-SRC-C");
        product("DISC-TGT-D");
        quantitySyncRuleService.create(request("DISC_RULE_C", true, "DISC-SRC-C", "DISC-TGT-D"), "qa-disc");

        assertThatThrownBy(() -> productService.delete(sourceId, "qa-disc"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("수량 동기화")
                .hasMessageContaining("DISC_RULE_C");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT is_deleted FROM products WHERE id = ?", Boolean.class, sourceId))
                .isFalse();
    }

    @Test
    void 비활성_규칙만_참조하면_단종이_허용된다() throws Exception {
        UUID sourceId = product("DISC-SRC-E");
        product("DISC-TGT-F");
        quantitySyncRuleService.create(request("DISC_RULE_E", false, "DISC-SRC-E", "DISC-TGT-F"), "qa-disc");

        productService.discontinue(sourceId);

        assertThat(jdbcTemplate.queryForObject(
                "SELECT status FROM products WHERE id = ?", String.class, sourceId))
                .isEqualTo("DISCONTINUED");
    }

    @Test
    void 수량_동기화_규칙과_무관한_품목은_평소대로_단종된다() {
        UUID unrelated = product("DISC-UNRELATED");

        productService.discontinue(unrelated);

        assertThat(jdbcTemplate.queryForObject(
                "SELECT status FROM products WHERE id = ?", String.class, unrelated))
                .isEqualTo("DISCONTINUED");
    }

    // ---- 재수렴 결함 3 [MED] — discontinue/delete만 덮이고 update()/노출구분 변경 경로는
    // 빠져 있었다. PATCH usageScope=NONE(update())과 수동 override(updateUsageAndReturn())
    // 양쪽 모두 같은 가드를 타야 한다(M-5). ----

    @Test
    void 활성_규칙이_참조하면_PATCH로_노출구분을_NONE으로_바꿀_수_없고_원인이_드러난다() throws Exception {
        UUID targetId = product("DISC-USAGE-SRC-A");
        product("DISC-USAGE-TGT-B");
        quantitySyncRuleService.create(request("DISC_RULE_USAGE_A", true, "DISC-USAGE-SRC-A", "DISC-USAGE-TGT-B"),
                "qa-disc");
        UpdateProductRequest usageNone = new UpdateProductRequest(
                null, null, null, null, null, null, null, null, null, null,
                null, null, null, UsageScope.NONE, null, null);

        assertThatThrownBy(() -> productService.update(targetId, usageNone))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("수량 동기화")
                .hasMessageContaining("DISC_RULE_USAGE_A");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT usage_scope FROM products WHERE id = ?", String.class, targetId))
                .isEqualTo("BOTH");
    }

    @Test
    void 활성_규칙이_참조하면_수동_노출override로도_NONE으로_바꿀_수_없고_원인이_드러난다() throws Exception {
        product("DISC-USAGE-SRC-C");
        product("DISC-USAGE-TGT-D");
        quantitySyncRuleService.create(request("DISC_RULE_USAGE_C", true, "DISC-USAGE-TGT-D", "DISC-USAGE-SRC-C"),
                "qa-disc");
        UpdateProductUsageRequest override = new UpdateProductUsageRequest(UsageScope.NONE, null);

        assertThatThrownBy(() -> productService.updateUsageAndReturn("DISC-USAGE-SRC-C", override))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("수량 동기화")
                .hasMessageContaining("DISC_RULE_USAGE_C");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT usage_scope FROM products WHERE model_code = ?", String.class, "DISC-USAGE-SRC-C"))
                .isEqualTo("BOTH");
    }

    @Test
    void 노출구분_변경_거부와_단종_거부는_같은_품목_같은_원인이면_같은_메시지를_낸다() throws Exception {
        // 결함 3 재발 방지 lock — item 11(PATCH usageScope=NONE)과 item 12(discontinue)가
        // 같은 품목·같은 원인인데 다른 메시지를 냈다(update()에는 가드가 없어 DB 층 제약
        // 위반의 범용 409로, discontinue()는 서비스 층의 친절한 메시지로). 두 경로가 같은
        // 공용 helper를 타면 문자열이 완전히 같아야 한다.
        UUID targetId = product("DISC-USAGE-SRC-E");
        product("DISC-USAGE-TGT-F");
        quantitySyncRuleService.create(request("DISC_RULE_USAGE_E", true, "DISC-USAGE-SRC-E", "DISC-USAGE-TGT-F"),
                "qa-disc");
        UpdateProductRequest usageNone = new UpdateProductRequest(
                null, null, null, null, null, null, null, null, null, null,
                null, null, null, UsageScope.NONE, null, null);

        String usageChangeMessage = catchMessage(() -> productService.update(targetId, usageNone));
        String discontinueMessage = catchMessage(() -> productService.discontinue(targetId));

        assertThat(usageChangeMessage).isEqualTo(discontinueMessage);
    }

    // ---- 재수렴 후속 라운드(범위 축소 후) 결함 4 [HIGH] — 노출 카테고리(estimateCategories)
    // 변경이 형제 필드(usageScope=NONE)와 달리 무방비였다(전제조건 없음, DB 강제층 제거로
    // 조용히 통과). usage override PATCH · products PATCH 두 진입점 모두 같은 가드를
    // 타야 한다(U-2, 형제 필드 비대칭 해소). ----

    @Test
    void 활성_규칙이_참조하면_수동_노출override로_estimateCategories를_바꿀_수_없고_원인이_드러난다() throws Exception {
        UUID targetId = product("DISC-EXPOSURE-SRC-A");
        product("DISC-EXPOSURE-TGT-B");
        quantitySyncRuleService.create(
                request("DISC_RULE_EXPOSURE_A", true, "DISC-EXPOSURE-SRC-A", "DISC-EXPOSURE-TGT-B"), "qa-disc");
        UpdateProductUsageRequest changeCategory =
                new UpdateProductUsageRequest(UsageScope.BOTH, List.of(EstimateCategory.SINGLE_SET));

        assertThatThrownBy(() -> productService.updateUsageAndReturn("DISC-EXPOSURE-SRC-A", changeCategory))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("수량 동기화")
                .hasMessageContaining("DISC_RULE_EXPOSURE_A");
        assertThat(jdbcTemplate.queryForObject("""
                SELECT count(*) FROM product_estimate_exposure
                 WHERE product_id = ? AND estimate_category = 'HOME_MULTI' AND is_deleted = false
                """, Integer.class, targetId)).isEqualTo(1);
    }

    @Test
    void 활성_규칙이_참조해도_수동_노출override의_동일_카테고리_저장은_허용된다() throws Exception {
        UUID sourceId = product("DISC-EXPOSURE-NOOP-A");
        product("DISC-EXPOSURE-NOOP-B");
        quantitySyncRuleService.create(
                request("DISC_RULE_EXPOSURE_NOOP_A", true, "DISC-EXPOSURE-NOOP-A", "DISC-EXPOSURE-NOOP-B"), "qa-disc");

        productService.updateUsageAndReturn(
                "DISC-EXPOSURE-NOOP-A",
                new UpdateProductUsageRequest(UsageScope.BOTH, List.of(EstimateCategory.HOME_MULTI)));

        assertThat(jdbcTemplate.queryForObject("""
                SELECT count(*) FROM product_estimate_exposure
                 WHERE product_id = ? AND estimate_category = 'HOME_MULTI' AND is_deleted = false
                """, Integer.class, sourceId)).isEqualTo(1);
    }

    @Test
    void 활성_규칙이_참조해도_수동_노출override의_기존_카테고리_추가는_허용된다() throws Exception {
        UUID sourceId = product("DISC-EXPOSURE-ADD-A");
        product("DISC-EXPOSURE-ADD-B");
        quantitySyncRuleService.create(
                request("DISC_RULE_EXPOSURE_ADD_A", true, "DISC-EXPOSURE-ADD-A", "DISC-EXPOSURE-ADD-B"), "qa-disc");

        productService.updateUsageAndReturn(
                "DISC-EXPOSURE-ADD-A",
                new UpdateProductUsageRequest(
                        UsageScope.BOTH,
                        List.of(EstimateCategory.HOME_MULTI, EstimateCategory.SINGLE_SET)));

        assertThat(jdbcTemplate.queryForObject("""
                SELECT count(*) FROM product_estimate_exposure
                 WHERE product_id = ? AND is_deleted = false
                """, Integer.class, sourceId)).isEqualTo(2);
    }

    @Test
    void 활성_규칙이_참조하면_PATCH로_estimateCategories를_바꿀_수_없고_원인이_드러난다() throws Exception {
        UUID targetId = product("DISC-EXPOSURE-SRC-C");
        product("DISC-EXPOSURE-TGT-D");
        quantitySyncRuleService.create(
                request("DISC_RULE_EXPOSURE_C", true, "DISC-EXPOSURE-SRC-C", "DISC-EXPOSURE-TGT-D"), "qa-disc");
        UpdateProductRequest changeCategory = new UpdateProductRequest(
                null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, List.of(EstimateCategory.SINGLE_SET), null);

        assertThatThrownBy(() -> productService.update(targetId, changeCategory))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("수량 동기화")
                .hasMessageContaining("DISC_RULE_EXPOSURE_C");
        assertThat(jdbcTemplate.queryForObject("""
                SELECT count(*) FROM product_estimate_exposure
                 WHERE product_id = ? AND estimate_category = 'HOME_MULTI' AND is_deleted = false
                """, Integer.class, targetId)).isEqualTo(1);
    }

    @Test
    void 활성_규칙이_참조해도_PATCH의_동일_카테고리_저장은_허용된다() throws Exception {
        UUID sourceId = product("DISC-EXPOSURE-PATCH-NOOP-A");
        product("DISC-EXPOSURE-PATCH-NOOP-B");
        quantitySyncRuleService.create(
                request("DISC_RULE_EXPOSURE_PATCH_NOOP", true,
                        "DISC-EXPOSURE-PATCH-NOOP-A", "DISC-EXPOSURE-PATCH-NOOP-B"), "qa-disc");
        UpdateProductRequest sameCategories = new UpdateProductRequest(
                null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, List.of(EstimateCategory.HOME_MULTI), null);

        productService.update(sourceId, sameCategories);

        assertThat(jdbcTemplate.queryForObject("""
                SELECT count(*) FROM product_estimate_exposure
                 WHERE product_id = ? AND estimate_category = 'HOME_MULTI' AND is_deleted = false
                """, Integer.class, sourceId)).isEqualTo(1);
    }

    @Test
    void 활성_규칙이_참조해도_PATCH의_기존_카테고리_추가는_허용된다() throws Exception {
        UUID sourceId = product("DISC-EXPOSURE-PATCH-ADD-A");
        product("DISC-EXPOSURE-PATCH-ADD-B");
        quantitySyncRuleService.create(
                request("DISC_RULE_EXPOSURE_PATCH_ADD", true,
                        "DISC-EXPOSURE-PATCH-ADD-A", "DISC-EXPOSURE-PATCH-ADD-B"), "qa-disc");
        UpdateProductRequest addCategory = new UpdateProductRequest(
                null, null, null, null, null, null, null, null, null, null,
                null, null, null, null,
                List.of(EstimateCategory.HOME_MULTI, EstimateCategory.SINGLE_SET), null);

        productService.update(sourceId, addCategory);

        assertThat(jdbcTemplate.queryForObject("""
                SELECT count(*) FROM product_estimate_exposure
                 WHERE product_id = ? AND is_deleted = false
                """, Integer.class, sourceId)).isEqualTo(2);
    }

    @Test
    void 동시_반대_규칙_생성도_활성_그래프에_순환을_남기지_않는다() throws Exception {
        product("DISC-RACE-A");
        product("DISC-RACE-B");

        CountDownLatch firstValidated = new CountDownLatch(1);
        CountDownLatch secondValidated = new CountDownLatch(1);
        CountDownLatch releaseFirst = new CountDownLatch(1);
        AtomicBoolean first = new AtomicBoolean();
        doAnswer(invocation -> {
            if (first.compareAndSet(false, true)) {
                firstValidated.countDown();
                releaseFirst.await(2, TimeUnit.SECONDS);
            } else {
                secondValidated.countDown();
            }
            return invocation.callRealMethod();
        }).when(quantitySyncRuleValidator).validate(any(Draft.class));

        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<?> requestA = executor.submit(() -> quantitySyncRuleService.create(
                    request("DISC_RULE_RACE_A", true, "DISC-RACE-A", "DISC-RACE-B"), "qa-disc"));
            assertThat(firstValidated.await(2, TimeUnit.SECONDS)).isTrue();
            Future<?> requestB = executor.submit(() -> quantitySyncRuleService.create(
                    request("DISC_RULE_RACE_B", true, "DISC-RACE-B", "DISC-RACE-A"), "qa-disc"));
            // 수정 전에는 두 요청이 모두 validator까지 진입한다. 수정 후에는 두 번째가
            // graph advisory lock에서 기다리므로 timeout 뒤 첫 번째를 계속 진행시킨다.
            secondValidated.await(1, TimeUnit.SECONDS);
            releaseFirst.countDown();
            awaitCompletion(requestA);
            awaitCompletion(requestB);
        } finally {
            releaseFirst.countDown();
            executor.shutdownNow();
        }

        Integer cycleCount = jdbcTemplate.queryForObject("""
                SELECT count(*)
                  FROM quantity_sync_rule a
                  JOIN quantity_sync_source a_source ON a_source.rule_id = a.id
                       AND a_source.is_deleted = false
                  JOIN quantity_sync_target a_target ON a_target.rule_id = a.id
                       AND a_target.is_deleted = false
                  JOIN quantity_sync_rule b ON b.is_deleted = false AND b.enabled = true
                  JOIN quantity_sync_source b_source ON b_source.rule_id = b.id
                       AND b_source.is_deleted = false
                  JOIN quantity_sync_target b_target ON b_target.rule_id = b.id
                       AND b_target.is_deleted = false
                 WHERE a.is_deleted = false AND a.enabled = true
                   AND a.rule_key = 'DISC_RULE_RACE_A'
                   AND b.rule_key = 'DISC_RULE_RACE_B'
                   AND a_source.source_product_id = b_target.target_product_id
                   AND a_target.target_product_id = b_source.source_product_id
                """, Integer.class);
        assertThat(cycleCount).isZero();
    }

    private void awaitCompletion(Future<?> future) throws Exception {
        try {
            future.get(5, TimeUnit.SECONDS);
        } catch (ExecutionException expected) {
            // 동시 생성에서 두 번째 요청이 Java cycle 검증으로 거부되는 것은 정상이다.
        }
    }

    @Test
    void 비활성_규칙만_참조하면_estimateCategories_변경이_허용된다() throws Exception {
        UUID targetId = product("DISC-EXPOSURE-SRC-E");
        product("DISC-EXPOSURE-TGT-F");
        quantitySyncRuleService.create(
                request("DISC_RULE_EXPOSURE_E", false, "DISC-EXPOSURE-SRC-E", "DISC-EXPOSURE-TGT-F"), "qa-disc");
        UpdateProductRequest changeCategory = new UpdateProductRequest(
                null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, List.of(EstimateCategory.SINGLE_SET), null);

        productService.update(targetId, changeCategory);

        assertThat(jdbcTemplate.queryForObject("""
                SELECT count(*) FROM product_estimate_exposure
                 WHERE product_id = ? AND estimate_category = 'SINGLE_SET' AND is_deleted = false
                """, Integer.class, targetId)).isEqualTo(1);
    }

    @Test
    void 수량_동기화_규칙과_무관한_품목은_estimateCategories를_평소대로_바꿀_수_있다() {
        UUID unrelated = product("DISC-EXPOSURE-UNRELATED");
        UpdateProductRequest changeCategory = new UpdateProductRequest(
                null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, List.of(EstimateCategory.SINGLE_SET), null);

        productService.update(unrelated, changeCategory);

        assertThat(jdbcTemplate.queryForObject("""
                SELECT count(*) FROM product_estimate_exposure
                 WHERE product_id = ? AND estimate_category = 'SINGLE_SET' AND is_deleted = false
                """, Integer.class, unrelated)).isEqualTo(1);
    }

    @Test
    void 노출카테고리_변경_거부와_단종_거부는_같은_품목_같은_원인이면_같은_메시지를_낸다() throws Exception {
        // 결함 4 재발 방지 lock — usageScope=NONE 거부와 estimateCategories 변경 거부가
        // 같은 품목·같은 원인이면 같은 문자열을 내야 한다(형제 필드 비대칭 해소, U-2).
        UUID targetId = product("DISC-EXPOSURE-SRC-G");
        product("DISC-EXPOSURE-TGT-H");
        quantitySyncRuleService.create(
                request("DISC_RULE_EXPOSURE_G", true, "DISC-EXPOSURE-SRC-G", "DISC-EXPOSURE-TGT-H"), "qa-disc");
        UpdateProductRequest changeCategory = new UpdateProductRequest(
                null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, List.of(EstimateCategory.SINGLE_SET), null);

        String exposureChangeMessage = catchMessage(() -> productService.update(targetId, changeCategory));
        String discontinueMessage = catchMessage(() -> productService.discontinue(targetId));

        assertThat(exposureChangeMessage).isEqualTo(discontinueMessage);
    }

    private String catchMessage(Runnable action) {
        try {
            action.run();
            throw new AssertionError("예외가 발생해야 한다");
        } catch (BusinessException ex) {
            return ex.getMessage();
        }
    }

    private QuantitySyncRuleRequest request(String ruleKey, boolean enabled,
                                            String sourceCode, String targetCode) throws Exception {
        classifyQuantitySyncTarget(targetCode);
        JsonNode condition = MAPPER.readTree("{}");
        return new QuantitySyncRuleRequest(ruleKey, QuantitySyncEstimateCategory.HOME_MULTI,
                ruleKey + " 이름", enabled, "SUM", condition, QuantitySyncInactiveBehavior.ZERO,
                QuantitySyncConflictPolicy.ADD, 10, LEGACY_REF,
                java.util.List.of(new QuantitySyncRuleRequest.SourceRequest(sourceCode, new BigDecimal("1"))),
                java.util.List.of(new QuantitySyncRuleRequest.TargetRequest(
                        targetCode, new BigDecimal("1"), "NONE", 1)));
    }

    private UUID product(String code) {
        UUID id = UUID.randomUUID();
        UUID categoryId = jdbcTemplate.queryForObject("SELECT id FROM categories ORDER BY id LIMIT 1", UUID.class);
        jdbcTemplate.update("""
                INSERT INTO products (
                    id, name, model_name, category_id, selling_price, purchase_price,
                    created_at, created_by, is_deleted, status, model_code, product_type,
                    usage_scope)
                VALUES (?, ?, ?, ?, 0, 0, now(), ?, false, 'ACTIVE', ?, 'SINGLE', 'BOTH')
                """, id, code + " 품목", code, categoryId, CREATED_BY, code);
        // 재수렴 결함 1 [최우선] S-2 fix — products.estimate_category(V18 이후 죽은 컬럼)
        // 대신 product_estimate_exposure에 노출 행을 심는다 — quantity_sync 검증이 읽는
        // 카테고리 컬럼만 실 API와 같다(행 전체 동일 아님 — modified_at/modified_by는
        // NULL로 남아 실 API 결과와 다르다, 2026-07-28 R4 정정, QuantitySyncRuleDbProbeIT
        // 참조).
        jdbcTemplate.update("""
                INSERT INTO product_estimate_exposure (
                    id, product_id, estimate_category, display_order,
                    created_at, created_by, is_deleted)
                VALUES (?, ?, 'HOME_MULTI', 1, now(), ?, false)
                """, UUID.randomUUID(), id, CREATED_BY);
        return id;
    }

    private void cleanup() {
        // source/target/rule 하드 삭제를 별도 auto-commit 문으로 나누면 그 사이 순간에
        // deferred constraint trigger가 "rule must have active source and target rows"로
        // 오탐한다 — 세 DELETE를 한 transaction으로 묶는다(QuantitySyncRuleCrudIT와 동일 원인).
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
        // product_estimate_exposure가 products FK를 참조하므로 products보다 먼저 지운다.
        // 결함 4 RED 재현 fixture 추가로 인한 정정 — estimateCategories 변경이 (가드가 없던
        // 시절) 실제로 성공하면 syncEstimateExposures()가 새로 심는 노출 행은 JpaAuditingConfig
        // AuditorAware가 채우는 created_by("system")를 갖고 이 파일의 CREATED_BY와 다르다.
        // created_by 스코프만으로는 그 행이 지워지지 않아 이어지는 products DELETE가
        // FK 위반으로 실패했다(다른 quantitysync IT처럼 product 소유 기준으로 지운다).
        jdbcTemplate.update("""
                DELETE FROM product_estimate_exposure
                 WHERE product_id IN (SELECT id FROM products WHERE created_by = ?)
                """, CREATED_BY);
        jdbcTemplate.update("DELETE FROM products WHERE created_by = ?", CREATED_BY);
    }

    private void runInTransaction(SqlWork work) {
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                work.run(connection);
                connection.commit();
            } catch (Exception failure) {
                connection.rollback();
                throw new IllegalStateException("cleanup 실패", failure);
            }
        } catch (SQLException e) {
            throw new IllegalStateException("cleanup 연결 실패", e);
        }
    }

    private void execute(Connection connection, String sql, String param) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, param);
            statement.executeUpdate();
        }
    }

    @FunctionalInterface
    private interface SqlWork {
        void run(Connection connection) throws Exception;
    }
}
