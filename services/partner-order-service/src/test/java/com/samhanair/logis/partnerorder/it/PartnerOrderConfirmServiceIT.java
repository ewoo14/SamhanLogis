package com.samhanair.logis.partnerorder.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.partnerorder.PartnerOrderServiceApplication;
import com.samhanair.logis.partnerorder.client.DcConfigClient;
import com.samhanair.logis.partnerorder.client.InventoryClient;
import com.samhanair.logis.partnerorder.client.PartnerAuthClient;
import com.samhanair.logis.partnerorder.client.ProductClient;
import com.samhanair.logis.partnerorder.client.ProductSummary;
import com.samhanair.logis.partnerorder.client.SlipServiceClient;
import com.samhanair.logis.partnerorder.domain.HistoryEventType;
import com.samhanair.logis.partnerorder.domain.SlipPublishStatus;
import com.samhanair.logis.partnerorder.repository.PartnerOrderHistoryRepository;
import com.samhanair.logis.partnerorder.repository.PartnerOrderLineRepository;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.repository.SlipPublishOutboxRepository;
import com.samhanair.logis.partnerorder.revision.domain.PartnerOrderRevisionType;
import com.samhanair.logis.partnerorder.revision.repository.PartnerOrderRevisionRepository;
import com.samhanair.logis.partnerorder.service.PartnerOrderConfirmService;
import com.samhanair.logis.partnerorder.vendor.client.PartnerLookupClient;
import com.samhanair.logis.partnerorder.vendor.client.PartnerSummary;
import com.samhanair.logis.partnerorder.web.dto.ConfirmLineRequest;
import com.samhanair.logis.partnerorder.web.dto.ConfirmRequest;
import com.samhanair.logis.partnerorder.web.dto.ConfirmResponse;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * confirm 흐름 D1 — slip 미발행 DRAFT 주문 생성 검증 (슬라이스 D1).
 *
 * <p>5 외부 client 모두 mock — confirm 은 slip-service 를 호출하지 않아야 한다.
 *
 * <p>검증 대상:
 * <ol>
 *   <li>DRAFT 주문 생성 + slip 미발행 (slipNo=null, status=DRAFT, slipPublishStatus=NOT_REQUIRED)</li>
 *   <li>outbox 미삽입 (D1 이후 confirm 은 outbox 비사용)</li>
 *   <li>revision_no=1, type=CREATE row 생성 (Phase 2.4 버전이력 훅)</li>
 *   <li>history CONFIRMED row 생성 (거래처 주문 접수 이벤트)</li>
 *   <li>멱등 재confirm — 동일 idempotencyKey 로 2회 호출 시 동일 orderNo 반환 + 중복 row 없음</li>
 *   <li>DC price-calc finalPrice 적용 — price_vat = finalPrice (DC 적용)</li>
 *   <li>DC price-calc fail-soft — price-calc 빈 Map 시 price_vat = listPrice</li>
 * </ol>
 */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
class PartnerOrderConfirmServiceIT extends AbstractPostgresIT {

    @Autowired
    private PartnerOrderConfirmService confirmService;

    @Autowired
    private SlipPublishOutboxRepository outboxRepository;

    @Autowired
    private PartnerOrderRepository orderRepository;

    @Autowired
    private PartnerOrderLineRepository lineRepository;

    @Autowired
    private PartnerOrderRevisionRepository revisionRepository;

    @Autowired
    private PartnerOrderHistoryRepository historyRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @MockBean
    private DcConfigClient dcConfigClient;

    @MockBean
    private ProductClient productClient;

    @MockBean
    private InventoryClient inventoryClient;

    @MockBean
    private SlipServiceClient slipServiceClient;

    @MockBean
    private PartnerAuthClient partnerAuthClient;

    @MockBean
    private PartnerLookupClient partnerLookupClient;

    @BeforeEach
    void setUpPartnerLookup() {
        Mockito.lenient().when(partnerLookupClient.findByPartnerCodeForIdentity(Mockito.anyString()))
                .thenAnswer(invocation -> {
                    String partnerCode = invocation.getArgument(0);
                    return Optional.of(new PartnerSummary(
                            UUID.nameUUIDFromBytes(partnerCode.getBytes(StandardCharsets.UTF_8)),
                            partnerCode, null, businessNoFor(partnerCode)));
                });
    }

    private String businessNoFor(String partnerCode) {
        return switch (partnerCode) {
            case "P-DRAFT", "P-DC", "P-FS" -> "1234567890";
            case "P-NOOUTBOX" -> "9876543210";
            case "P-IDEM2" -> "1111111111";
            case "P-REVISION" -> "2222222222";
            case "P-HISTORY" -> "3333333333";
            case "P-PARTIAL" -> "5555555555";
            default -> "1234567890";
        };
    }

    @Test
    void confirm_creates_draft_order_without_slip_publish() {
        UUID productId = UUID.randomUUID();
        Mockito.when(dcConfigClient.calculatePrices(Mockito.anyString(), Mockito.anyList()))
                .thenReturn(Map.of());
        Mockito.when(productClient.lookup(Mockito.anyList()))
                .thenReturn(List.of(new ProductSummary(
                        productId, "헬로멀티 5kW", "HM-5000", null,
                        new BigDecimal("1000000"), "ACTIVE")));

        ConfirmRequest request = new ConfirmRequest(List.of(
                new ConfirmLineRequest(productId, "homemulti", 1, "remark-1")));
        ConfirmResponse response = confirmService.confirm(
                "P-DRAFT", "1234567890", "user-draft", null, null, request);

        // 주문만 생성 — slip 미발행, 진행중(DRAFT)
        assertThat(response.slipNo()).isNull();
        assertThat(response.status()).isEqualTo("DRAFT");
        assertThat(response.slipPublishStatus()).isEqualTo(SlipPublishStatus.NOT_REQUIRED.name());

        var savedOrder = orderRepository.findByOrderNo(response.orderNo()).orElseThrow();
        assertThat(savedOrder.getPartnerId())
                .isEqualTo(UUID.nameUUIDFromBytes("P-DRAFT".getBytes(StandardCharsets.UTF_8)));

        // slip-service 미호출
        Mockito.verify(slipServiceClient, Mockito.never())
                .publishFromPartnerOrder(Mockito.anyMap(), Mockito.anyString());
    }

    @Test
    void confirm_does_not_enqueue_outbox() {
        UUID productId = UUID.randomUUID();
        Mockito.when(dcConfigClient.calculatePrices(Mockito.anyString(), Mockito.anyList()))
                .thenReturn(Map.of());
        Mockito.when(productClient.lookup(Mockito.anyList()))
                .thenReturn(List.of(new ProductSummary(
                        productId, "헬로멀티 7kW", "HM-7000", null,
                        new BigDecimal("1500000"), "ACTIVE")));

        long before = outboxRepository.count();

        ConfirmRequest request = new ConfirmRequest(List.of(
                new ConfirmLineRequest(productId, "homemulti", 1, null)));
        ConfirmResponse response = confirmService.confirm(
                "P-NOOUTBOX", "9876543210", "user-nooutbox", null, null, request);

        assertThat(response.status()).isEqualTo("DRAFT");
        assertThat(outboxRepository.count()).isEqualTo(before);
    }

    /**
     * 멱등 재confirm 검증 — spec §6 (D1 사이클2 보강).
     *
     * <p>동일 (partnerCode, draftSeq) 기반의 idempotencyKey 로 confirm 을 실제로 2회 호출하여
     * 두 번째 호출이 {@code findByIdempotencyKey} hit 경로를 타는지 직접 검증한다.
     *
     * <p>핵심 전제 — {@code resolveDraftSeq(partnerCode, draftId=null)} 는
     * {@code draftRepository.findMaxDraftSeqByPartnerCode(partnerCode) + 1} 을 반환하며,
     * confirm 은 PartnerOrderDraft 를 INSERT 하지 않으므로 1회 confirm 후 MAX 값이 변하지 않는다.
     * 따라서 동일 partnerCode 로 draftId=null 인 채 2회 호출하면 두 호출 모두 동일 draftSeq 를
     * 사용하게 되고, idempotencyKey("PO-CONF-{partnerCode}-{draftSeq}") 가 동일해진다.
     * 두 번째 호출은 반드시 {@code findByIdempotencyKey} hit → 기존 주문 반환 경로를 탄다.
     *
     * <p>검증 항목:
     * <ul>
     *   <li>두 번째 호출 응답 orderNo == 첫 번째 응답 orderNo (동일 주문 반환)</li>
     *   <li>2회 호출 후 해당 partnerCode 의 partner_orders row = 1건 (중복 생성 0)</li>
     *   <li>2회 호출 후 partner_order_lines row = 첫 호출과 동일 (라인 중복 0)</li>
     *   <li>저장된 idempotencyKey 로 findByIdempotencyKey 가 동일 orderNo 의 주문을 반환</li>
     * </ul>
     */
    @Test
    void idempotent_reconfirm_returns_same_order_no_without_duplicate_rows() {
        // ── given ──────────────────────────────────────────────────────────────
        // 전용 partnerCode 사용 — 다른 테스트 partnerCode 와 격리하여 MAX draftSeq 오염 방지
        String partnerCode = "P-IDEM2";
        String bizCode = "1111111111";
        UUID productId = UUID.randomUUID();

        Mockito.lenient().when(dcConfigClient.calculatePrices(Mockito.anyString(), Mockito.anyList()))
                .thenReturn(Map.of());
        Mockito.lenient().when(productClient.lookup(Mockito.anyList()))
                .thenReturn(List.of(new ProductSummary(
                        productId, "멱등테스트 5kW", "IDEM-5000", null,
                        new BigDecimal("2000000"), "ACTIVE")));

        ConfirmRequest request = new ConfirmRequest(List.of(
                new ConfirmLineRequest(productId, "homemulti", 2, "idem-remark")));

        // ── when: 1회 confirm ─────────────────────────────────────────────────
        ConfirmResponse first = confirmService.confirm(
                partnerCode, bizCode, "user-idem-1", "홍길동", null, request);

        assertThat(first.orderNo()).isNotNull();
        assertThat(first.status()).isEqualTo("DRAFT");

        // DB 상태 스냅샷 (1회 confirm 직후)
        var savedOrderAfterFirst = orderRepository.findByOrderNo(first.orderNo())
                .orElseThrow(() -> new AssertionError("1회 confirm 후 주문을 찾을 수 없음"));
        String savedIdemKey = savedOrderAfterFirst.getIdempotencyKey();
        long orderCountAfterFirst = orderRepository.findAll().stream()
                .filter(o -> o.getPartnerCode().equals(partnerCode))
                .count();
        long lineCountAfterFirst = lineRepository.findAllByPartnerOrder_Id(
                savedOrderAfterFirst.getId()).size();

        // ── when: 2회 confirm — 실제 멱등 분기 hit 검증 ───────────────────────
        // confirm 은 PartnerOrderDraft 를 INSERT 하지 않으므로 MAX draftSeq 불변.
        // 동일 partnerCode + draftId=null → 동일 draftSeq → 동일 idempotencyKey 보장.
        // 이 호출은 반드시 findByIdempotencyKey hit → 기존 주문 반환 경로를 타야 한다.
        ConfirmResponse second = confirmService.confirm(
                partnerCode, bizCode, "user-idem-2", "홍길동", null, request);

        // ── then ──────────────────────────────────────────────────────────────
        // 두 번째 응답이 첫 번째와 동일한 orderNo 를 반환해야 한다 (멱등 경로 검증 핵심)
        assertThat(second.orderNo())
                .as("멱등 재호출 시 동일 orderNo 반환")
                .isEqualTo(first.orderNo());

        // 2회 호출 후에도 해당 partnerCode 의 partner_orders row = 1건 (중복 생성 0)
        long orderCountAfterSecond = orderRepository.findAll().stream()
                .filter(o -> o.getPartnerCode().equals(partnerCode))
                .count();
        assertThat(orderCountAfterSecond)
                .as("2회 confirm 후 partner_orders row 중복 없음")
                .isEqualTo(orderCountAfterFirst);

        // 라인 row 중복 없음
        long lineCountAfterSecond = lineRepository.findAllByPartnerOrder_Id(
                savedOrderAfterFirst.getId()).size();
        assertThat(lineCountAfterSecond)
                .as("2회 confirm 후 partner_order_lines row 중복 없음")
                .isEqualTo(lineCountAfterFirst);

        // idempotencyKey 로 findByIdempotencyKey 가 동일 orderNo 의 주문을 반환
        assertThat(orderRepository.findByIdempotencyKey(savedIdemKey)
                .map(o -> o.getOrderNo()))
                .as("findByIdempotencyKey 가 동일 주문 반환")
                .contains(first.orderNo());
    }

    /**
     * confirm 후 partner_order_revisions 에 revision_no=1, type=CREATE row 가 존재해야 한다.
     *
     * <p>Phase 2.4 버전이력 훅 — {@link com.samhanair.logis.partnerorder.revision.service.PartnerOrderRevisionService#capture}
     * 가 confirm 트랜잭션 내에서 호출된다.
     */
    @Test
    void confirm_creates_revision_with_no1_and_type_create() {
        // ── given ──────────────────────────────────────────────────────────────
        String partnerCode = "P-REVISION";
        UUID productId = UUID.randomUUID();

        Mockito.lenient().when(dcConfigClient.calculatePrices(Mockito.anyString(), Mockito.anyList()))
                .thenReturn(Map.of());
        Mockito.lenient().when(productClient.lookup(Mockito.anyList()))
                .thenReturn(List.of(new ProductSummary(
                        productId, "리비전 테스트 3kW", "REV-3000", null,
                        new BigDecimal("500000"), "ACTIVE")));

        ConfirmRequest request = new ConfirmRequest(List.of(
                new ConfirmLineRequest(productId, "homemulti", 1, null)));

        // ── when ───────────────────────────────────────────────────────────────
        ConfirmResponse response = confirmService.confirm(
                partnerCode, "2222222222", "user-rev", "김리뷰", null, request);

        // ── then: partner_order_revisions 검증 ───────────────────────────────
        var savedOrder = orderRepository.findByOrderNo(response.orderNo())
                .orElseThrow(() -> new AssertionError("confirm 후 주문을 찾을 수 없음"));

        var revisions = revisionRepository.findByPartnerOrderIdOrderByRevisionNoDesc(savedOrder.getId());

        assertThat(revisions).isNotEmpty();
        var firstRevision = revisions.stream()
                .filter(r -> r.getRevisionNo() == 1)
                .findFirst()
                .orElseThrow(() -> new AssertionError("revision_no=1 row 없음"));

        assertThat(firstRevision.getRevisionType()).isEqualTo(PartnerOrderRevisionType.CREATE);
        assertThat(firstRevision.getPartnerOrderId()).isEqualTo(savedOrder.getId());
    }

    /**
     * confirm 후 partner_order_history 에 CONFIRMED event row 가 존재해야 한다.
     *
     * <p>HistoryEventType.CONFIRMED 는 "거래처 주문 접수" 이벤트로,
     * {@link com.samhanair.logis.partnerorder.service.PartnerOrderConfirmService#confirm} 에서
     * {@link com.samhanair.logis.partnerorder.domain.PartnerOrderHistory#ofOrder} 로 저장된다.
     */
    @Test
    void confirm_records_history_event_confirmed() {
        // ── given ──────────────────────────────────────────────────────────────
        String partnerCode = "P-HISTORY";
        UUID productId = UUID.randomUUID();

        Mockito.lenient().when(dcConfigClient.calculatePrices(Mockito.anyString(), Mockito.anyList()))
                .thenReturn(Map.of());
        Mockito.lenient().when(productClient.lookup(Mockito.anyList()))
                .thenReturn(List.of(new ProductSummary(
                        productId, "히스토리 테스트 8kW", "HIST-8000", null,
                        new BigDecimal("3000000"), "ACTIVE")));

        ConfirmRequest request = new ConfirmRequest(List.of(
                new ConfirmLineRequest(productId, "commercialMulti", 3, "hist-remark")));

        // ── when ───────────────────────────────────────────────────────────────
        ConfirmResponse response = confirmService.confirm(
                partnerCode, "3333333333", "user-hist", "이히스토리", null, request);

        // ── then: partner_order_history 검증 ─────────────────────────────────
        var savedOrder = orderRepository.findByOrderNo(response.orderNo())
                .orElseThrow(() -> new AssertionError("confirm 후 주문을 찾을 수 없음"));

        var historyList = historyRepository.findAllByPartnerOrderIdOrderByOccurredAtAsc(
                savedOrder.getId());

        assertThat(historyList).isNotEmpty();
        var confirmedEvent = historyList.stream()
                .filter(h -> h.getEventType() == HistoryEventType.CONFIRMED)
                .findFirst()
                .orElseThrow(() -> new AssertionError("CONFIRMED history event row 없음"));

        assertThat(confirmedEvent.getPartnerCode()).isEqualTo(partnerCode);
        assertThat(confirmedEvent.getPartnerOrderId()).isEqualTo(savedOrder.getId());
    }

    /**
     * price-calc 가 finalPrice 를 반환하면 라인의 price_vat 에 DC 적용 단가가 저장된다.
     *
     * <p>spec §6 — {@code calculatePrices} stub(lineId→finalPrice) → 주문 라인 {@code price_vat=finalPrice} 단언.
     *
     * <p>P0-2: idempotencyKey 하드코딩 제거 — {@code response.orderNo()} 로 주문 조회.
     * draftSeq 가정(+1L) 을 제거하여 DB 상태 의존성을 없앤다.
     */
    @Test
    void confirm_applies_dc_final_price_from_price_calc() {
        UUID productId = UUID.randomUUID();
        Mockito.when(productClient.lookup(Mockito.anyList()))
                .thenReturn(List.of(new ProductSummary(
                        productId, "360 멀티", "AM360AXVHHR1SY", null,
                        new BigDecimal("29053200"), "ACTIVE")));
        Mockito.when(productClient.lookupFixedDiscountRates(Mockito.anyList()))
                .thenReturn(Map.of(productId, new BigDecimal("45.0")));
        // price-calc 가 finalPrice=800000 반환 (lineId "0")
        Mockito.when(dcConfigClient.calculatePrices(Mockito.anyString(), Mockito.anyList()))
                .thenReturn(Map.of("0", new BigDecimal("800000")));

        ConfirmRequest request = new ConfirmRequest(List.of(
                new ConfirmLineRequest(productId, "homemulti", 1, null)));
        ConfirmResponse response = confirmService.confirm(
                "P-DC", "1234567890", "user-dc", null, null, request);

        ArgumentCaptor<List<DcConfigClient.PriceLine>> priceLines = ArgumentCaptor.forClass(List.class);
        Mockito.verify(dcConfigClient).calculatePrices(Mockito.eq("P-DC"), priceLines.capture());
        DcConfigClient.PriceLine sent = priceLines.getValue().get(0);
        assertThat(sent.modelCode()).isEqualTo("AM360AXVHHR1SY");
        assertThat(sent.is360()).isTrue();
        assertThat(sent.is4Way()).isFalse();
        assertThat(sent.is1Way()).isFalse();
        assertThat(sent.isStand()).isFalse();
        assertThat(sent.isDeluxe()).isFalse();
        assertThat(sent.isFirstGrade()).isFalse();
        assertThat(sent.fixedDiscountRate()).isEqualByComparingTo("45.0");

        assertThat(response.status()).isEqualTo("DRAFT");
        // P0-2: response.orderNo() 로 주문 조회 — idempotencyKey 하드코딩 제거
        UUID orderId = orderRepository.findByOrderNo(response.orderNo())
                .orElseThrow(() -> new AssertionError("confirm 후 주문을 찾을 수 없음: " + response.orderNo()))
                .getId();
        BigDecimal priceVat = jdbcTemplate.queryForObject(
                "SELECT price_vat FROM partner_order_lines WHERE partner_order_id = ?",
                BigDecimal.class, orderId);
        assertThat(priceVat).isEqualByComparingTo("800000");
        BigDecimal supplyAmount = jdbcTemplate.queryForObject(
                "SELECT supply_amount FROM partner_order_lines WHERE partner_order_id = ?",
                BigDecimal.class, orderId);
        BigDecimal vatAmount = jdbcTemplate.queryForObject(
                "SELECT vat_amount FROM partner_order_lines WHERE partner_order_id = ?",
                BigDecimal.class, orderId);
        BigDecimal subtotal = jdbcTemplate.queryForObject(
                "SELECT subtotal FROM partner_order_lines WHERE partner_order_id = ?",
                BigDecimal.class, orderId);
        assertThat(supplyAmount).isEqualByComparingTo("727272");
        assertThat(vatAmount).isEqualByComparingTo("72728");
        assertThat(supplyAmount.add(vatAmount)).isEqualByComparingTo(subtotal);
    }

    @Test
    void confirm_sends_screen_price_bases_and_derived_option_flags() {
        UUID multiId = UUID.randomUUID();
        UUID singleId = UUID.randomUUID();
        Mockito.when(productClient.lookup(Mockito.anyList())).thenReturn(List.of(
                new ProductSummary(multiId, "홈멀티", "AM023TNVDBH1", null,
                        new BigDecimal("451000"), "ACTIVE", "AM023TNVDBH1", "SINGLE",
                        "homemulti", new BigDecimal("40.00"), "000000",
                        new BigDecimal("501600"), new BigDecimal("300960"), true),
                new ProductSummary(singleId, "싱글 세트", "AC060CS4FBH2SY", null,
                        new BigDecimal("3115200"), "ACTIVE", "AC060CS4FBH2SY", "SINGLE",
                        "singleSets", null, "000000",
                        new BigDecimal("3121800"), new BigDecimal("1840000"), true)));
        Mockito.when(dcConfigClient.calculatePrices(Mockito.anyString(), Mockito.anyList()))
                .thenReturn(Map.of("0", new BigDecimal("300960"), "1", new BigDecimal("1810000")));

        ConfirmResponse response = confirmService.confirm(
                "P-SOL-985", "1234567890", "user-sol-985", null, null,
                new ConfirmRequest(List.of(
                        new ConfirmLineRequest(multiId, "homemulti", 1, null),
                        new ConfirmLineRequest(singleId, "singleSets", 1, null))));

        ArgumentCaptor<List<DcConfigClient.PriceLine>> captor = ArgumentCaptor.forClass(List.class);
        Mockito.verify(dcConfigClient).calculatePrices(Mockito.eq("P-SOL-985"), captor.capture());
        DcConfigClient.PriceLine multi = captor.getValue().get(0);
        DcConfigClient.PriceLine single = captor.getValue().get(1);
        assertThat(multi.listPrice()).isEqualByComparingTo("501600");
        assertThat(multi.fixedDiscountRate()).isEqualByComparingTo("40.00");
        assertThat(multi.hasVariableDiscount()).isTrue();
        assertThat(single.listPrice()).isEqualByComparingTo("1840000");
        assertThat(single.isFirstGrade()).isTrue();
        assertThat(single.fixedDiscountRate()).isNull();

        UUID orderId = orderRepository.findByOrderNo(response.orderNo()).orElseThrow().getId();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT price_vat FROM partner_order_lines WHERE partner_order_id = ? AND product_id = ?",
                BigDecimal.class, orderId, multiId)).isEqualByComparingTo("300960");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT price_vat FROM partner_order_lines WHERE partner_order_id = ? AND product_id = ?",
                BigDecimal.class, orderId, singleId)).isEqualByComparingTo("1810000");
    }

    /**
     * 상업멀티 AM120MXVRHC1의 화면 규칙 회귀 테스트.
     *
     * <p>부트스트랩 원시 {@code price}는 3,905,000원이지만 화면은
     * {@code list=7,810,000}에 품목 고정DC 40%를 적용한 4,686,000원을 표시한다.
     * 따라서 confirm도 releasePrice를 원금으로 dc-config에 전달하고 같은 단가를 저장해야 한다.
     */
    @Test
    void confirm_uses_release_price_base_for_commercial_fixed_dc_am120() {
        UUID productId = UUID.randomUUID();
        Mockito.when(productClient.lookup(Mockito.anyList()))
                .thenReturn(List.of(new ProductSummary(
                        productId, "DVM ECO 리뉴얼 12HP 상부토출형", "AM120MXVRHC1", null,
                        new BigDecimal("7810000"), "ACTIVE", "AM120MXVRHC1", "SINGLE",
                        "commercialMulti", new BigDecimal("40.00"), "000000",
                        new BigDecimal("7810000"), new BigDecimal("3905000"), true)));
        Mockito.when(dcConfigClient.calculatePrices(Mockito.anyString(), Mockito.anyList()))
                .thenReturn(Map.of("0", new BigDecimal("4686000")));

        ConfirmResponse response = confirmService.confirm(
                "P-SOL-985-AM120", "1234567890", "user-sol-985", null, null,
                new ConfirmRequest(List.of(new ConfirmLineRequest(
                        productId, "commercialMulti", 1, "AM120 screen parity"))));

        ArgumentCaptor<List<DcConfigClient.PriceLine>> captor = ArgumentCaptor.forClass(List.class);
        Mockito.verify(dcConfigClient).calculatePrices(Mockito.eq("P-SOL-985-AM120"), captor.capture());
        assertThat(captor.getValue().get(0).listPrice()).isEqualByComparingTo("7810000");
        assertThat(captor.getValue().get(0).fixedDiscountRate()).isEqualByComparingTo("40.00");

        UUID orderId = orderRepository.findByOrderNo(response.orderNo()).orElseThrow().getId();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT price_vat FROM partner_order_lines WHERE partner_order_id = ?",
                BigDecimal.class, orderId)).isEqualByComparingTo("4686000");
    }

    @Test
    void confirm_rejects_missing_price_instead_of_saving_zero() {
        UUID productId = UUID.randomUUID();
        Mockito.when(productClient.lookup(Mockito.anyList()))
                .thenReturn(List.of(new ProductSummary(
                        productId, "가격누락", "MISSING-PRICE", null,
                        BigDecimal.ZERO, "ACTIVE")));

        assertThatThrownBy(() -> confirmService.confirm(
                "P-SOL-985-ZERO", "1234567890", "user-sol-985", null, null,
                new ConfirmRequest(List.of(new ConfirmLineRequest(
                        productId, "homemulti", 1, null)))))
                .isInstanceOf(com.samhanair.logis.common.exception.BusinessException.class)
                .hasMessageContaining("확정 가격 기준가 없음");
        Mockito.verify(dcConfigClient, Mockito.never())
                .calculatePrices(Mockito.anyString(), Mockito.anyList());
    }

    /**
     * price-calc 가 빈 Map 을 반환하면 fail-soft 로 listPrice 가 price_vat 에 저장된다.
     *
     * <p>spec §6 — {@code calculatePrices} 빈 Map → {@code price_vat=listPrice}(fail-soft) 단언.
     *
     * <p>P0-2: idempotencyKey 하드코딩 제거 — {@code response.orderNo()} 로 주문 조회.
     */
    @Test
    void confirm_failsoft_uses_list_price_when_price_calc_empty() {
        UUID productId = UUID.randomUUID();
        Mockito.when(productClient.lookup(Mockito.anyList()))
                .thenReturn(List.of(new ProductSummary(
                        productId, "헬로멀티 7kW", "HM-7000", null,
                        new BigDecimal("1500000"), "ACTIVE")));
        // price-calc fail-soft → 빈 Map
        Mockito.when(dcConfigClient.calculatePrices(Mockito.anyString(), Mockito.anyList()))
                .thenReturn(Map.of());

        ConfirmRequest request = new ConfirmRequest(List.of(
                new ConfirmLineRequest(productId, "homemulti", 1, null)));
        ConfirmResponse response = confirmService.confirm(
                "P-FS", "1234567890", "user-fs", null, null, request);

        assertThat(response.status()).isEqualTo("DRAFT");
        // P0-2: response.orderNo() 로 주문 조회 — idempotencyKey 하드코딩 제거
        UUID orderId = orderRepository.findByOrderNo(response.orderNo())
                .orElseThrow(() -> new AssertionError("confirm 후 주문을 찾을 수 없음: " + response.orderNo()))
                .getId();
        BigDecimal priceVat = jdbcTemplate.queryForObject(
                "SELECT price_vat FROM partner_order_lines WHERE partner_order_id = ?",
                BigDecimal.class, orderId);
        assertThat(priceVat).isEqualByComparingTo("1500000"); // listPrice
    }

    /**
     * P1-3: 다중 라인 부분 응답 — 2라인 중 lineId "0" 만 finalPrice 응답, "1" 누락.
     *
     * <p>누락된 라인("1")은 fail-soft 로 listPrice 를 사용해야 한다.
     * <ul>
     *   <li>라인0 price_vat = finalPrice (DC 적용 800,000)</li>
     *   <li>라인1 price_vat = listPrice (1,200,000, lineId "1" 미응답)</li>
     * </ul>
     */
    @Test
    void confirm_partial_price_calc_response_applies_finalPrice_to_matched_line_only() {
        UUID productId0 = UUID.randomUUID();
        UUID productId1 = UUID.randomUUID();

        Mockito.when(productClient.lookup(Mockito.anyList()))
                .thenReturn(List.of(
                        new ProductSummary(productId0, "헬로멀티 5kW", "HM-5000", null,
                                new BigDecimal("1000000"), "ACTIVE"),
                        new ProductSummary(productId1, "헬로멀티 8kW", "HM-8000", null,
                                new BigDecimal("1200000"), "ACTIVE")));

        // lineId "0" 만 finalPrice 반환, lineId "1" 누락 → fail-soft = listPrice
        Mockito.when(dcConfigClient.calculatePrices(Mockito.anyString(), Mockito.anyList()))
                .thenReturn(Map.of("0", new BigDecimal("800000")));

        ConfirmRequest request = new ConfirmRequest(List.of(
                new ConfirmLineRequest(productId0, "homemulti", 1, null),
                new ConfirmLineRequest(productId1, "commercialMulti", 1, null)));
        ConfirmResponse response = confirmService.confirm(
                "P-PARTIAL", "5555555555", "user-partial", null, null, request);

        assertThat(response.status()).isEqualTo("DRAFT");

        UUID orderId = orderRepository.findByOrderNo(response.orderNo())
                .orElseThrow(() -> new AssertionError("주문을 찾을 수 없음: " + response.orderNo()))
                .getId();

        // ORDER BY 에 의존하지 않고 product_id 로 각 라인을 직접 조회한다.
        // created_at 단독 / created_at+id(UUID) 정렬은 같은 트랜잭션 내 다중라인 INSERT 시 비결정적(flaky).
        // productId0 → lineId "0" → finalPrice=800,000 (DC 적용)
        // productId1 → lineId "1" → 미응답 → fail-soft → listPrice=1,200,000
        BigDecimal line0PriceVat = jdbcTemplate.queryForObject(
                "SELECT price_vat FROM partner_order_lines WHERE partner_order_id = ? AND product_id = ?",
                BigDecimal.class, orderId, productId0);
        BigDecimal line1PriceVat = jdbcTemplate.queryForObject(
                "SELECT price_vat FROM partner_order_lines WHERE partner_order_id = ? AND product_id = ?",
                BigDecimal.class, orderId, productId1);

        // 라인0 (productId0=HM-5000): finalPrice (DC 적용)
        assertThat(line0PriceVat).as("라인0 price_vat = finalPrice (DC 적용)").isEqualByComparingTo("800000");
        // 라인1 (productId1=HM-8000): listPrice (lineId "1" 누락 → fail-soft)
        assertThat(line1PriceVat).as("라인1 price_vat = listPrice (price-calc 누락 → fail-soft)").isEqualByComparingTo("1200000");
    }
}
