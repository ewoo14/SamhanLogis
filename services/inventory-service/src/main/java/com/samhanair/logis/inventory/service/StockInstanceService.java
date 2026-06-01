package com.samhanair.logis.inventory.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.inventory.domain.StockInstance;
import com.samhanair.logis.inventory.domain.StockInstanceStatus;
import com.samhanair.logis.inventory.repository.StockInstanceRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 개별시리얼 인스턴스 서비스 — S1 범위(입출고 전표 연동 없음). Phase INV-S / S1.
 *
 * <p>주요 기능:
 * <ul>
 *   <li>수동 인스턴스 생성 — serial-managed 품목 검증 후 {@link StockInstance#inbound} 팩토리 호출.</li>
 *   <li>FIFO 소진 후보 조회 — {@code received_at ASC}.</li>
 *   <li>역-FIFO 회수 후보 조회 — {@code outbound_at DESC}.</li>
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
        if (!product.serialManaged()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "개별시리얼 관리 품목이 아닙니다 (batch 품목은 stock_lots 사용). productId=" + productId);
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
        ProductSummary product = productClient.requireExists(productId);
        if (!product.serialManaged()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "개별시리얼 관리 품목이 아닙니다 (batch 품목은 stock_lots 사용). productId=" + productId);
        }

        lockInboundBatchKey(inboundSlipNo, productId);
        long existingCount = repo.countByInboundSlipAndProduct(inboundSlipNo, productId);
        List<StockInstance> existing = repo.findByInboundSlipAndProduct(inboundSlipNo, productId);
        if (existingCount >= quantity) {
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
        return result;
    }

    private void lockInboundBatchKey(String inboundSlipNo, UUID productId) {
        if (entityManager == null) {
            return;
        }
        String lockKey = inboundSlipNo + "|" + productId;
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
        return repo.findByProductCodeAndStatusOrderByReceivedAtAsc(
                productCode, StockInstanceStatus.AVAILABLE);
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
        return repo.findByOutboundPartnerCodeAndProductCodeAndStatusOrderByOutboundAtDesc(
                partnerCode, productCode, StockInstanceStatus.SHIPPED);
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
