package com.samhanair.logis.partnerorder.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.client.DcConfigClient;
import com.samhanair.logis.partnerorder.client.ProductClient;
import com.samhanair.logis.partnerorder.client.ProductSummary;
import com.samhanair.logis.partnerorder.domain.HistoryEventType;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderDraft;
import com.samhanair.logis.partnerorder.domain.PartnerOrderHistory;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import com.samhanair.logis.partnerorder.repository.PartnerOrderDraftRepository;
import com.samhanair.logis.partnerorder.repository.PartnerOrderHistoryRepository;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.realtime.PartnerOrderBoardChangePublisher;
import com.samhanair.logis.partnerorder.revision.domain.PartnerOrderRevisionType;
import com.samhanair.logis.partnerorder.revision.service.PartnerOrderRevisionService;
import com.samhanair.logis.partnerorder.web.dto.ConfirmLineRequest;
import com.samhanair.logis.partnerorder.web.dto.ConfirmRequest;
import com.samhanair.logis.partnerorder.web.dto.ConfirmResponse;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 주문 확정 서비스 — 슬라이스 D1 이후 confirm 은 slip 미발행 DRAFT 주문만 생성한다.
 *
 * <pre>
 *   POST /confirm
 *     ① 멱등 가드 (findByIdempotencyKey)
 *     ② dc-config price-calc (POST /internal/price-calculations) 로 라인별 finalPrice 계산
 *        └ 실패/404/5xx → fail-soft (listPrice 사용)
 *     ③ M1a product 카탈로그 스냅샷
 *     ④ PartnerOrder.createFromConfirm → status=DRAFT, slipPublishStatus=NOT_REQUIRED
 *     ⑤ 라인 INSERT (priceVat=finalPrice else listPrice) + recomputeTotal + save
 *     ⑥ history(CONFIRMED=주문접수) + revision CREATE 캡처
 *     ⑦ (slip 발행 없음)
 *   → ConfirmResponse{ orderNo, status=DRAFT, slipNo=null }
 * </pre>
 *
 * <p>출고전표는 이후 명시적 convert 액션({@code PartnerOrderConvertService})으로만 발행된다.
 *
 * <p>UUID 비공개 가드 — 응답 ConfirmResponse 는 orderNo 만 사용자 노출.
 */
@Service
@RequiredArgsConstructor
public class PartnerOrderConfirmService {

    private static final Logger log = LoggerFactory.getLogger(PartnerOrderConfirmService.class);
    private static final DateTimeFormatter ORDER_NO_DATE = DateTimeFormatter.ofPattern("yyyy/MM/dd");
    /** legacy 동작 — 향후 슬라이스에서 partner-warehouse 분기. */
    private static final UUID DEFAULT_WAREHOUSE_ID =
            UUID.fromString("00000000-0000-0000-0000-000000000001");

    private final PartnerOrderRepository orderRepository;
    private final PartnerOrderDraftRepository draftRepository;
    private final PartnerOrderHistoryRepository historyRepository;

    private final DcConfigClient dcConfigClient;
    private final ProductClient productClient;
    private final PartnerOrderPartnerIdentityResolver partnerIdentityResolver;
    // Phase 2.6c: inventoryClient 제거 — confirm 단계는 재고 무영향 (주문 무영향 원칙).
    // inventoryClient 는 PartnerOrderConvertService 에서만 사용 (출고전표 전환 시 reserve).
    // 슬라이스 D1: slipServiceClient / outboxRepository 제거 — confirm 은 slip 미발행.

    private final PartnerOrderRevisionService revisionService;
    private final PartnerOrderBoardChangePublisher boardChangePublisher;

    private final EntityManager entityManager;

    /**
     * 임시저장 → 확정 흐름. draftId 가 있으면 draft 의 draftSeq 를 idempotencyKey 시드로 사용.
     *
     * <p>슬라이스 D1: confirm 은 {@link PartnerOrder#createFromConfirm} 으로 DRAFT + NOT_REQUIRED 주문을
     * 생성하며 slip-service 를 호출하지 않는다. 출고전표는 명시적 convert 액션으로만 발행.
     *
     * <p>DC 단가 계산: {@link DcConfigClient#calculatePrices} (POST /internal/price-calculations) 로
     * 라인별 finalPrice 를 받아 priceVat 에 적용한다. fail-soft 적용 — price-calc 실패 시 listPrice 사용.
     *
     * <p>주문 저장 성공 후 {@link PartnerOrderRevisionService#capture} 로 CREATE 유형 revision 을
     * 트랜잭션 내에서 캡처한다 (Phase 2.4 버전이력 훅).
     *
     * @param partnerCode 거래처 코드 (JWT)
     * @param bizCode 사업자번호
     * @param actorUserId X-User-Id (헤더)
     * @param actorName X-User-Name (헤더, UUID 비공개 가드 적용 전 원본)
     * @param draftId 임시저장 UUID (legacy 흐름 — saveOrderSnapshot 후 sendOrderFromUi)
     * @param request 라인 (가격은 무시 — server-side DC 적용)
     * @return ConfirmResponse — status=DRAFT, slipNo=null
     */
    @Transactional
    public ConfirmResponse confirm(String partnerCode, String bizCode, String actorUserId,
                                   String actorName, UUID draftId, ConfirmRequest request) {
        if (partnerCode == null || partnerCode.isBlank()) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "partnerCode 필수");
        }
        if (bizCode == null || bizCode.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "bizCode 필수");
        }

        // 1) draft 검증 + draftSeq 추출 (idempotencyKey 시드)
        // partnerCode 별 draftSeq 시퀀스가 독립이므로 idempotencyKey 도 partnerCode 로 격리
        // (PR #76 회고 — 다른 partner 의 동일 draftSeq 가 동일 idemKey 로 collide 되어 IT
        // race condition 발생).
        long draftSeq = resolveDraftSeq(partnerCode, draftId);
        String idempotencyKey = "PO-CONF-" + partnerCode + "-" + draftSeq;

        // 멱등 검사 — 이미 확정된 키면 기존 결과 반환 (재호출 가드)
        var existing = orderRepository.findByIdempotencyKey(idempotencyKey);
        if (existing.isPresent()) {
            log.info("Idempotency hit: idemKey={} → 기존 주문 반환", idempotencyKey);
            return ConfirmResponse.from(existing.get());
        }

        // 신규 주문은 생성 시점의 활성 거래처 UUID를 snapshot한다. 코드 재사용 후에도
        // 이 주문은 당시 거래처 정체성을 잃지 않도록 partnerCode만 저장하지 않는다.
        UUID partnerId = partnerIdentityResolver.requirePartnerId(partnerCode, bizCode);

        // 2) M1a product — 카탈로그 조회 (라인 스냅샷 + 가격 산출)
        List<UUID> productIds = request.lines().stream()
                .map(ConfirmLineRequest::productId)
                .distinct()
                .toList();
        List<ProductSummary> products = productClient.lookup(productIds);
        Map<UUID, BigDecimal> fixedDiscountRates = productClient.lookupFixedDiscountRates(productIds);
        if (fixedDiscountRates == null) {
            fixedDiscountRates = Map.of();
        }
        Map<UUID, ProductSummary> productMap = new HashMap<>();
        for (ProductSummary p : products) {
            productMap.put(p.id(), p);
        }

        // 3) price-calc 요청 빌드 (라인 index 를 lineId 로)
        List<DcConfigClient.PriceLine> priceLines = new ArrayList<>();
        List<ConfirmLineRequest> reqLines = request.lines();
        for (int i = 0; i < reqLines.size(); i++) {
            ConfirmLineRequest line = reqLines.get(i);
            ProductSummary p = productMap.get(line.productId());
            if (p == null) {
                throw new BusinessException(ErrorCode.NOT_FOUND, "제품 카탈로그 없음: " + line.productId());
            }
            String discountFlags = resolveDiscountFlags(p);
            BigDecimal fixedDiscountRate = p.fixedDiscountRate() != null
                    ? p.fixedDiscountRate()
                    : fixedDiscountRates.get(p.id());
            BigDecimal listPrice = resolveListPrice(p, line.categoryKey(), fixedDiscountRate);
            if (listPrice == null || listPrice.signum() <= 0) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                        "확정 가격 기준가 없음: " + modelCodeSnapshot(p));
            }
            priceLines.add(new DcConfigClient.PriceLine(
                    String.valueOf(i), modelCodeSnapshot(p), listPrice,
                    mapCategory(line.categoryKey()), line.quantity(),
                    discountFlag(discountFlags, 0), discountFlag(discountFlags, 1),
                    discountFlag(discountFlags, 2), discountFlag(discountFlags, 3),
                    discountFlag(discountFlags, 4), discountFlag(discountFlags, 5),
                    fixedDiscountRate, variableDiscountEnabled(p)));
        }
        Map<String, BigDecimal> finalPrices = dcConfigClient.calculatePrices(partnerCode, priceLines);

        // 4) inventory reserve 제거 (Phase 2.6c — 주문 무영향 원칙)
        // confirm 단계에서는 재고 예약을 하지 않는다. 재고 예약은 "출고전표로 전환(convert)" 시점에만 발생.

        // 5) partner_order INSERT (DRAFT + NOT_REQUIRED — 슬라이스 D1)
        String orderNo = nextOrderNo();

        PartnerOrder order = PartnerOrder.createFromConfirm(
                partnerId, partnerCode, bizCode, orderNo, idempotencyKey, BigDecimal.ZERO);

        for (int i = 0; i < reqLines.size(); i++) {
            ConfirmLineRequest line = reqLines.get(i);
            ProductSummary p = productMap.get(line.productId());
            BigDecimal listPrice = resolveListPrice(p, line.categoryKey(),
                    p.fixedDiscountRate() != null ? p.fixedDiscountRate() : fixedDiscountRates.get(p.id()));
            BigDecimal priceVat = finalPrices.getOrDefault(String.valueOf(i), listPrice);
            if (priceVat == null || priceVat.signum() <= 0) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                        "확정 최종 단가가 0원입니다: " + modelCodeSnapshot(p));
            }
            // 주문 라인 modelName 컬럼은 화면 표시 modelCode snapshot 으로 사용한다.
            String lineModelCode = modelCodeSnapshot(p);
            PartnerOrderLine entity = PartnerOrderLine.create(
                    p.id(), lineModelCode, p.name(), line.categoryKey(),
                    line.quantity(), priceVat, line.remark());
            order.addLine(entity); // totalAmount 자동 누적
        }
        order.recomputeTotal();
        order = orderRepository.save(order);
        historyRepository.save(PartnerOrderHistory.ofOrder(
                order.getId(), partnerCode, HistoryEventType.CONFIRMED,
                actorUserId, "{\"orderNo\":\"" + orderNo + "\"}"));

        // 6) slip 발행 없음 — 슬라이스 D1 confirm 자동발행 폐지 (D-CF-02).
        // 출고전표는 본사 데스크톱의 명시적 convert 액션(PartnerOrderConvertService)으로만 발행.

        // Phase 2.4 버전이력 훅 — confirm 은 PartnerOrder 를 신규 INSERT 하는 경로이므로 CREATE 캡처.
        UUID actorId = parseActorId(actorUserId);
        revisionService.capture(order, PartnerOrderRevisionType.CREATE, null,
                actorId, actorName, null);
        publishListChanged();

        return ConfirmResponse.from(order);
    }

    private void publishListChanged() {
        if (boardChangePublisher != null) {
            boardChangePublisher.publishListChanged("CREATED");
        }
    }

    /**
     * draft 가 있으면 draftSeq 반환, 없으면 partner 별 MAX+1.
     */
    private long resolveDraftSeq(String partnerCode, UUID draftId) {
        if (draftId != null) {
            PartnerOrderDraft draft = draftRepository.findById(draftId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "임시저장을 찾을 수 없습니다"));
            if (!draft.getPartnerCode().equals(partnerCode)) {
                throw new BusinessException(ErrorCode.FORBIDDEN, "본인 거래처 임시저장만 확정 가능");
            }
            return draft.getDraftSeq();
        }
        return draftRepository.findMaxDraftSeqByPartnerCode(partnerCode) + 1L;
    }

    /** 사용자 표시 주문번호 — 날짜별 마지막 순번 + 1, 공개 업무번호 표준({@code yyyy/MM/dd-N}). */
    private String nextOrderNo() {
        String datePrefix = LocalDate.now().format(ORDER_NO_DATE);
        entityManager.createNativeQuery("SELECT pg_advisory_xact_lock(CAST(hashtext(?1) AS bigint))")
                .setParameter(1, "partner_order_no_seq_" + datePrefix)
                .getSingleResult();
        int maxSeq = 0;
        for (PartnerOrder order : orderRepository.findAllByOrderNoStartingWith(datePrefix)) {
            maxSeq = Math.max(maxSeq, extractOrderSeq(datePrefix, order.getOrderNo()));
        }
        return datePrefix + "-" + (maxSeq + 1);
    }

    private int extractOrderSeq(String datePrefix, String orderNo) {
        if (orderNo == null || !orderNo.startsWith(datePrefix)) {
            return 0;
        }
        String suffix = orderNo.substring(datePrefix.length()).trim();
        if (suffix.startsWith("-")) {
            suffix = suffix.substring(1).trim();
        }
        if (suffix.startsWith("V")) {
            suffix = suffix.substring(1).trim();
        }
        try {
            return Integer.parseInt(suffix);
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    /**
     * ConfirmLineRequest.categoryKey → price-calc category (HOMEMULTI/COMMERCIAL_MULTI/OTHER).
     *
     * <p>매핑 규칙:
     * <ul>
     *   <li>{@code homemulti} / {@code homeDefaults} → {@code HOMEMULTI}</li>
     *   <li>{@code commercialMulti} → {@code COMMERCIAL_MULTI}</li>
     *   <li>그 외 모든 값 (singleSets / commercialParts / oldProducts 등) → {@code OTHER}</li>
     * </ul>
     *
     * <p><b>주의</b>: {@code OTHER} 카테고리는 dc-config-service 에서 rate DC 미적용 대상이다.
     * 옵션 품목 / 단품 DC 는 후속 슬라이스에서 별도 category 신설 예정
     * (현 confirm 라인 한계 — P1-3 후속).
     *
     * @param categoryKey legacy 카테고리 키 (homemulti / commercialMulti / ...)
     * @return price-calc 카테고리 문자열 (HOMEMULTI / COMMERCIAL_MULTI / OTHER)
     */
    private String mapCategory(String categoryKey) {
        if (categoryKey == null) {
            return "OTHER";
        }
        return switch (categoryKey) {
            case "homemulti", "homeDefaults" -> "HOMEMULTI";
            case "commercialMulti" -> "COMMERCIAL_MULTI";
            default -> "OTHER";
        };
    }

    private String modelCodeSnapshot(ProductSummary product) {
        if (product.modelCode() != null && !product.modelCode().isBlank()) {
            return product.modelCode().trim();
        }
        return product.modelName();
    }

    /** Product.discountFlags 의 6비트 순서(is360 ... isFirstGrade)를 계산 요청으로 전사한다. */
    private boolean discountFlag(String flags, int index) {
        return flags != null && flags.length() > index && flags.charAt(index) == '1';
    }

    /**
     * 새 product summary의 저장 비트셋을 우선하고, 구형 product-service 응답에는 모델 규칙을 보완한다.
     * 구형 응답도 AM360 같은 실제 360 품목을 false로 소거하지 않기 위한 호환 경로다.
     */
    private String resolveDiscountFlags(ProductSummary product) {
        if (product.discountFlags() != null
                && product.discountFlags().matches("[01]{6}")
                && product.discountFlags().chars().anyMatch(ch -> ch == '1')) {
            return product.discountFlags();
        }
        String model = String.valueOf(modelCodeSnapshot(product)).toUpperCase(java.util.Locale.ROOT);
        // 구형 product-service 응답에는 discountFlags 자체가 없다. 기존 AM360 호환 호출자는
        // 모델 토큰으로 360 옵션을 식별하던 계약이므로 그 경로만 보존한다. 실제 응답의
        // "000000"은 아래 order-app getModelFlags 규칙으로 재판정한다.
        if (product.discountFlags() == null && model.contains("360")) {
            return "100000";
        }
        boolean is360 = false;
        boolean is4Way = false;
        boolean is1Way = false;
        boolean isStand = false;
        boolean isDeluxe = false;
        boolean isFirstGrade = false;
        if (model.startsWith("AC") && model.length() >= 9) {
            is360 = model.charAt(7) == '6' && model.charAt(8) == 'P';
            is4Way = model.charAt(7) == '4' && (model.charAt(8) == 'P' || model.charAt(8) == 'D');
            is1Way = model.charAt(7) == '1' && (model.charAt(8) == 'P' || model.charAt(8) == 'D');
        }
        if (model.startsWith("AP") && model.length() >= 9) {
            if (model.length() >= 11 && model.charAt(10) == 'C') {
                isStand = model.charAt(8) == 'D';
            } else {
                isStand = model.charAt(8) == 'P';
            }
            if (model.length() >= 11 && model.charAt(8) == 'D' && model.charAt(10) == 'H') {
                isDeluxe = true;
            }
            if (model.startsWith("AP230") || model.startsWith("AP290")) {
                isStand = true;
                isDeluxe = false;
            }
        }
        if ((model.startsWith("AC") || model.startsWith("AP"))
                && model.length() >= 9 && model.charAt(8) == 'F') {
            isFirstGrade = true;
        }
        return (is360 ? "1" : "0")
                + (is4Way ? "1" : "0")
                + (is1Way ? "1" : "0")
                + (isStand ? "1" : "0")
                + (isDeluxe ? "1" : "0")
                + (isFirstGrade ? "1" : "0");
    }

    /** 화면의 카탈로그 계산이 사용한 원금. 멀티는 변동DC/고정DC가 있을 때 releasePrice를 쓴다. */
    private BigDecimal resolveListPrice(ProductSummary product, String categoryKey,
                                        BigDecimal fixedDiscountRate) {
        boolean multi = "homemulti".equals(categoryKey) || "homeDefaults".equals(categoryKey)
                || "commercialMulti".equals(categoryKey);
        BigDecimal primary;
        if (multi) {
            primary = fixedDiscountRate != null || variableDiscountEnabled(product)
                    ? product.releasePrice() : product.deliveryPrice();
        } else if ("oldProducts".equals(categoryKey)) {
            primary = product.releasePrice();
        } else {
            primary = product.deliveryPrice();
        }
        if (primary != null && primary.signum() > 0) {
            return primary;
        }
        return product.sellingPrice();
    }

    /** null은 구형 product-service 응답의 변동DC 정보 부재를 뜻하므로 기존 rate 계약을 유지한다. */
    private boolean variableDiscountEnabled(ProductSummary product) {
        return product.hasVariableDiscount() == null || product.hasVariableDiscount();
    }

    /**
     * actorUserId 문자열을 UUID 로 변환한다. 파싱 실패 시 zero UUID 를 반환한다.
     *
     * @param actorUserId X-User-Id 헤더 문자열 (null 허용)
     * @return 파싱된 UUID 또는 zero UUID
     */
    private UUID parseActorId(String actorUserId) {
        if (actorUserId == null || actorUserId.isBlank()) {
            return new UUID(0L, 0L);
        }
        try {
            return UUID.fromString(actorUserId);
        } catch (IllegalArgumentException ex) {
            return new UUID(0L, 0L);
        }
    }
}
