package com.samhanair.logis.inventory.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.inventory.domain.StockInstance;
import com.samhanair.logis.inventory.domain.StockInstanceStatus;
import com.samhanair.logis.inventory.domain.SourceOperationOutcome;
import com.samhanair.logis.inventory.repository.StockInstanceRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 개별시리얼 인스턴스 서비스 — S1 범위(입출고 전표 연동 없음). Phase INV-S / S1.
 *
 * <p>주요 기능:
 * <ul>
 *   <li>수동 인스턴스 생성 — serial-managed 품목 검증 후 {@link StockInstance#inbound} 팩토리 호출.</li>
 *   <li>S3 OUTBOUND 출고연동 — 전표 accept/complete/reject 생명주기에서 reserve/ship/release 배치 처리.</li>
 *   <li>FIFO 소진 후보 조회 — {@code received_at ASC}.</li>
 *   <li>역-FIFO 회수 후보 조회 — {@code outbound_at DESC}.</li>
 *   <li>회수품 재판매 — {@code RECALLED → AVAILABLE}.</li>
 *   <li>품목별 인스턴스 조회.</li>
 * </ul>
 *
 * <p>serial-managed 판정: {@link ProductClient#requireExists(UUID)} 로 product-service 를 호출하여
 * {@code serialManaged} 플래그를 확인한다. false 이면 batch 품목 ({@code stock_lots} 관리 대상)이므로
 * {@code 409 CONFLICT} 를 반환한다.
 *
 * <p>입출고 전표 연동(S2~S4)에서 {@link StockInstance#ship}, {@link StockInstance#recall},
 * {@link StockInstance#reserve} 등의 도메인 메서드를 호출한다(S1 범위 밖).
 */
@Service
@RequiredArgsConstructor
public class StockInstanceService {

    private final StockInstanceRepository repo;
    private final ProductClient productClient;

    private final SourceOperationJournalWriter sourceJournalWriter;

    @PersistenceContext
    private EntityManager entityManager;

    /**
     * 수동 인스턴스 생성 — serial-managed 품목만 허용. S2 입고 연동 전 토대.
     *
     * <p>product-service 에서 {@code serialManaged=false} 이면 batch 품목이므로 409 반환.
     * {@code serialManaged=true} 이면 {@link StockInstance#inbound} 팩토리로 AVAILABLE 인스턴스 생성.
     *
     * @param productId     제품 UUID
     * @param productCode   품목코드 그룹
     * @param warehouseId   입고 창고 UUID
     * @param inboundType   입고 구분(구매/차용, nullable)
     * @param unitCost      단위 원가 (nullable)
     * @param inboundSlipNo 입고전표 번호 (nullable)
     * @param receivedAt    입고일시 (null 이면 now() 사용)
     * @return 영속화된 StockInstance
     * @throws BusinessException 409(CONFLICT) — batch 품목(serialManaged=false) 인 경우
     */
    @Transactional
    public StockInstance create(UUID productId, String productCode, UUID warehouseId,
                                String inboundType, BigDecimal unitCost, String inboundSlipNo,
        LocalDateTime receivedAt) {
        ProductSummary product = productClient.requireExists(productId);
        if (isInventoryExcluded(product)) {
            return null; // 비상품/세트 SKU — 시리얼 인스턴스 미생성 no-op skip
        }
        if (!product.serialManaged()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "개별시리얼 관리 품목이 아닙니다 (batch 품목은 stock_lots 사용).");
        }
        return repo.save(StockInstance.inbound(
                productId, productCode, warehouseId,
                inboundType, receivedAt, unitCost, inboundSlipNo));
    }

    /**
     * 전표 입고 연동용 인스턴스 배치 생성 — serial-managed 품목 N개를 멱등 생성한다.
     *
     * <p>동일 {@code inboundSlipNo + productId} 로 이미 생성된 수량을 세고, 요청 수량보다 부족한
     * deficit 만큼만 {@link StockInstance#inbound} 팩토리로 추가 생성한다. 이미 목표 수량 이상이면
     * 추가 생성 없이 기존 인스턴스 목록을 반환한다.
     *
     * @param productId     제품 UUID
     * @param productCode   품목코드 그룹
     * @param warehouseId   입고 창고 UUID
     * @param quantity      생성 목표 수량
     * @param inboundType   입고 구분(구매/차용)
     * @param inboundSlipNo 입고전표 번호
     * @param unitCost      단위 원가
     * @param receivedAt    입고일시 (null 이면 도메인 팩토리에서 now 사용)
     * @return 기존 인스턴스와 신규 생성 인스턴스를 합친 목록
     * @throws BusinessException 409(CONFLICT) — batch 품목(serialManaged=false) 인 경우
     */
    @Transactional
    public List<StockInstance> inboundBatch(UUID productId, String productCode, UUID warehouseId,
                                            int quantity, String inboundType, String inboundSlipNo,
                                            BigDecimal unitCost, LocalDateTime receivedAt) {
        return inboundBatch(productId, productCode, warehouseId, quantity, inboundType, inboundSlipNo,
                unitCost, receivedAt, null);
    }

    @Transactional
    public List<StockInstance> inboundBatch(UUID productId, String productCode, UUID warehouseId,
                                            int quantity, String inboundType, String inboundSlipNo,
                                            BigDecimal unitCost, LocalDateTime receivedAt,
                                            com.samhanair.logis.inventory.web.dto.SourceOperationContext sourceContext) {
        ProductSummary product = productClient.requireExists(productId);
        if (isInventoryExcluded(product)) {
            recordSource(sourceContext, product, SourceOperationOutcome.NO_OP_EXCLUDED, List.of(), List.of());
            return List.of(); // 비상품/세트 SKU — 시리얼 인스턴스 미생성 no-op skip
        }
        if (!product.serialManaged()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "개별시리얼 관리 품목이 아닙니다 (batch 품목은 stock_lots 사용).");
        }

        lockInboundBatchKey(inboundSlipNo, productId);
        long existingCount = repo.countByInboundSlipAndProduct(inboundSlipNo, productId);
        List<StockInstance> existing = repo.findByInboundSlipAndProduct(inboundSlipNo, productId);
        if (existingCount >= quantity) {
            recordSource(sourceContext, product, SourceOperationOutcome.NO_OP_EXISTING, List.of(), List.of());
            return existing;
        }
        int deficit = quantity - Math.toIntExact(existingCount);

        List<StockInstance> toCreate = new ArrayList<>(deficit);
        for (int i = 0; i < deficit; i++) {
            toCreate.add(StockInstance.inbound(
                    productId, productCode, warehouseId,
                    inboundType, receivedAt, unitCost, inboundSlipNo));
        }
        List<StockInstance> saved = repo.saveAll(toCreate);
        List<StockInstance> result = new ArrayList<>(existing.size() + saved.size());
        result.addAll(existing);
        result.addAll(saved);
        recordSource(sourceContext, product, SourceOperationOutcome.APPLIED, List.of(),
                saved.stream().map(StockInstance::getId).filter(java.util.Objects::nonNull).toList());
        return result;
    }

    /**
     * OUTBOUND 전표 accept 연동용 인스턴스 FIFO 예약 — productCode + warehouse 범위에서 부족분만 RESERVED 처리한다.
     *
     * <p>동일 {@code outboundSlipNo + productCode} 로 이미 예약된 수량을 세고, 요청 수량보다 부족한
     * deficit 만큼만 received_at ASC 순서로 예약한다. batch 품목은 기존 수량 재고 경로 대상이므로 409 를 반환한다.
     *
     * @param productCode    품목코드 그룹
     * @param warehouseId    출고 원천 창고 UUID
     * @param quantity       예약 목표 수량
     * @param outboundSlipNo 출고전표 번호
     * @return 해당 전표가 점유한 RESERVED 인스턴스 목록
     * @throws BusinessException 409(CONFLICT) — batch 품목 또는 가용 인스턴스 부족
     */
    @Transactional
    public List<StockInstance> reserveBatch(String productCode, UUID warehouseId, int quantity,
                                            String outboundSlipNo) {
        ProductSummary product = productClient.requireExistsByCode(productCode);
        if (product != null && isInventoryExcluded(product)) {
            return List.of(); // 비상품/세트 SKU — 예약 인스턴스 미생성 no-op skip
        }
        if (!product.serialManaged()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "개별시리얼 관리 품목이 아닙니다 (batch 품목은 stock_lots 사용). productCode=" + productCode);
        }

        lockOutboundBatchKey(outboundSlipNo, productCode);
        long already = countReserved(outboundSlipNo, product, productCode);
        if (already >= quantity) {
            return findReserved(outboundSlipNo, product, productCode);
        }

        int deficit = quantity - Math.toIntExact(already);
        // advisory lock 키가 outboundSlipNo|productCode 이므로 다른 전표가 동일 warehouse/productCode 의
        // AVAILABLE 인스턴스를 동시 소진할 수 있다. count 와 실제 후보 목록의 TOCTOU 불일치로 인한
        // IndexOutOfBounds(500) 를 막기 위해, 후보 목록을 먼저 적재한 뒤 그 크기로 재고부족을 사전차단한다.
        List<StockInstance> candidates = findAvailable(product, productCode, warehouseId, deficit);
        if (candidates.size() < deficit) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "재고 부족 — 가용 인스턴스 " + candidates.size() + " < 필요 " + deficit
                            + " (productCode=" + productCode + ")");
        }
        for (int i = 0; i < deficit; i++) {
            candidates.get(i).reserve(outboundSlipNo);
        }
        return findReserved(outboundSlipNo, product, productCode);
    }

    /**
     * OUTBOUND 전표 complete 연동용 인스턴스 출고 — RESERVED 인스턴스를 SHIPPED 로 전이한다.
     *
     * @param outboundSlipNo 출고전표 번호
     * @param productCode    품목코드 그룹
     * @param partnerCode    출고 거래처 코드
     * @param outboundAt     출고일시(null 이면 도메인에서 현재 시각 기록)
     * @return 해당 전표로 SHIPPED 처리된 인스턴스 목록
     */
    @Transactional
    public List<StockInstance> shipBatch(String outboundSlipNo, String productCode,
                                         String partnerCode, LocalDateTime outboundAt) {
        return shipBatch(outboundSlipNo, productCode, partnerCode, outboundAt, null);
    }

    @Transactional
    public List<StockInstance> shipBatch(String outboundSlipNo, String productCode,
                                         String partnerCode, LocalDateTime outboundAt,
                                         com.samhanair.logis.inventory.web.dto.SourceOperationContext sourceContext) {
        ProductSummary product = productClient.requireExistsByCode(productCode);
        if (product != null && isInventoryExcluded(product)) {
            return List.of(); // 비상품/세트 SKU — 출고 인스턴스 미생성 no-op skip
        }
        List<StockInstance> reserved = product == null
                ? repo.findByOutboundSlipNoAndProductCodeAndStatus(
                        outboundSlipNo, productCode, StockInstanceStatus.RESERVED)
                : findReserved(outboundSlipNo, product, productCode);
        for (StockInstance instance : reserved) {
            instance.ship(partnerCode, outboundSlipNo, outboundAt);
        }
        recordSource(sourceContext, product,
                reserved.isEmpty() ? SourceOperationOutcome.NO_OP_EXISTING : SourceOperationOutcome.APPLIED,
                List.of(), List.of());
        return product == null
                ? repo.findByOutboundSlipNoAndProductCodeAndStatus(
                        outboundSlipNo, productCode, StockInstanceStatus.SHIPPED)
                : findBySlipAndStatus(outboundSlipNo, product, productCode, StockInstanceStatus.SHIPPED);
    }

    private void recordSource(com.samhanair.logis.inventory.web.dto.SourceOperationContext context,
                              ProductSummary product, SourceOperationOutcome outcome,
                              List<UUID> createdLotIds, List<UUID> createdInstanceIds) {
        sourceJournalWriter.record(context, product, outcome, createdLotIds, createdInstanceIds);
    }

    /**
     * OUTBOUND 전표 reject/cancel 연동용 인스턴스 예약 해제 — RESERVED 인스턴스를 AVAILABLE 로 복원한다.
     *
     * @param outboundSlipNo 출고전표 번호
     * @param productCode    품목코드 그룹
     * @return AVAILABLE 로 복원된 인스턴스 목록
     */
    @Transactional
    public List<StockInstance> releaseBatch(String outboundSlipNo, String productCode) {
        ProductSummary product = productClient.requireExistsByCode(productCode);
        if (product != null && isInventoryExcluded(product)) {
            return List.of(); // 비상품/세트 SKU — 예약 해제 인스턴스 미생성 no-op skip
        }
        List<StockInstance> reserved = product == null
                ? repo.findByOutboundSlipNoAndProductCodeAndStatus(
                        outboundSlipNo, productCode, StockInstanceStatus.RESERVED)
                : findReserved(outboundSlipNo, product, productCode);
        for (StockInstance instance : reserved) {
            instance.release();
        }
        return reserved;
    }

    /**
     * INBOUND 반품/회차 전표 complete 연동용 인스턴스 역-FIFO 회수 — SHIPPED 인스턴스를 RECALLED 로 전이한다.
     *
     * <p>동일 {@code recallSlipNo + productCode} 로 이미 회수된 수량을 세고, 요청 수량보다 부족한
     * deficit 만큼만 {@code outbound_at DESC} 역-FIFO 순서로 회수한다. 부족 판정은 후보 목록 크기
     * 하나로만 수행해 count/list TOCTOU 불일치로 인한 500 을 방지한다(S3 D-SER-11 교훈).
     *
     * @param partnerCode  출고 거래처 코드
     * @param productCode  품목코드 그룹
     * @param quantity     회수 목표 수량
     * @param recallSlipNo 회수 입고전표 번호
     * @return 해당 전표로 RECALLED 처리된 인스턴스 목록
     * @throws BusinessException 409(CONFLICT) — batch 품목 또는 회수 대상 부족
     */
    @Transactional
    public List<StockInstance> recallBatch(String partnerCode, String productCode,
                                           int quantity, String recallSlipNo) {
        ProductSummary product = productClient.requireExistsByCode(productCode);
        if (product != null && isInventoryExcluded(product)) {
            return List.of(); // 비상품/세트 SKU — 회수 인스턴스 미생성 no-op skip
        }
        if (!product.serialManaged()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "개별시리얼 관리 품목이 아닙니다 (batch 품목은 stock_lots 사용). productCode=" + productCode);
        }

        lockRecallBatchKey(recallSlipNo, productCode);
        long already = countRecalled(recallSlipNo, product, productCode);
        if (already >= quantity) {
            return findRecalled(recallSlipNo, product, productCode);
        }

        int deficit = quantity - Math.toIntExact(already);
        List<StockInstance> candidates = findShipped(product, productCode, partnerCode, deficit);
        if (candidates.size() < deficit) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "회수 대상 부족 — 출고 인스턴스 " + candidates.size() + " < 필요 " + deficit
                            + " (partnerCode=" + partnerCode + ", productCode=" + productCode + ")");
        }
        for (int i = 0; i < deficit; i++) {
            candidates.get(i).recall(recallSlipNo);
        }
        return findRecalled(recallSlipNo, product, productCode);
    }

    private long countReserved(String outboundSlipNo, ProductSummary product, String productCode) {
        long byProductId = repo.countByOutboundSlipNoAndProductIdAndStatus(
                outboundSlipNo, product.id(), StockInstanceStatus.RESERVED);
        return byProductId > 0 ? byProductId
                : repo.countByOutboundSlipNoAndProductCodeAndStatus(
                        outboundSlipNo, productCode, StockInstanceStatus.RESERVED);
    }

    private List<StockInstance> findReserved(String outboundSlipNo, ProductSummary product, String productCode) {
        return findBySlipAndStatus(outboundSlipNo, product, productCode, StockInstanceStatus.RESERVED);
    }

    private List<StockInstance> findBySlipAndStatus(String outboundSlipNo, ProductSummary product,
                                                    String productCode, StockInstanceStatus status) {
        List<StockInstance> byProductId = repo.findByOutboundSlipNoAndProductIdAndStatus(
                outboundSlipNo, product.id(), status);
        return byProductId.isEmpty()
                ? repo.findByOutboundSlipNoAndProductCodeAndStatus(outboundSlipNo, productCode, status)
                : byProductId;
    }

    private List<StockInstance> findAvailable(ProductSummary product, String productCode,
                                              UUID warehouseId, int deficit) {
        List<StockInstance> byProductId = repo.findByProductIdAndWarehouseIdAndStatusOrderByReceivedAtAscForUpdate(
                product.id(), warehouseId, StockInstanceStatus.AVAILABLE, PageRequest.of(0, deficit));
        return byProductId.isEmpty()
                ? repo.findByProductCodeAndWarehouseIdAndStatusOrderByReceivedAtAscForUpdate(
                        productCode, warehouseId, StockInstanceStatus.AVAILABLE, PageRequest.of(0, deficit))
                : byProductId;
    }

    private long countRecalled(String recallSlipNo, ProductSummary product, String productCode) {
        long byProductId = repo.countByRecallSlipNoAndProductIdAndStatus(
                recallSlipNo, product.id(), StockInstanceStatus.RECALLED);
        return byProductId > 0 ? byProductId
                : repo.countByRecallSlipNoAndProductCodeAndStatus(
                        recallSlipNo, productCode, StockInstanceStatus.RECALLED);
    }

    private List<StockInstance> findRecalled(String recallSlipNo, ProductSummary product, String productCode) {
        List<StockInstance> byProductId = repo.findByRecallSlipNoAndProductIdAndStatus(
                recallSlipNo, product.id(), StockInstanceStatus.RECALLED);
        return byProductId.isEmpty()
                ? repo.findByRecallSlipNoAndProductCodeAndStatus(
                        recallSlipNo, productCode, StockInstanceStatus.RECALLED)
                : byProductId;
    }

    private List<StockInstance> findShipped(ProductSummary product, String productCode,
                                             String partnerCode, int deficit) {
        List<StockInstance> byProductId = repo
                .findByOutboundPartnerCodeAndProductIdAndStatusOrderByOutboundAtDescIdAscForUpdate(
                        partnerCode, product.id(), StockInstanceStatus.SHIPPED, PageRequest.of(0, deficit));
        return byProductId.isEmpty()
                ? repo.findByOutboundPartnerCodeAndProductCodeAndStatusOrderByOutboundAtDescIdAscForUpdate(
                        partnerCode, productCode, StockInstanceStatus.SHIPPED, PageRequest.of(0, deficit))
                : byProductId;
    }

    /**
     * INBOUND 반품/회차 전표 complete 보상용 회수 취소 — RECALLED 인스턴스를 SHIPPED 로 되돌린다.
     *
     * <p>{@code recallSlipNo + productCode} 로 해당 전표가 회수한 인스턴스만 특정한다.
     * outbound 마커는 도메인 전이에서 유지되어 재보상 또는 재회수 후보로 남는다.
     *
     * @param recallSlipNo 회수 입고전표 번호
     * @param productCode  품목코드 그룹
     * @return SHIPPED 로 복원된 인스턴스 목록
     */
    @Transactional
    public List<StockInstance> unrecallBatch(String recallSlipNo, String productCode) {
        ProductSummary product = productClient.requireExistsByCode(productCode);
        if (product != null && isInventoryExcluded(product)) {
            return List.of(); // 비상품/세트 SKU — 되돌림 인스턴스 미생성 no-op skip
        }
        lockRecallBatchKey(recallSlipNo, productCode);
        // BE 리뷰 P1: ForUpdate row lock — unrecall-batch endpoint 직접 동시호출 시 같은 RECALLED 행 중복 전이 방지
        List<StockInstance> recalled = findRecalledForUpdate(recallSlipNo, product, productCode);
        for (StockInstance instance : recalled) {
            instance.unrecall();
        }
        return recalled;
    }

    /**
     * 회수품 재판매 배치 — RECALLED 인스턴스를 AVAILABLE 로 복귀시킨다.
     *
     * <p>{@code recallSlipNo + productCode} 키로 advisory lock 을 잡고, 같은 키의 RECALLED 후보를
     * 요청 수량만큼 {@code FOR UPDATE} 로 잠근다. 후보 수가 요청 수량보다 작으면 아무 상태도 바꾸지 않고
     * 409 를 반환한다. 이미 재판매되어 AVAILABLE 로 바뀐 인스턴스는 RECALLED 후보에서 제외되므로
     * 동일 요청 재호출은 부족 409 로 수렴한다.
     *
     * @param recallSlipNo 회수 입고전표 번호
     * @param productCode  품목코드 그룹
     * @param quantity     재판매 목표 수량
     * @param actorUserId  처리 담당자 user-id (현재 상태 전이는 BaseEntity 감사 필드로 추적)
     * @return AVAILABLE 로 복귀된 인스턴스 목록
     * @throws BusinessException 409(CONFLICT) — batch 품목 또는 재판매 후보 부족
     */
    @Transactional
    public List<StockInstance> resellBatch(String recallSlipNo, String productCode,
                                           int quantity, String actorUserId) {
        ProductSummary product = productClient.requireExistsByCode(productCode);
        if (product != null && isInventoryExcluded(product)) {
            return List.of(); // 비상품/세트 SKU — 재판매 되돌림 인스턴스 미생성 no-op skip
        }
        if (!product.serialManaged()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "개별시리얼 관리 품목이 아닙니다 (batch 품목은 stock_lots 사용). productCode=" + productCode);
        }

        lockRecallBatchKey(recallSlipNo, productCode);
        List<StockInstance> candidates = findRecalledForUpdate(
                recallSlipNo, product, productCode, PageRequest.of(0, quantity));
        if (candidates.size() < quantity) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "재판매 대상 부족 — 회수 인스턴스 " + candidates.size() + " < 필요 " + quantity
                            + " (recallSlipNo=" + recallSlipNo + ", productCode=" + productCode + ")");
        }
        for (StockInstance instance : candidates) {
            instance.resell();
        }
        return candidates;
    }

    private List<StockInstance> findRecalledForUpdate(String recallSlipNo, ProductSummary product,
                                                       String productCode) {
        if (product == null) {
            return repo.findByRecallSlipNoAndProductCodeAndStatusForUpdate(
                    recallSlipNo, productCode, StockInstanceStatus.RECALLED);
        }
        List<StockInstance> byProductId = repo.findByRecallSlipNoAndProductIdAndStatusForUpdate(
                recallSlipNo, product.id(), StockInstanceStatus.RECALLED);
        return byProductId.isEmpty()
                ? repo.findByRecallSlipNoAndProductCodeAndStatusForUpdate(
                        recallSlipNo, productCode, StockInstanceStatus.RECALLED)
                : byProductId;
    }

    private List<StockInstance> findRecalledForUpdate(String recallSlipNo, ProductSummary product,
                                                       String productCode, PageRequest pageable) {
        if (product == null) {
            return repo.findByRecallSlipNoAndProductCodeAndStatusForUpdate(
                    recallSlipNo, productCode, StockInstanceStatus.RECALLED, pageable);
        }
        List<StockInstance> byProductId = repo.findByRecallSlipNoAndProductIdAndStatusForUpdate(
                recallSlipNo, product.id(), StockInstanceStatus.RECALLED, pageable);
        return byProductId.isEmpty()
                ? repo.findByRecallSlipNoAndProductCodeAndStatusForUpdate(
                        recallSlipNo, productCode, StockInstanceStatus.RECALLED, pageable)
                : byProductId;
    }

    private void lockInboundBatchKey(String inboundSlipNo, UUID productId) {
        lockBatchKey(inboundSlipNo + "|" + productId);
    }

    private void lockOutboundBatchKey(String outboundSlipNo, String productCode) {
        lockBatchKey(outboundSlipNo + "|" + productCode);
    }

    private void lockRecallBatchKey(String recallSlipNo, String productCode) {
        lockBatchKey(recallSlipNo + "|" + productCode);
    }

    /**
     * 재고 제외 품목 여부 — 비상품과 세트 SKU 는 시리얼 인스턴스를 생성하지 않고 no-op skip 한다.
     * 세트는 구성품(SINGLE)만 재고 대상이다.
     */
    private boolean isInventoryExcluded(ProductSummary product) {
        return InventoryProductGate.isExcluded(product);
    }

    private void lockBatchKey(String lockKey) {
        if (entityManager == null) {
            return;
        }
        entityManager
                .createNativeQuery("SELECT pg_advisory_xact_lock(CAST(hashtext(:lockKey) AS bigint))")
                .setParameter("lockKey", lockKey)
                .getSingleResult();
    }

    /**
     * FIFO 소진 후보 조회 — 품목코드 기준 AVAILABLE 인스턴스를 received_at ASC 순으로 반환.
     *
     * @param productCode 품목코드 그룹
     * @return received_at 오름차순 인스턴스 목록
     */
    @Transactional(readOnly = true)
    public List<StockInstance> fifoCandidates(String productCode) {
        ProductSummary product = productClient.requireExistsByCode(productCode);
        List<StockInstance> byProductId = repo.findByProductIdAndStatusOrderByReceivedAtAsc(
                product.id(), StockInstanceStatus.AVAILABLE);
        return byProductId.isEmpty()
                ? repo.findByProductCodeAndStatusOrderByReceivedAtAsc(
                        productCode, StockInstanceStatus.AVAILABLE)
                : byProductId;
    }

    /**
     * 역-FIFO 회수 후보 조회 — 거래처+품목코드 기준 SHIPPED 인스턴스를 outbound_at DESC 순으로 반환.
     *
     * @param partnerCode 거래처 코드
     * @param productCode 품목코드 그룹
     * @return outbound_at 내림차순 인스턴스 목록
     */
    @Transactional(readOnly = true)
    public List<StockInstance> recallCandidates(String partnerCode, String productCode) {
        ProductSummary product = productClient.requireExistsByCode(productCode);
        List<StockInstance> byProductId = repo
                .findByOutboundPartnerCodeAndProductIdAndStatusOrderByOutboundAtDescIdAsc(
                        partnerCode, product.id(), StockInstanceStatus.SHIPPED);
        return byProductId.isEmpty()
                ? repo.findByOutboundPartnerCodeAndProductCodeAndStatusOrderByOutboundAtDescIdAsc(
                        partnerCode, productCode, StockInstanceStatus.SHIPPED)
                : byProductId;
    }

    /** UUID가 아닌 사용자 노출용 시리얼키로 활성 인스턴스를 조회한다. */
    @Transactional(readOnly = true)
    public StockInstance bySerialKey(String serialKey) {
        return repo.findBySerialKey(serialKey)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "재고 인스턴스 시리얼키를 찾을 수 없습니다: " + serialKey));
    }

    /**
     * 품목별 인스턴스 조회 — productId + 상태 필터.
     *
     * <p>status 지정 시 {@code findByProductIdAndStatus} 로 인덱스 사용.
     * status 미지정(null) 시 {@code findByProductId} 로 {@code ix_stock_instances_product} 인덱스 사용.
     * (이전 {@code findAll().filter()} 전체 스캔 제거 — BE P0-2 / DevOps F-1 수정)
     *
     * @param productId 제품 UUID
     * @param status    조회할 상태 (null 이면 전체 상태 조회)
     * @return 인스턴스 목록 (soft-delete 자동 필터)
     */
    @Transactional(readOnly = true)
    public List<StockInstance> byProduct(UUID productId, StockInstanceStatus status) {
        if (status != null) {
            return repo.findByProductIdAndStatus(productId, status);
        }
        // status null 시 ix_stock_instances_product(product_id) 인덱스 활용
        return repo.findByProductId(productId);
    }
}
