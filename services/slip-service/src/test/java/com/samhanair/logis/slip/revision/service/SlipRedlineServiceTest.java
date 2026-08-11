package com.samhanair.logis.slip.revision.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.revision.domain.SlipRevision;
import com.samhanair.logis.slip.revision.domain.SlipRevisionType;
import com.samhanair.logis.slip.revision.domain.SlipSnapshot;
import com.samhanair.logis.slip.revision.repository.SlipRevisionRepository;
import com.samhanair.logis.slip.revision.web.dto.SlipRedlineResponse;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** S2d-1 저장 revision 기반 셀 인라인 레드라인 계산 단위 테스트. */
@ExtendWith(MockitoExtension.class)
class SlipRedlineServiceTest {

    private static final UUID FIXED_PARTNER_ID = UUID.randomUUID();
    private static final UUID FIXED_WAREHOUSE_ID = UUID.randomUUID();

    @Mock
    private SlipRepository slipRepository;
    @Mock
    private SlipRevisionRepository revisionRepository;

    @Test
    @DisplayName("anchor 이후 동일 필드 2회 편집은 base+각 편집자 layer 3개로 누적한다")
    void computeRedlineBuildsLayerChainAfterAnchor() throws Exception {
        UUID slipId = UUID.randomUUID();
        Slip slip = anchoredSlip(slipId, 1);
        UUID actor1 = UUID.fromString("20000000-0000-0000-0000-000000000101");
        UUID actor2 = UUID.fromString("20000000-0000-0000-0000-000000000102");
        SlipRevision rev1 = revision(slipId, 1, snapshot("원본", List.of(line(UUID.randomUUID(), 1))));
        SlipRevision rev2 = revision(slipId, 2, snapshot("1차", List.of(line(UUID.randomUUID(), 1))),
                actor1, "김영업", "#3366ff");
        SlipRevision rev3 = revision(slipId, 3, snapshot("2차", List.of(line(UUID.randomUUID(), 1))),
                actor2, "박관리", "#cc4422");
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(revisionRepository.findBySlipIdOrderByRevisionNoDesc(slipId))
                .thenReturn(List.of(rev3, rev2, rev1));

        SlipRedlineResponse response = service().computeRedline(slipId);

        assertThat(response.anchored()).isTrue();
        SlipRedlineResponse.FieldRedline memo = response.fields().stream()
                .filter(field -> field.fieldPath().equals("header.memo"))
                .findFirst()
                .orElseThrow();
        assertThat(memo.label()).isEqualTo("메모");
        assertThat(memo.layers()).extracting(SlipRedlineResponse.Layer::value)
                .containsExactly("원본", "1차", "2차");
        assertThat(memo.layers().get(0).actorName()).isNull();
        assertThat(memo.layers().get(1).actorName()).isEqualTo("김영업");
        assertThat(memo.layers().get(1).actorColor()).isEqualTo("#3366ff");
        assertThat(memo.layers().get(2).actorName()).isEqualTo("박관리");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "550e8400-e29b-41d4-a716-446655440000",
            "550E8400-E29B-41D4-A716-446655440000",
            "  550e8400-e29b-41d4-a716-446655440000  ",
            "{550e8400-e29b-41d4-a716-446655440000}",
            "urn:uuid:550e8400-e29b-41d4-a716-446655440000",
            "550e8400e29b41d4a716446655440000"
    })
    void computeRedline_hidesActorNameOnlyWhenItEqualsActorId(String actorName) throws Exception {
        SlipRedlineResponse response = computeRedlineForActor(
                actorName, UUID.fromString("550e8400-e29b-41d4-a716-446655440000"));

        SlipRedlineResponse.FieldRedline memo = response.fields().stream()
                .filter(field -> field.fieldPath().equals("header.memo"))
                .findFirst()
                .orElseThrow();
        assertThat(memo.layers().get(1).actorName()).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "cafebabecafebabecafebabecafebabe",
            "{cafebabecafebabecafebabecafebabe}",
            "urn:uuid:cafebabecafebabecafebabecafebabe"
    })
    void computeRedline_preservesUuidShapedNameWhenItDiffersFromActorId(String actorName) throws Exception {
        SlipRedlineResponse response = computeRedlineForActor(
                actorName, UUID.fromString("550e8400-e29b-41d4-a716-446655440000"));

        SlipRedlineResponse.FieldRedline memo = response.fields().stream()
                .filter(field -> field.fieldPath().equals("header.memo"))
                .findFirst()
                .orElseThrow();
        assertThat(memo.layers().get(1).actorName()).isEqualTo(actorName);
    }

    @Test
    @DisplayName("anchor 가 없으면 anchored=false 와 빈 fields 를 반환한다")
    void computeRedlineReturnsUnanchoredBeforeThreshold() throws Exception {
        UUID slipId = UUID.randomUUID();
        Slip slip = inboundSlip(slipId);
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        SlipRedlineResponse response = service().computeRedline(slipId);

        assertThat(response.anchored()).isFalse();
        assertThat(response.fields()).isEmpty();
    }

    @Test
    @DisplayName("anchor 이전 편집은 레드라인 base 에 섞지 않고 anchor 시점 값부터 누적한다")
    void computeRedlineStartsFromAnchorSnapshot() throws Exception {
        UUID slipId = UUID.randomUUID();
        Slip slip = anchoredSlip(slipId, 2);
        SlipRevision rev1 = revision(slipId, 1, snapshot("드래프트 원본", List.of(line(UUID.randomUUID(), 1))));
        SlipRevision rev2 = revision(slipId, 2, snapshot("임계 시점 메모", List.of(line(UUID.randomUUID(), 1))));
        SlipRevision rev3 = revision(slipId, 3, snapshot("임계 후 수정", List.of(line(UUID.randomUUID(), 1))),
                UUID.randomUUID(), "김영업", "#3366ff");
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(revisionRepository.findBySlipIdOrderByRevisionNoDesc(slipId))
                .thenReturn(List.of(rev3, rev2, rev1));

        SlipRedlineResponse response = service().computeRedline(slipId);

        SlipRedlineResponse.FieldRedline memo = response.fields().stream()
                .filter(field -> field.fieldPath().equals("header.memo"))
                .findFirst()
                .orElseThrow();
        assertThat(memo.layers()).extracting(SlipRedlineResponse.Layer::value)
                .containsExactly("임계 시점 메모", "임계 후 수정");
    }

    @Test
    @DisplayName("actorName 이 UUID 문자열이면 레드라인 응답에도 노출하지 않는다")
    void computeRedlineHidesUuidActorName() throws Exception {
        UUID slipId = UUID.randomUUID();
        Slip slip = anchoredSlip(slipId, 1);
        String uuidName = "20000000-0000-0000-0000-000000000201";
        SlipRevision rev1 = revision(slipId, 1, snapshot("원본", List.of(line(UUID.randomUUID(), 1))));
        SlipRevision rev2 = revision(slipId, 2, snapshot("수정", List.of(line(UUID.randomUUID(), 1))),
                UUID.fromString(uuidName), uuidName, null);
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(revisionRepository.findBySlipIdOrderByRevisionNoDesc(slipId))
                .thenReturn(List.of(rev2, rev1));

        SlipRedlineResponse response = service().computeRedline(slipId);
        JsonNode json = new ObjectMapper().findAndRegisterModules().valueToTree(response);

        assertThat(json.toString()).doesNotContain(uuidName);
        assertThat(response.fields().get(0).layers().get(1).actorName()).isNull();
    }

    @Test
    @DisplayName("라인 재정렬은 productId 로 매칭해 수정 레드라인을 만들지 않는다")
    void computeRedlineMatchesReorderedLinesByProductId() throws Exception {
        UUID slipId = UUID.randomUUID();
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        Slip slip = anchoredSlip(slipId, 1);
        SlipRevision rev1 = revision(slipId, 1, snapshot("memo", List.of(line(first, 1), line(second, 2))));
        SlipRevision rev2 = revision(slipId, 2, snapshot("memo", List.of(line(second, 2), line(first, 1))));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(revisionRepository.findBySlipIdOrderByRevisionNoDesc(slipId))
                .thenReturn(List.of(rev2, rev1));

        SlipRedlineResponse response = service().computeRedline(slipId);

        assertThat(response.anchored()).isTrue();
        assertThat(response.fields()).isEmpty();
    }

    @Test
    @DisplayName("라인 단가는 VAT 포함 표시값으로 base+변경 layer 를 누적한다")
    void computeRedlineAccumulatesLineUnitPriceWithVat() throws Exception {
        UUID slipId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        Slip slip = anchoredSlip(slipId, 1);
        SlipRevision rev1 = revision(slipId, 1, snapshot("memo",
                List.of(lineWithAmounts(productId, "품목", "모델", "규격", 1,
                        "10000", "10000", "11000", "1000", "10000"))));
        SlipRevision rev2 = revision(slipId, 2, snapshot("memo",
                List.of(lineWithAmounts(productId, "품목", "모델", "규격", 1,
                        "12000", "12000", "13200", "1200", "12000"))),
                UUID.randomUUID(), "김영업", "#3366ff");
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(revisionRepository.findBySlipIdOrderByRevisionNoDesc(slipId))
                .thenReturn(List.of(rev2, rev1));

        SlipRedlineResponse response = service().computeRedline(slipId);

        SlipRedlineResponse.FieldRedline price = response.fields().stream()
                .filter(field -> field.fieldPath().equals("lines[0].unitPrice"))
                .findFirst()
                .orElseThrow();
        assertThat(price.layers()).extracting(SlipRedlineResponse.Layer::value)
                .containsExactly("11000", "13200");
        assertThat(price.layers().get(0).actorName()).isNull();
    }

    @Test
    @DisplayName("라인 redline 은 삽입/재정렬 후에도 productId 체인을 최신 행 인덱스에 귀속한다")
    void lineRedlineFollowsProductIdAcrossReorder() throws Exception {
        UUID slipId = UUID.randomUUID();
        UUID productA = UUID.randomUUID();
        UUID productB = UUID.randomUUID();
        Slip slip = anchoredSlip(slipId, 1);
        SlipRevision rev1 = revision(slipId, 1, snapshot("memo", List.of(line(productA, 5))));
        SlipRevision rev2 = revision(slipId, 2, snapshot("memo", List.of(line(productA, 10))),
                UUID.randomUUID(), "김영업", "#3366ff");
        SlipRevision rev3 = revision(slipId, 3, snapshot("memo", List.of(line(productB, 1), line(productA, 10))),
                UUID.randomUUID(), "박관리", "#cc4422");
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(revisionRepository.findBySlipIdOrderByRevisionNoDesc(slipId))
                .thenReturn(List.of(rev3, rev2, rev1));

        SlipRedlineResponse response = service().computeRedline(slipId);

        SlipRedlineResponse.FieldRedline aQty = response.fields().stream()
                .filter(field -> field.fieldPath().equals("lines[1].quantity"))
                .findFirst()
                .orElseThrow();
        assertThat(aQty.layers()).extracting(SlipRedlineResponse.Layer::value)
                .containsExactly("5", "10");
        assertThat(response.fields()).noneMatch(field -> field.fieldPath().equals("lines[0].quantity")
                && field.layers().stream().anyMatch(layer -> "5".equals(layer.value())));
    }

    @Test
    // 재수렴 7차(#937) R7-2 — 종전 제목은 "VAT 제외 단가로 비교"였으나, 금액 3값이 없는 구
    // 스냅샷의 총액 해석을 화면(FE slipLineAmounts = lineTotal + 10%)에 맞추면서 이 좌표의
    // 비교 도메인도 VAT 포함(11,000)이 됐다. 두 revision 이 같은 값이므로 layer 는 1개뿐이고,
    // 단일 layer 는 응답에서 제외된다는 성질은 그대로다.
    @DisplayName("과거 VAT-null 스냅샷도 화면과 같은 VAT 포함 단가로 비교하고 단일 layer 는 응답에서 제외한다")
    void legacySnapshotFallsBackToVatExclusiveAndFiltersSingleLayer() throws Exception {
        UUID slipId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        Slip slip = anchoredSlip(slipId, 1);
        SlipRevision rev1 = revision(slipId, 1, snapshot("memo",
                List.of(lineWithAmounts(productId, "품목", "모델", "규격", 1,
                        "10000", "10000", null, null, null))));
        SlipRevision rev2 = revision(slipId, 2, snapshot("memo",
                List.of(lineWithAmounts(productId, "품목", "모델", "규격", 1,
                        "10000", "10000", null, null, null))));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(revisionRepository.findBySlipIdOrderByRevisionNoDesc(slipId))
                .thenReturn(List.of(rev2, rev1));

        SlipRedlineResponse response = service().computeRedline(slipId);

        assertThat(response.fields()).noneMatch(field -> field.fieldPath().startsWith("lines[")
                && field.fieldPath().endsWith(".unitPrice"));
    }

    @Test
    @DisplayName("재수렴 4차(#937) ⑤: 두 단가 컬럼이 VAT 제외로 같아진 행을 무수정 재저장해도 "
            + "레드라인 단가에 사용자가 하지 않은 변경이 찍히지 않는다")
    void computeRedlineDoesNotReportUnitPriceRepairAsUserEdit() throws Exception {
        UUID slipId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        Slip slip = anchoredSlip(slipId, 1);
        // rev1 — main 편집화면 페이로드가 만든 실 DB 상태(2026-07-27 실측 55건 계열):
        // unit_price = unit_price_with_vat = 100,000(둘 다 VAT 제외), 공급 200,000 / 부가세 20,000 / 수량 2.
        SlipRevision rev1 = revision(slipId, 1, snapshot("memo",
                List.of(lineWithAmounts(productId, "품목", "모델", "규격", 2,
                        "100000", "200000", "100000", "20000", "200000"))));
        // rev2 — 무수정 재저장. 근본수정 후 BE 는 unit_price_with_vat 를 VAT 포함 도메인으로 정상화한다.
        SlipRevision rev2 = revision(slipId, 2, snapshot("memo",
                List.of(lineWithAmounts(productId, "품목", "모델", "규격", 2,
                        "100000", "200000", "110000", "20000", "200000"))),
                UUID.randomUUID(), "김영업", "#3366ff");
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(revisionRepository.findBySlipIdOrderByRevisionNoDesc(slipId))
                .thenReturn(List.of(rev2, rev1));

        SlipRedlineResponse response = service().computeRedline(slipId);

        // RED(수정 전): 저장 컬럼을 그대로 읽어 "100000 -> 110000" layer 2개가 생긴다.
        assertThat(response.fields())
                .noneMatch(field -> field.fieldPath().endsWith(".unitPrice"));
    }

    @Test
    @DisplayName("재수렴 5차(#937): 부가세만 편집해도 레드라인 단가에 사용자가 하지 않은 변경이 찍히지 않는다")
    void computeRedlineKeepsAuthoredUnitPriceWhenOnlyVatEdited() throws Exception {
        UUID slipId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        Slip slip = anchoredSlip(slipId, 1);
        // rev1 — 단가(VAT포함) 110,000 x 2 저장분: unit_price = S/Q, unit_price_with_vat = 사용자 입력.
        SlipRevision rev1 = revision(slipId, 1, snapshot("memo",
                List.of(lineWithAmounts(productId, "품목", "모델", "규격", 2,
                        "100000", "200000", "110000", "20000", "200000"))));
        // rev2 — 부가세만 20,000 → 25,000 (단가·수량 무편집). 사용자 입력 단가는 그대로 남는다.
        SlipRevision rev2 = revision(slipId, 2, snapshot("memo",
                List.of(lineWithAmounts(productId, "품목", "모델", "규격", 2,
                        "100000", "200000", "110000", "25000", "200000"))),
                UUID.randomUUID(), "김영업", "#3366ff");
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(revisionRepository.findBySlipIdOrderByRevisionNoDesc(slipId))
                .thenReturn(List.of(rev2, rev1));

        SlipRedlineResponse response = service().computeRedline(slipId);

        // RED(수정 전): rev2 의 단가를 (200,000+25,000)/2 = 112,500 으로 역산해
        // "110000 -> 112500" layer 2개가 찍힌다 — 사용자는 단가를 건드리지 않았다.
        assertThat(response.fields())
                .noneMatch(field -> field.fieldPath().endsWith(".unitPrice"));
        // 실제로 바뀐 합계(VAT 포함)는 그대로 기록된다.
        SlipRedlineResponse.FieldRedline total = response.fields().stream()
                .filter(field -> field.fieldPath().equals("lines[0].lineTotal"))
                .findFirst()
                .orElseThrow();
        assertThat(total.layers()).extracting(SlipRedlineResponse.Layer::value)
                .containsExactly("220000", "225000");
    }

    @Test
    @DisplayName("재수렴 6차(#937) D-1R6: 도메인이 기록된 행은 '부가세 별도' 정정 후에도 "
            + "사용자 입력 단가를 그대로 보인다 (같은 좌표의 legacy 행은 계속 유도)")
    void computeRedlineTrustsRecordedUnitPriceDomain() throws Exception {
        UUID slipId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        Slip slip = anchoredSlip(slipId, 1);
        // rev1 — 단가(VAT포함) 100,000 x 2 저장분(S=181,818 · V=18,182).
        SlipRevision rev1 = revision(slipId, 1, snapshot("memo",
                List.of(domainLine(productId, 2, "90909", "181818", "100000", "18182",
                        "181818", "VAT_INCLUSIVE"))));
        // rev2 — 공급가액·부가세만 "부가세 별도"로 정정. 저장 좌표가 구 BE 오염행과 같아진다.
        SlipRevision rev2 = revision(slipId, 2, snapshot("memo",
                List.of(domainLine(productId, 2, "100000", "200000", "100000", "20000",
                        "200000", "VAT_INCLUSIVE"))),
                UUID.randomUUID(), "김영업", "#3366ff");
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(revisionRepository.findBySlipIdOrderByRevisionNoDesc(slipId))
                .thenReturn(List.of(rev2, rev1));

        SlipRedlineResponse response = service().computeRedline(slipId);

        // RED(수정 전): rev2 를 (200,000+20,000)/2 = 110,000 으로 유도해
        // "100000 -> 110000" layer 가 찍힌다 — 사용자는 단가를 건드리지 않았다.
        assertThat(response.fields())
                .noneMatch(field -> field.fieldPath().endsWith(".unitPrice"));
    }

    @Test
    @DisplayName("재수렴 6차(#937) A안: 도메인이 없는 legacy 스냅샷 행은 현행 휴리스틱을 유지한다")
    void computeRedlineKeepsHeuristicForLegacySnapshotLines() throws Exception {
        UUID slipId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        Slip slip = anchoredSlip(slipId, 1);
        SlipRevision rev1 = revision(slipId, 1, snapshot("memo",
                List.of(domainLine(productId, 2, "90909", "181818", "100000", "18182",
                        "181818", null))));
        // 같은 좌표인데 도메인이 없다 — 구 BE 오염행일 수 있어 권위 합계에서 유도한다.
        SlipRevision rev2 = revision(slipId, 2, snapshot("memo",
                List.of(domainLine(productId, 2, "100000", "200000", "100000", "20000",
                        "200000", null))),
                UUID.randomUUID(), "김영업", "#3366ff");
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(revisionRepository.findBySlipIdOrderByRevisionNoDesc(slipId))
                .thenReturn(List.of(rev2, rev1));

        SlipRedlineResponse response = service().computeRedline(slipId);

        SlipRedlineResponse.FieldRedline unitPrice = response.fields().stream()
                .filter(field -> field.fieldPath().equals("lines[0].unitPrice"))
                .findFirst()
                .orElseThrow();
        assertThat(unitPrice.layers()).extracting(SlipRedlineResponse.Layer::value)
                .containsExactly("100000", "110000");
    }

    /** 금액 5값 + 단가 도메인을 가진 스냅샷 라인 (재수렴 6차 #937). */
    private SlipSnapshot.Line domainLine(UUID productId, int quantity, String unitPrice,
                                         String lineTotal, String unitPriceWithVat,
                                         String vatAmount, String supplyAmount,
                                         String unitPriceDomain) {
        return new SlipSnapshot.Line(productId, "품목", "모델", "규격", quantity,
                decimal(unitPrice), decimal(lineTotal), null, decimal(unitPriceWithVat),
                decimal(vatAmount), decimal(supplyAmount), null, null, unitPriceDomain);
    }

    private SlipRedlineService service() {
        return new SlipRedlineService(slipRepository, revisionRepository,
                new SlipRevisionService(revisionRepository, new ObjectMapper().findAndRegisterModules()));
    }

    private SlipRedlineResponse computeRedlineForActor(String actorName, UUID actorId) throws Exception {
        UUID slipId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        Slip slip = anchoredSlip(slipId, 1);
        SlipRevision rev1 = revision(slipId, 1, snapshot("원본", List.of(line(productId, 1))));
        SlipRevision rev2 = revision(slipId, 2, snapshot("수정", List.of(line(productId, 1))), actorId, actorName, null);
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(revisionRepository.findBySlipIdOrderByRevisionNoDesc(slipId)).thenReturn(List.of(rev2, rev1));
        return service().computeRedline(slipId);
    }

    private Slip anchoredSlip(UUID slipId, int anchorRevisionNo) throws Exception {
        Slip slip = inboundSlip(slipId);
        slip.captureRedlineAnchorIfAbsent(anchorRevisionNo);
        return slip;
    }

    private Slip inboundSlip(UUID slipId) throws Exception {
        Slip slip = Slip.createInbound("2026/06/30-1", LocalDate.of(2026, 6, 30), 1,
                FIXED_WAREHOUSE_ID, FIXED_PARTNER_ID, "삼한물산",
                DeliveryTag.RETURN, "memo", "user-1");
        Field id = Slip.class.getDeclaredField("id");
        id.setAccessible(true);
        id.set(slip, slipId);
        return slip;
    }

    private SlipRevision revision(UUID slipId, int revisionNo, SlipSnapshot snapshot) {
        return revision(slipId, revisionNo, snapshot, UUID.randomUUID(), "작성자", null);
    }

    private SlipRevision revision(UUID slipId, int revisionNo, SlipSnapshot snapshot,
                                  UUID actorId, String actorName, String actorColor) {
        return SlipRevision.of(slipId, revisionNo,
                revisionNo == 1 ? SlipRevisionType.CREATE : SlipRevisionType.EDIT,
                null, "2026/06/30-1", LocalDate.of(2026, 6, 30),
                snapshot, actorId, actorName, actorColor);
    }

    private SlipSnapshot snapshot(String memo, List<SlipSnapshot.Line> lines) {
        return new SlipSnapshot("2026/06/30-1", LocalDate.of(2026, 6, 30),
                FIXED_PARTNER_ID, "삼한물산", "P001", "123-45-67890",
                memo, "RETURN", null, null, null, null, null,
                FIXED_WAREHOUSE_ID, "입고창고",
                null, null, null, null, null, null, null, null, null, null,
                lines);
    }

    private SlipSnapshot.Line line(UUID productId, int quantity) {
        return lineWithAmounts(productId, "품목", "모델", "규격", quantity, "1000",
                BigDecimal.valueOf(quantity).multiply(new BigDecimal("1000")).toPlainString(),
                null, null, null);
    }

    private SlipSnapshot.Line lineWithAmounts(UUID productId, String productName, String modelName,
                                              String specification, int quantity, String unitPrice,
                                              String lineTotal, String unitPriceWithVat,
                                              String vatAmount, String supplyAmount) {
        return new SlipSnapshot.Line(productId, productName, modelName, specification,
                quantity, decimal(unitPrice), decimal(lineTotal), null,
                decimal(unitPriceWithVat), decimal(vatAmount), decimal(supplyAmount));
    }

    private BigDecimal decimal(String value) {
        return value == null ? null : new BigDecimal(value);
    }
}
