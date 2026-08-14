package com.samhanair.logis.slip.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.revision.domain.SlipSnapshot;
import com.samhanair.logis.slip.estimate.web.dto.BundleSetOptions;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * {@link Slip#restoreFromSnapshot(SlipSnapshot)} 도메인 단위 테스트 (권한 재편 Phase 2.1 Task 3).
 *
 * <p>스냅샷 역적용 정확성 검증 — 헤더 필드 복원 + 라인 추가/삭제/수정이 스냅샷 기준으로 정확히
 * 반영되는지 + lockFlag=true 시 CONFLICT 거부.
 */
class SlipRestoreTest {

    private static final UUID SOURCE_WH = UUID.randomUUID();
    private static final UUID PARTNER = UUID.randomUUID();

    @Test
    @DisplayName("협업 이력 스냅샷이 categoryKey를 보존한다")
    void toSnapshot_preservesCategoryKey() throws Exception {
        Slip slip = Slip.createOutbound("2026/05/29-1", LocalDate.of(2026, 5, 29), 1,
                SOURCE_WH, UUID.randomUUID(), PARTNER, "삼한물산",
                DeliveryTag.SALE, "원본", "user-1");
        slip.addLine(SlipLine.create(slip, UUID.randomUUID(), "펌프", "MX-100", "220V",
                2, new BigDecimal("15000.00"), "라인메모", UUID.randomUUID(), "singleSets"));

        String json = new ObjectMapper().findAndRegisterModules().writeValueAsString(slip.toSnapshot());

        assertThat(json).contains("\"categoryKey\":\"singleSets\"");
    }

    @Test
    @DisplayName("협업 이력 복원이 스냅샷의 categoryKey를 전표 라인에 되살린다")
    void restoreFromSnapshot_preservesCategoryKey() {
        Slip slip = Slip.createOutbound("2026/05/29-1", LocalDate.of(2026, 5, 29), 1,
                SOURCE_WH, UUID.randomUUID(), PARTNER, "삼한물산",
                DeliveryTag.SALE, "원본", "user-1");
        slip.addLine(SlipLine.create(slip, UUID.randomUUID(), "펌프", "MX-100", "220V",
                2, new BigDecimal("15000.00"), "라인메모", UUID.randomUUID(), "singleSets"));
        SlipSnapshot snapshot = slip.toSnapshot();

        slip.restoreFromSnapshot(snapshot);

        assertThat(slip.getLines()).singleElement()
                .extracting(SlipLine::getCategoryKey)
                .isEqualTo("singleSets");
    }

    /**
     * 라인 2건 + memo "원본" 을 가진 출고 슬립을 생성한다 (복원 대상 기준 상태).
     */
    private Slip sampleSlip() {
        Slip slip = Slip.createOutbound("2026/05/29-1", LocalDate.of(2026, 5, 29), 1,
                SOURCE_WH, UUID.randomUUID(), PARTNER, "삼한물산",
                DeliveryTag.SALE, "원본", "user-1");
        slip.addLine(SlipLine.create(slip, UUID.randomUUID(), "펌프", "MX-100", "220V",
                2, new BigDecimal("15000.00"), "라인메모"));
        slip.addLine(SlipLine.create(slip, UUID.randomUUID(), "밸브", null, null,
                5, new BigDecimal("3000.00"), null));
        return slip;
    }

    private long activeLineCount(Slip slip) {
        return slip.getLines().stream()
                .filter(line -> !Boolean.TRUE.equals(line.getIsDeleted()))
                .count();
    }

    @Test
    @DisplayName("스냅샷의 헤더 필드를 그대로 역적용한다 (memo/거래처/deliveryTag/입금예정일)")
    void restoresHeaderFields() {
        Slip slip = sampleSlip();
        SlipSnapshot snapshot = new SlipSnapshot(
                "2026/05/29-1", LocalDate.of(2026, 5, 29),
                PARTNER, "복원거래처", "P-9999", "111-22-33333",
                "복원메모", DeliveryTag.REGION.name(),
                "복원배송지", "복원감리지", "복원프로젝트", "010-0000-0000",
                LocalDate.of(2026, 6, 30),
                UUID.randomUUID(), "복원창고",
                // audit overlay 필드 10개 (PR #318 cycle1 P1-1)
                "복원shippingAddress", "복원inspectionAddress", "010-1111-1111",
                "02-222-2222", "복원customerAddress", "복원대표자",
                "복원paymentDueLabel", "복원discountInfo", "복원collectTerm", "복원agreeTerm",
                List.of());

        slip.restoreFromSnapshot(snapshot);

        assertThat(slip.getMemo()).isEqualTo("복원메모");
        assertThat(slip.getPartnerName()).isEqualTo("복원거래처");
        assertThat(slip.getPartnerCode()).isEqualTo("P-9999");
        assertThat(slip.getBusinessNumber()).isEqualTo("111-22-33333");
        assertThat(slip.getDeliveryTag()).isEqualTo(DeliveryTag.REGION);
        assertThat(slip.getDeliveryAddress()).isEqualTo("복원배송지");
        assertThat(slip.getSupervisionAddress()).isEqualTo("복원감리지");
        assertThat(slip.getProjectName()).isEqualTo("복원프로젝트");
        assertThat(slip.getRecipientPhone()).isEqualTo("010-0000-0000");
        assertThat(slip.getPaymentDueDate()).isEqualTo(LocalDate.of(2026, 6, 30));
        assertThat(slip.getDestinationWarehouseName()).isEqualTo("복원창고");
        // audit overlay 필드 10개 역적용 검증
        assertThat(slip.getShippingAddress()).isEqualTo("복원shippingAddress");
        assertThat(slip.getInspectionAddress()).isEqualTo("복원inspectionAddress");
        assertThat(slip.getReceiverPhone()).isEqualTo("010-1111-1111");
        assertThat(slip.getCustomerTel()).isEqualTo("02-222-2222");
        assertThat(slip.getCustomerAddress()).isEqualTo("복원customerAddress");
        assertThat(slip.getCustomerRepresentative()).isEqualTo("복원대표자");
        assertThat(slip.getPaymentDueLabel()).isEqualTo("복원paymentDueLabel");
        assertThat(slip.getDiscountInfo()).isEqualTo("복원discountInfo");
        assertThat(slip.getCollectTerm()).isEqualTo("복원collectTerm");
        assertThat(slip.getAgreeTerm()).isEqualTo("복원agreeTerm");
    }

    @Test
    @DisplayName("toSnapshot ↔ restoreFromSnapshot 대칭: overlay 필드 수정 후 과거 스냅샷 복원 시 원값 롤백")
    void restoreRollsBackOverlayFields() {
        // 원본 슬립의 overlay 필드를 캡처 → 과거 스냅샷 확보
        Slip slip = sampleSlip();
        slip.applyOverlayPatch("shippingAddress", "원본배송지");
        slip.applyOverlayPatch("customerRepresentative", "원본대표자");
        slip.applyOverlayPatch("collectTerm", "월말");
        SlipSnapshot past = slip.toSnapshot();

        // overlay 필드 수정 (사용자가 PATCH /audit/overlay 로 변경한 상황 모사)
        slip.applyOverlayPatch("shippingAddress", "변경배송지");
        slip.applyOverlayPatch("customerRepresentative", "변경대표자");
        slip.applyOverlayPatch("collectTerm", "현금");
        assertThat(slip.getShippingAddress()).isEqualTo("변경배송지");

        // 과거 스냅샷 복원 → overlay 필드가 원값으로 롤백
        slip.restoreFromSnapshot(past);

        assertThat(slip.getShippingAddress()).isEqualTo("원본배송지");
        assertThat(slip.getCustomerRepresentative()).isEqualTo("원본대표자");
        assertThat(slip.getCollectTerm()).isEqualTo("월말");
    }

    @Test
    @DisplayName("[R6-H3] 세트 계보(setHead/parentSetModel)는 toSnapshot→restoreFromSnapshot 왕복에서 보존된다")
    void restorePreservesBundleLineage() {
        Slip slip = sampleSlip();
        slip.getLines().get(0).assignBundleComponent("SET-809", true);
        slip.getLines().get(1).assignBundleComponent("SET-809", false);

        SlipSnapshot snapshot = slip.toSnapshot();
        slip.restoreFromSnapshot(snapshot);

        assertThat(activeLineCount(slip)).isEqualTo(2);
        SlipLine head = slip.getLines().get(0);
        SlipLine component = slip.getLines().get(1);
        assertThat(head.isSetHead()).isTrue();
        assertThat(head.getParentSetModel()).isEqualTo("SET-809");
        assertThat(component.isSetHead()).isFalse();
        assertThat(component.getParentSetModel()).isEqualTo("SET-809");
    }

    @Test
    @DisplayName("R14 RED-A: 교차 배치 legacy BUNDLE 복원은 Slip에서도 signature 소속을 보존한다")
    void restoreCrossedLegacyBundleLinesBySignature() {
        Slip slip = sampleSlip();
        BundleSetOptions optionA = new BundleSetOptions("REMOTE-A", false, null, null, false);
        BundleSetOptions optionB = new BundleSetOptions("REMOTE-B", false, null, null, false);
        SlipSnapshot snapshot = new SlipSnapshot(
                "2026/05/29-1", LocalDate.of(2026, 5, 29), PARTNER, "삼한물산", null, null,
                "교차 복원", null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                List.of(bundleLine(true, "head-A", optionA), bundleLine(true, "head-B", optionB),
                        bundleLine(false, "child-A", optionA), bundleLine(false, "child-B", optionB)));

        slip.restoreFromSnapshot(snapshot);

        assertThat(slip.getLines()).extracting(line -> line.getBundleSetOptions().instanceKey())
                .doesNotContainNull()
                .containsExactly(slip.getLines().get(0).getBundleSetOptions().instanceKey(),
                        slip.getLines().get(1).getBundleSetOptions().instanceKey(),
                        slip.getLines().get(2).getBundleSetOptions().instanceKey(),
                        slip.getLines().get(3).getBundleSetOptions().instanceKey());
        assertThat(slip.getLines().get(0).getBundleSetOptions().instanceKey())
                .isNotEqualTo(slip.getLines().get(1).getBundleSetOptions().instanceKey());
    }

    @Test
    @DisplayName("R14: 동일 signature legacy BUNDLE 복원은 잘못된 키를 만들지 않고 성공한다")
    void restoreAmbiguousLegacyBundleWithoutBlocking() {
        Slip slip = sampleSlip();
        BundleSetOptions duplicate = new BundleSetOptions("REMOTE-SAME", false, null, null, false);
        SlipSnapshot snapshot = new SlipSnapshot(
                "2026/05/29-1", LocalDate.of(2026, 5, 29), PARTNER, "삼한물산", null, null,
                "중복 signature", null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                List.of(bundleLine(true, "head-A", duplicate), bundleLine(true, "head-B", duplicate),
                        bundleLine(false, "child-A", duplicate), bundleLine(false, "child-B", duplicate)));

        slip.restoreFromSnapshot(snapshot);

        assertThat(slip.getLines()).allMatch(line -> line.getBundleSetOptions().instanceKey() == null);
    }

    private SlipSnapshot.Line bundleLine(boolean head, String model, BundleSetOptions options) {
        return new SlipSnapshot.Line(UUID.randomUUID(), model, model, null, 1,
                new BigDecimal("1000"), new BigDecimal("1100"), null, null, new BigDecimal("100"),
                new BigDecimal("1000"), head, "SET-SAME", null, null, options);
    }

    @Test
    @DisplayName("deliveryTag 스냅샷이 null 이면 null 로 복원한다 (null 안전)")
    void restoresNullDeliveryTag() {
        Slip slip = sampleSlip();
        SlipSnapshot snapshot = new SlipSnapshot(
                "2026/05/29-1", LocalDate.of(2026, 5, 29),
                PARTNER, "삼한물산", null, null,
                "메모", null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                List.of());

        slip.restoreFromSnapshot(snapshot);

        assertThat(slip.getDeliveryTag()).isNull();
    }

    @Test
    @DisplayName("라인 삭제 — 스냅샷 라인이 1건이면 미삭제 라인은 1건으로 줄어든다")
    void restoreRemovesLines() {
        Slip slip = sampleSlip();
        assertThat(activeLineCount(slip)).isEqualTo(2);
        SlipSnapshot snapshot = new SlipSnapshot(
                "2026/05/29-1", LocalDate.of(2026, 5, 29),
                PARTNER, "삼한물산", null, null, "메모", null,
                null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                List.of(new SlipSnapshot.Line(UUID.randomUUID(), "펌프", "MX-100", "220V",
                        2, new BigDecimal("15000.00"), new BigDecimal("30000.00"), "라인메모",
                        null, null, null)));

        slip.restoreFromSnapshot(snapshot);

        assertThat(activeLineCount(slip)).isEqualTo(1);
        assertThat(slip.getLines().get(0).getProductName()).isEqualTo("펌프");
    }

    @Test
    @DisplayName("라인 추가 — 스냅샷 라인이 3건이면 미삭제 라인은 3건으로 늘어난다")
    void restoreAddsLines() {
        Slip slip = sampleSlip();
        SlipSnapshot snapshot = new SlipSnapshot(
                "2026/05/29-1", LocalDate.of(2026, 5, 29),
                PARTNER, "삼한물산", null, null, "메모", null,
                null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                List.of(
                        new SlipSnapshot.Line(UUID.randomUUID(), "A", null, null,
                                1, new BigDecimal("100.00"), new BigDecimal("100.00"), null,
                                null, null, null),
                        new SlipSnapshot.Line(UUID.randomUUID(), "B", null, null,
                                2, new BigDecimal("200.00"), new BigDecimal("400.00"), null,
                                null, null, null),
                        new SlipSnapshot.Line(UUID.randomUUID(), "C", null, null,
                                3, new BigDecimal("300.00"), new BigDecimal("900.00"), null,
                                null, null, null)));

        slip.restoreFromSnapshot(snapshot);

        assertThat(activeLineCount(slip)).isEqualTo(3);
        assertThat(slip.getLines()).extracting(SlipLine::getProductName)
                .containsExactly("A", "B", "C");
    }

    @Test
    @DisplayName("라인 수량 수정 — 스냅샷 quantity 로 복원되며 lineTotal 이 재계산된다")
    void restoreModifiesLineQuantity() {
        Slip slip = sampleSlip();
        SlipSnapshot snapshot = new SlipSnapshot(
                "2026/05/29-1", LocalDate.of(2026, 5, 29),
                PARTNER, "삼한물산", null, null, "메모", null,
                null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                List.of(new SlipSnapshot.Line(UUID.randomUUID(), "펌프", "MX-100", "220V",
                        10, new BigDecimal("15000.00"), new BigDecimal("150000.00"), "라인메모",
                        null, null, null)));

        slip.restoreFromSnapshot(snapshot);

        assertThat(activeLineCount(slip)).isEqualTo(1);
        SlipLine restored = slip.getLines().get(0);
        assertThat(restored.getQuantity()).isEqualTo(10);
        // SlipLine.create 가 lineTotal = quantity × unitPrice 로 재계산
        assertThat(restored.getLineTotal()).isEqualByComparingTo("150000.00");
    }

    @Test
    @DisplayName("[#822 sweep] VAT 포함 단가 라인은 toSnapshot→restoreFromSnapshot 왕복에서 "
            + "권위 금액(withVat/vat/공급가액)이 불변이다 — 11의 배수가 아닌 단가")
    void restorePreservesVatInclusiveAuthoritativeAmounts() {
        Slip slip = sampleSlip();
        // 87,999(비 11배수) × 3 = 263,997 → 공급 239,997 / 부가세 24,000 (라인 단위 권위값)
        slip.addLine(SlipLine.createFromVatInclusive(slip, UUID.randomUUID(), "컴프레서", "CP-9",
                "380V", 3, new BigDecimal("87999"), "VAT포함 라인", null));
        SlipLine vatLine = slip.getLines().get(2);
        assertThat(vatLine.getUnitPriceWithVat()).isEqualByComparingTo("87999.00");
        assertThat(vatLine.getSupplyAmount()).isEqualByComparingTo("239997");
        assertThat(vatLine.getVatAmount()).isEqualByComparingTo("24000");

        SlipSnapshot snapshot = slip.toSnapshot();
        slip.restoreFromSnapshot(snapshot);

        // 결함(수정 전): create 재계산으로 withVat 87,998.90 / vat 23,999.70 드리프트
        SlipLine restored = slip.getLines().get(2);
        assertThat(restored.getUnitPriceWithVat()).isEqualByComparingTo("87999.00");
        assertThat(restored.getVatAmount()).isEqualByComparingTo("24000");
        assertThat(restored.getSupplyAmount()).isEqualByComparingTo("239997");
        assertThat(restored.getLineTotal()).isEqualByComparingTo("239997");
        // 공급 단가 생성 라인은 캡처값 == 재계산값 — 덮어쓰기에도 값 불변 (15,000 × 1.1)
        SlipLine supplyLine = slip.getLines().get(0);
        assertThat(supplyLine.getUnitPriceWithVat()).isEqualByComparingTo("16500.00");
        assertThat(supplyLine.getVatAmount()).isEqualByComparingTo("3000.00");
        // 재수렴 6차(#937) A안 — 단가 도메인도 왕복에서 보존된다. 복원만으로 도메인이 바뀌면
        // (create 가 넣는 SUPPLY 로 남으면) 복원 전후로 표시 단가가 달라진다.
        assertThat(restored.getUnitPriceDomain()).isEqualTo(UnitPriceDomain.VAT_INCLUSIVE);
        assertThat(supplyLine.getUnitPriceDomain()).isEqualTo(UnitPriceDomain.SUPPLY);
    }

    @Test
    @DisplayName("재수렴 6차(#937) A안: 도메인 키가 없는 구 스냅샷은 복원 후에도 legacy(null) 로 남는다 "
            + "— 추측으로 채우면 복원만으로 표시 단가가 바뀐다")
    void restoreKeepsLegacyNullDomainForOldSnapshot() {
        Slip slip = sampleSlip();
        slip.addLine(SlipLine.createFromVatInclusive(slip, UUID.randomUUID(), "컴프레서", "CP-9",
                "380V", 3, new BigDecimal("87999"), "VAT포함 라인", null));
        SlipSnapshot captured = slip.toSnapshot();
        // 도메인 컬럼이 없던 시절의 스냅샷 재현 — 라인의 unitPriceDomain 만 제거한다.
        List<SlipSnapshot.Line> legacyLines = captured.lines().stream()
                .map(l -> new SlipSnapshot.Line(l.productId(), l.productName(), l.modelName(),
                        l.specification(), l.quantity(), l.unitPrice(), l.lineTotal(), l.note(),
                        l.unitPriceWithVat(), l.vatAmount(), l.supplyAmount(),
                        l.setHead(), l.parentSetModel()))
                .toList();

        slip.restoreFromSnapshot(new SlipSnapshot(captured.slipNo(), captured.slipDate(),
                captured.partnerId(), captured.partnerName(), captured.partnerCode(),
                captured.businessNumber(), captured.memo(), captured.deliveryTag(),
                captured.deliveryAddress(), captured.supervisionAddress(), captured.projectName(),
                captured.recipientPhone(), captured.paymentDueDate(),
                captured.destinationWarehouseId(), captured.destinationWarehouseName(),
                captured.shippingAddress(), captured.inspectionAddress(), captured.receiverPhone(),
                captured.customerTel(), captured.customerAddress(),
                captured.customerRepresentative(), captured.paymentDueLabel(),
                captured.discountInfo(), captured.collectTerm(), captured.agreeTerm(), legacyLines));

        assertThat(slip.getLines().get(2).getUnitPriceDomain()).isNull();
        assertThat(slip.getLines().get(2).getUnitPriceWithVat()).isEqualByComparingTo("87999.00");
    }

    @Test
    @DisplayName("lockFlag=true 슬립은 복원 시 CONFLICT 로 거부한다")
    void lockedSlip_restore_throwsConflict() {
        Slip slip = sampleSlip();
        slip.lock();
        SlipSnapshot snapshot = new SlipSnapshot(
                "2026/05/29-1", LocalDate.of(2026, 5, 29),
                PARTNER, "삼한물산", null, null, "메모", null,
                null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, List.of());

        assertThatThrownBy(() -> slip.restoreFromSnapshot(snapshot))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.CONFLICT);
    }

    /**
     * [R8-BE-5] {@code toSnapshot()} 이 기사/하차 3필드를 캡처한다.
     *
     * <p>{@code SlipService.editDriver} 는 기사 변경을 EDIT 스냅샷으로 남기며 그 주석이
     * <i>"driverName/driverPhone 은 toSnapshot 필드"</i> 라고 명시했지만 record 에 없어 실제로는
     * 담기지 않았다. 이 단언이 {@code SlipSnapshot} 의 구 시그니처 호환 생성자로 회귀하는 것도 막는다.
     */
    @Test
    @DisplayName("toSnapshot 은 기사명/기사연락처/하차일을 캡처한다 (R8-BE-5)")
    void toSnapshot_capturesDriverAndUnloadDate() {
        Slip slip = Slip.createOutbound("2026/07/16-1", LocalDate.of(2026, 7, 16), 1,
                SOURCE_WH, UUID.randomUUID(), PARTNER, "삼한물산",
                DeliveryTag.REGION, "기사 캡처", "user-1");
        slip.setDriverContact("김기사", "010-5555-6666");
        slip.applyDeliverySchedule(DeliveryTag.REGION, LocalDate.of(2026, 7, 18));

        SlipSnapshot snapshot = slip.toSnapshot();

        assertThat(snapshot.driverName()).isEqualTo("김기사");
        assertThat(snapshot.driverPhone()).isEqualTo("010-5555-6666");
        assertThat(snapshot.unloadDate()).isEqualTo(LocalDate.of(2026, 7, 18));
    }

    /**
     * [R8-BE-5] 기사 변경 후 복원하면 <b>캡처 시점 기사</b>로 되돌아간다.
     *
     * <p>결함 상태에서는 스냅샷에 기사 필드가 없어 복원이 <b>현재 값(새 기사)을 그대로 남겼다</b>
     * — spec §4 "통째 복원" 위반. point-in-time 복원의 의미가 헤더 일부에만 적용됐다.
     */
    @Test
    @DisplayName("복원은 기사/하차일을 캡처 시점 값으로 되돌린다 (R8-BE-5)")
    void restore_revertsDriverAndUnloadDateToCapturedPointInTime() {
        Slip slip = Slip.createOutbound("2026/07/16-2", LocalDate.of(2026, 7, 16), 2,
                SOURCE_WH, UUID.randomUUID(), PARTNER, "삼한물산",
                DeliveryTag.REGION, "기사 복원", "user-1");
        slip.setDriverContact("김기사", "010-5555-6666");
        slip.applyDeliverySchedule(DeliveryTag.REGION, LocalDate.of(2026, 7, 18));
        SlipSnapshot before = slip.toSnapshot();

        // editDriver 경로 모사 — 기사 교체 + 하차일 변경
        slip.editHeader(null, null, null, null, "박기사", "010-7777-8888");
        slip.applyDeliverySchedule(DeliveryTag.REGION, LocalDate.of(2026, 7, 25));

        slip.restoreFromSnapshot(before);

        assertThat(slip.getDriverName()).isEqualTo("김기사");
        assertThat(slip.getDriverPhone()).isEqualTo("010-5555-6666");
        assertThat(slip.getUnloadDate()).isEqualTo(LocalDate.of(2026, 7, 18));
    }

    /**
     * [R8-BE-5 하위호환] 기사 필드가 없는 <b>구 스냅샷</b>(기존 revision 행) 으로 복원하면 캡처
     * 시점의 "기사 미지정" 상태가 재현된다 — 헤더 필드 전반의 복원 규약("스냅샷 값 그대로 덮어씀")과
     * 일관되며, 역직렬화가 깨지지 않는다.
     */
    @Test
    @DisplayName("기사 필드 없는 구 스냅샷 복원도 깨지지 않는다 (R8-BE-5 하위호환)")
    void restore_fromLegacySnapshotWithoutDriverFields_doesNotBreak() {
        Slip slip = Slip.createOutbound("2026/07/16-3", LocalDate.of(2026, 7, 16), 3,
                SOURCE_WH, UUID.randomUUID(), PARTNER, "삼한물산",
                DeliveryTag.REGION, "구 스냅샷", "user-1");
        slip.setDriverContact("김기사", "010-5555-6666");
        // 구 시그니처 호환 생성자 = 기사/하차 키가 없던 시절의 스냅샷
        SlipSnapshot legacy = new SlipSnapshot(
                "2026/07/16-3", LocalDate.of(2026, 7, 16), PARTNER, "삼한물산", null, null,
                "구 스냅샷", "REGION", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, List.of());

        slip.restoreFromSnapshot(legacy);

        assertThat(slip.getDriverName()).isNull();
        assertThat(slip.getDriverPhone()).isNull();
        assertThat(slip.getUnloadDate()).isNull();
    }
}
