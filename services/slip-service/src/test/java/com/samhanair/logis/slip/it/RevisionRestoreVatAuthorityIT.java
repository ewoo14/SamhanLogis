package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.lenient;

import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.estimate.service.EstimateService;
import com.samhanair.logis.slip.estimate.web.dto.CreateEstimateRequest;
import com.samhanair.logis.slip.estimate.web.dto.UpdateEstimateRequest;
import com.samhanair.logis.slip.service.SlipService;
import com.samhanair.logis.slip.web.dto.CreateSlipRequest;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * #822 — 버전이력 복원의 VAT 포함 단가 권위값 보존 실 DB 회귀 테스트 (#809 R6 라이브 QA 16b).
 *
 * <p>결함: {@code EstimateSnapshot.Line} 에 {@code unitPriceWithVat} 필드가 없어 견적 revision
 * 복원이 라인을 공급 semantics 로 재생성 → {@code unit_price_with_vat} 전량 NULL 화 →
 * R5-H6 provenance 규칙(null=legacy)에 따라 편집 폼이 공급단가를 "단가(VAT포함)"로 오표시
 * (폼 총합 ≠ DB 총합). 전표({@code SlipSnapshot})는 필드를 보유하나 복원이 재계산 경로라
 * 비 11배수 단가에서 vat/withVat 반올림 드리프트가 있었다(계열 sweep).
 *
 * <p>검증 시나리오 (Testcontainers 실 PostgreSQL + Flyway 실 스키마 + JSONB 실 왕복):
 * <ol>
 *   <li>견적: VAT 포함 87,999(비 11배수) × 3 저장 → EDIT → rev1 복원 시
 *       {@code unit_price_with_vat} 권위값 불변 + 합계 무드리프트 + RESTORE 재캡처 JSONB 에도
 *       권위값 보존.</li>
 *   <li>견적 하위호환: {@code unitPriceWithVat} 키가 없는 구 형상 JSONB revision 복원 시 종전
 *       공급 semantics 재계산 유지 (withVat NULL — 오염 없이 legacy 그대로).</li>
 *   <li>전표: VAT 포함 87,999 × 3 저장 → rev1 복원 시 vat/withVat 캡처 권위값 그대로
 *       (재계산 드리프트 23,999.70/87,998.90 재발 방지).</li>
 * </ol>
 *
 * <p>외부 client 는 전부 {@code @MockBean} + lenient stub (PR #17 회고 — 누락 시 Eureka 비활성 500).
 */
@SpringBootTest(classes = SlipServiceApplication.class)
class RevisionRestoreVatAuthorityIT extends AbstractPostgresIT {

    @Autowired
    private EstimateService estimateService;

    @Autowired
    private SlipService slipService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @MockBean
    private ProductClient productClient;

    @MockBean
    private InventoryClient inventoryClient;

    @MockBean
    private PartnerInternalClient partnerInternalClient;

    @MockBean
    private UserInternalClient userInternalClient;

    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void setUpExternalClientStubs() {
        lenient().when(productClient.lookup(anyList())).thenAnswer(inv -> {
            List<UUID> productIds = inv.getArgument(0);
            return productIds.stream().map(this::product).toList();
        });
        lenient().when(productClient.requireExists(any(UUID.class)))
                .thenAnswer(inv -> product(inv.getArgument(0)));
        lenient().when(partnerInternalClient.resolveBusinessNumber(any(UUID.class)))
                .thenReturn(Optional.empty());
        lenient().when(partnerInternalClient.resolvePartnerCode(any(UUID.class)))
                .thenReturn(Optional.empty());
        lenient().when(userInternalClient.resolveFullName(any(UUID.class)))
                .thenReturn(Optional.of("테스트 담당자"));
        lenient().when(warehouseInternalClient.findWarehouseName(any(UUID.class)))
                .thenReturn(Optional.of("테스트 창고"));
    }

    /**
     * [16b 회귀] 견적: VAT 포함 단가 저장 → revision 생성(EDIT) → rev1 복원 →
     * {@code unit_price_with_vat} 권위값 불변 (11의 배수가 아닌 단가로 드리프트 노출).
     */
    @Test
    void estimateRestore_preservesVatInclusiveUnitPriceAuthority() {
        UUID partnerId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        var created = estimateService.create(
                new CreateEstimateRequest(
                        LocalDate.of(2026, 7, 16), partnerId, "권위값 거래처", null, null,
                        LocalDate.of(2026, 8, 15), "16b 회귀",
                        List.of(new CreateEstimateRequest.EstimateLineRequest(
                                productId, "컴프레서", "CP-9", "380V",
                                3, new BigDecimal("87999"), "VAT포함 라인", null, true))),
                "actor-822-estimate", "권위값 작성자");
        try {
            // rev1(CREATE) 시점 DB 권위값 sanity — 87,999 × 3 = 263,997 → 공급 239,997 / 부가세 24,000
            LineAmounts atCreate = activeEstimateLineAmounts(created.id());
            assertThat(atCreate.unitPriceWithVat()).isEqualByComparingTo("87999.00");
            assertThat(atCreate.supplyAmount()).isEqualByComparingTo("239997");
            assertThat(atCreate.vatAmount()).isEqualByComparingTo("24000");
            assertThat(atCreate.lineTotal()).isEqualByComparingTo("263997");

            // EDIT(rev2) — 공급 단가 라인으로 전량 교체 (with_vat NULL 상태로 변경)
            estimateService.update(
                    created.id(),
                    new UpdateEstimateRequest(partnerId, "권위값 거래처", null, null,
                            LocalDate.of(2026, 8, 15), "수정 후",
                            List.of(new UpdateEstimateRequest.EstimateLineUpdate(
                                    UUID.randomUUID(), "교체품목", "RP-1", null,
                                    1, new BigDecimal("50000.00"), null, null, false, null)), true),
                    "actor-822-estimate", "수정자");
            assertThat(activeEstimateLineAmounts(created.id()).unitPriceWithVat()).isNull();

            // rev1 복원 → 권위값 불변 복원 (결함: 전량 NULL 화 + 재계산 드리프트)
            var restored = estimateService.restoreToRevision(
                    created.id(), 1, "actor-822-estimate", "복원자");

            LineAmounts afterRestore = activeEstimateLineAmounts(created.id());
            assertThat(afterRestore.unitPriceWithVat()).isEqualByComparingTo("87999.00");
            assertThat(afterRestore.unitPrice()).isEqualByComparingTo("79999.00");
            assertThat(afterRestore.supplyAmount()).isEqualByComparingTo("239997");
            assertThat(afterRestore.vatAmount()).isEqualByComparingTo("24000");
            assertThat(afterRestore.lineTotal()).isEqualByComparingTo("263997");

            // 헤더 합계 재계산도 권위값 기준 (편집 폼 총합 ≠ DB 총합 불일치의 근원 차단)
            var totals = jdbcTemplate.queryForMap(
                    "SELECT total_supply, total_vat, total_amount FROM estimates WHERE id = ?",
                    created.id());
            assertThat((BigDecimal) totals.get("total_supply")).isEqualByComparingTo("239997");
            assertThat((BigDecimal) totals.get("total_vat")).isEqualByComparingTo("24000");
            assertThat((BigDecimal) totals.get("total_amount")).isEqualByComparingTo("263997");

            // FE 편집 폼이 소비하는 상세 응답에도 권위값 노출 (16b 증상 지점)
            assertThat(restored.lines()).hasSize(1);
            assertThat(restored.lines().get(0).unitPriceWithVat())
                    .isEqualByComparingTo("87999.00");

            // 복원 자체의 RESTORE 재캡처 JSONB 에도 권위값이 실려야 한다 (재복원 무손실)
            String recaptured = jdbcTemplate.queryForObject("""
                    SELECT snapshot->'lines'->0->>'unitPriceWithVat'
                      FROM estimate_revisions
                     WHERE estimate_id = ? AND revision_type = 'RESTORE'
                     ORDER BY revision_no DESC
                     LIMIT 1
                    """, String.class, created.id());
            assertThat(recaptured).isNotNull();
            assertThat(new BigDecimal(recaptured)).isEqualByComparingTo("87999.00");
        } finally {
            cleanupEstimate(created.id());
            cleanupPriceMemory(partnerId);
        }
    }

    /**
     * [하위호환] 견적: {@code unitPriceWithVat} 키가 없는 #822 이전 구 형상 JSONB revision 복원 시
     * 종전 공급 semantics 재계산이 유지된다 (withVat NULL — 실 JSONB 역직렬화 경로 검증).
     */
    @Test
    void estimateRestore_legacySnapshotWithoutVatField_keepsSupplyRecalculation() {
        UUID partnerId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        UUID legacyProductId = UUID.randomUUID();
        var created = estimateService.create(
                new CreateEstimateRequest(
                        LocalDate.of(2026, 7, 16), partnerId, "레거시 거래처", null, null,
                        LocalDate.of(2026, 8, 15), "레거시 하위호환",
                        List.of(new CreateEstimateRequest.EstimateLineRequest(
                                productId, "현행품목", "NOW-1", null,
                                2, new BigDecimal("15000.00"), null, null, false))),
                "actor-822-legacy", "레거시 작성자");
        try {
            String estimateNo = jdbcTemplate.queryForObject(
                    "SELECT estimate_no FROM estimates WHERE id = ?", String.class, created.id());
            LocalDate estimateDate = jdbcTemplate.queryForObject(
                    "SELECT estimate_date FROM estimates WHERE id = ?", LocalDate.class, created.id());

            // #822 이전 형상 JSONB — unitPriceWithVat/setHead/parentSetModel 키 자체가 없다
            String legacySnapshotJson = """
                    {
                      "estimateNo": "%s",
                      "estimateDate": "%s",
                      "partnerId": "%s",
                      "partnerName": "레거시 거래처",
                      "memo": "레거시 스냅샷",
                      "lines": [{
                        "productId": "%s",
                        "productName": "레거시 품목",
                        "modelName": "LEG-1",
                        "quantity": 4,
                        "unitPrice": 12345.00,
                        "supplyAmount": 49380.00,
                        "vatAmount": 4938.00,
                        "lineTotal": 54318.00,
                        "note": "레거시 라인"
                      }]
                    }
                    """.formatted(estimateNo, estimateDate, partnerId, legacyProductId);
            jdbcTemplate.update("""
                    INSERT INTO estimate_revisions
                        (id, estimate_id, revision_no, revision_type, source_revision_no,
                         estimate_no, estimate_date, snapshot, actor_id, actor_name, actor_color,
                         created_at, created_by, is_deleted)
                    VALUES (?, ?, 2, 'EDIT', NULL, ?, ?, ?::jsonb, NULL, '레거시', NULL,
                            CURRENT_TIMESTAMP, 'test', FALSE)
                    """, UUID.randomUUID(), created.id(), estimateNo, estimateDate,
                    legacySnapshotJson);

            estimateService.restoreToRevision(created.id(), 2, "actor-822-legacy", "복원자");

            LineAmounts restored = activeEstimateLineAmounts(created.id());
            assertThat(restored.unitPriceWithVat()).isNull();
            assertThat(restored.unitPrice()).isEqualByComparingTo("12345.00");
            assertThat(restored.supplyAmount()).isEqualByComparingTo("49380.00");
            assertThat(restored.vatAmount()).isEqualByComparingTo("4938.00");
            assertThat(restored.lineTotal()).isEqualByComparingTo("54318.00");
        } finally {
            cleanupEstimate(created.id());
            cleanupPriceMemory(partnerId);
        }
    }

    /**
     * [계열 sweep — 전표] VAT 포함 단가 전표의 rev1 복원 시 캡처 권위값이 그대로 승계된다
     * (결함: create 재계산으로 vat 23,999.70 / withVat 87,998.90 드리프트).
     */
    @Test
    void slipRestore_preservesVatInclusiveAuthoritativeAmounts() {
        UUID partnerId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        var created = slipService.create(
                new CreateSlipRequest(
                        SlipType.OUTBOUND, LocalDate.of(2026, 7, 16),
                        UUID.randomUUID(), null, partnerId, "권위값 거래처",
                        DeliveryTag.SALE, "16b 계열 sweep",
                        null, null, null, null, null, null, null, null, null, null,
                        null, null, null, null, null, null, null, null, null, null,
                        List.of(new CreateSlipRequest.SlipLineRequest(
                                productId, "컴프레서", "CP-9", "380V",
                                3, new BigDecimal("87999"), "VAT포함 라인", null, true))),
                UUID.randomUUID().toString(), "권위값 작성자");
        try {
            LineAmounts atCreate = activeSlipLineAmounts(created.id());
            assertThat(atCreate.unitPriceWithVat()).isEqualByComparingTo("87999.00");
            assertThat(atCreate.supplyAmount()).isEqualByComparingTo("239997");
            assertThat(atCreate.vatAmount()).isEqualByComparingTo("24000");
            assertThat(atCreate.lineTotal()).isEqualByComparingTo("239997");

            slipService.restoreToRevision(created.id(), 1,
                    UUID.randomUUID().toString(), "복원자");

            LineAmounts afterRestore = activeSlipLineAmounts(created.id());
            assertThat(afterRestore.unitPriceWithVat()).isEqualByComparingTo("87999.00");
            assertThat(afterRestore.vatAmount()).isEqualByComparingTo("24000");
            assertThat(afterRestore.supplyAmount()).isEqualByComparingTo("239997");
            assertThat(afterRestore.lineTotal()).isEqualByComparingTo("239997");
            assertThat(afterRestore.unitPrice()).isEqualByComparingTo("79999.00");
        } finally {
            cleanupSlip(created.id());
            cleanupPriceMemory(partnerId);
        }
    }

    // =========================================================================
    // 헬퍼
    // =========================================================================

    private record LineAmounts(BigDecimal unitPrice, BigDecimal unitPriceWithVat,
                               BigDecimal supplyAmount, BigDecimal vatAmount,
                               BigDecimal lineTotal) {
    }

    /** 활성 견적 라인 1건의 금액 5필드 (라인 1건 전제 — 초과 시 fail-loud). */
    private LineAmounts activeEstimateLineAmounts(UUID estimateId) {
        return jdbcTemplate.queryForObject("""
                SELECT unit_price, unit_price_with_vat, supply_amount, vat_amount, line_total
                  FROM estimate_lines
                 WHERE estimate_id = ? AND is_deleted = FALSE
                """, (rs, rowNum) -> new LineAmounts(
                rs.getBigDecimal("unit_price"),
                rs.getBigDecimal("unit_price_with_vat"),
                rs.getBigDecimal("supply_amount"),
                rs.getBigDecimal("vat_amount"),
                rs.getBigDecimal("line_total")), estimateId);
    }

    /** 활성 전표 라인 1건의 금액 5필드 (라인 1건 전제 — 초과 시 fail-loud). */
    private LineAmounts activeSlipLineAmounts(UUID slipId) {
        return jdbcTemplate.queryForObject("""
                SELECT unit_price, unit_price_with_vat, supply_amount, vat_amount, line_total
                  FROM slip_lines
                 WHERE slip_id = ? AND is_deleted = FALSE
                """, (rs, rowNum) -> new LineAmounts(
                rs.getBigDecimal("unit_price"),
                rs.getBigDecimal("unit_price_with_vat"),
                rs.getBigDecimal("supply_amount"),
                rs.getBigDecimal("vat_amount"),
                rs.getBigDecimal("line_total")), slipId);
    }

    private ProductSummary product(UUID productId) {
        return new ProductSummary(productId, "테스트 품목", "MODEL-822", "P-822",
                UUID.randomUUID(), new BigDecimal("110000.00"), "ACTIVE", false);
    }

    private void cleanupEstimate(UUID estimateId) {
        jdbcTemplate.update("DELETE FROM estimate_revisions WHERE estimate_id = ?", estimateId);
        jdbcTemplate.update("DELETE FROM estimate_lines WHERE estimate_id = ?", estimateId);
        jdbcTemplate.update("DELETE FROM estimates WHERE id = ?", estimateId);
    }

    private void cleanupSlip(UUID slipId) {
        jdbcTemplate.update("DELETE FROM slip_audit_logs WHERE slip_id = ?", slipId);
        jdbcTemplate.update("DELETE FROM slip_revisions WHERE slip_id = ?", slipId);
        jdbcTemplate.update("DELETE FROM slip_lines WHERE slip_id = ?", slipId);
        jdbcTemplate.update("DELETE FROM slips WHERE id = ?", slipId);
    }

    /** 가격기억 side-effect 정리 — 비동기 저장이라 잔여 row 가 남아도 다른 IT 에 영향 없게 제거. */
    private void cleanupPriceMemory(UUID partnerId) {
        jdbcTemplate.update("DELETE FROM partner_product_price_memory WHERE partner_id = ?",
                partnerId);
    }
}
