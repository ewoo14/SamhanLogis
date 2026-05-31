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
import com.samhanair.logis.partnerorder.revision.domain.PartnerOrderRevisionType;
import com.samhanair.logis.partnerorder.revision.service.PartnerOrderRevisionService;
import com.samhanair.logis.partnerorder.web.dto.ConfirmLineRequest;
import com.samhanair.logis.partnerorder.web.dto.ConfirmRequest;
import com.samhanair.logis.partnerorder.web.dto.ConfirmResponse;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
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
 *     ② M3 dc-config priceVat + M1a product 카탈로그 스냅샷
 *     ③ PartnerOrder.createFromConfirm → status=DRAFT, slipPublishStatus=NOT_REQUIRED
 *     ④ 라인 INSERT + recomputeTotal + save
 *     ⑤ history(CONFIRMED=주문접수) + revision CREATE 캡처
 *     ⑥ (slip 발행 없음)
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
    // Phase 2.6c: inventoryClient 제거 — confirm 단계는 재고 무영향 (주문 무영향 원칙).
    // inventoryClient 는 PartnerOrderConvertService 에서만 사용 (출고전표 전환 시 reserve).
    // 슬라이스 D1: slipServiceClient / outboxRepository 제거 — confirm 은 slip 미발행.

    private final PartnerOrderRevisionService revisionService;

    private final EntityManager entityManager;

    /**
     * 임시저장 → 확정 흐름. draftId 가 있으면 draft 의 draftSeq 를 idempotencyKey 시드로 사용.
     *
     * <p>슬라이스 D1: confirm 은 {@link PartnerOrder#createFromConfirm} 으로 DRAFT + NOT_REQUIRED 주문을
     * 생성하며 slip-service 를 호출하지 않는다. 출고전표는 명시적 convert 액션으로만 발행.
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

        // 2) M3 dc-config — server-side priceVat
        Map<String, Object> dcConfig = dcConfigClient.fetchDcConfig(partnerCode);

        // 3) M1a product — 카탈로그 조회 (라인 스냅샷 + 가격 산출)
        List<UUID> productIds = request.lines().stream()
                .map(ConfirmLineRequest::productId)
                .distinct()
                .toList();
        List<ProductSummary> products = productClient.lookup(productIds);
        Map<UUID, ProductSummary> productMap = new HashMap<>();
        for (ProductSummary p : products) {
            productMap.put(p.id(), p);
        }

        // 4) inventory reserve 제거 (Phase 2.6c — 주문 무영향 원칙)
        // confirm 단계에서는 재고 예약을 하지 않는다. 재고 예약은 "출고전표로 전환(convert)" 시점에만 발생.

        // 5) partner_order INSERT (DRAFT + NOT_REQUIRED — 슬라이스 D1)
        String orderNo = nextOrderNo();

        PartnerOrder order = PartnerOrder.createFromConfirm(
                partnerCode, bizCode, orderNo, idempotencyKey, BigDecimal.ZERO);

        for (ConfirmLineRequest line : request.lines()) {
            ProductSummary p = productMap.get(line.productId());
            if (p == null) {
                throw new BusinessException(ErrorCode.NOT_FOUND,
                        "제품 카탈로그 없음: " + line.productId());
            }
            BigDecimal priceVat = applyDc(p.sellingPrice(), line.categoryKey(), dcConfig);
            PartnerOrderLine entity = PartnerOrderLine.create(
                    p.id(), p.modelName(), p.name(), line.categoryKey(),
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

        return ConfirmResponse.from(order);
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
        entityManager.createNativeQuery("SELECT pg_advisory_xact_lock(hashtext(?1))")
                .setParameter(1, "partner_order_seq_" + datePrefix)
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
     * server-side DC 적용 — categoryKey 기반 할인율 매트릭스 (M3 가드 일관, client 가격 무시).
     * dc-config-service 응답이 비어있으면 sellingPrice 그대로.
     */
    private BigDecimal applyDc(BigDecimal sellingPrice, String categoryKey, Map<String, Object> dcConfig) {
        if (sellingPrice == null) {
            return BigDecimal.ZERO;
        }
        if (dcConfig == null || dcConfig.isEmpty()) {
            return sellingPrice;
        }
        String dcKey = mapCategoryToDcKey(categoryKey);
        Object raw = dcConfig.get(dcKey);
        if (!(raw instanceof Number num)) {
            return sellingPrice;
        }
        BigDecimal rate = BigDecimal.valueOf(num.doubleValue());
        BigDecimal multiplier = BigDecimal.ONE.subtract(rate);
        if (multiplier.signum() <= 0) {
            return BigDecimal.ZERO;
        }
        return sellingPrice.multiply(multiplier);
    }

    private String mapCategoryToDcKey(String categoryKey) {
        return switch (categoryKey) {
            case "homemulti", "homeDefaults" -> "homeDiscount";
            case "commercialMulti" -> "commDiscount";
            case "singleSets", "singleDefaults", "singleMatPrices" -> "singleDiscount";
            case "singleParts" -> "singlePartsDiscount";
            case "commercialParts" -> "commPartsDiscount";
            case "oldProducts" -> "oldDiscount";
            case "homeInc", "commInc", "singleInc", "singlePartsInc" -> "incDiscount";
            case "specDetailMap" -> "specDiscount";
            default -> "homeDiscount";
        };
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
