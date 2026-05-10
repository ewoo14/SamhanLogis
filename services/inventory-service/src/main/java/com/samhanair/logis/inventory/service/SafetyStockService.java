package com.samhanair.logis.inventory.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.inventory.client.NotificationClient;
import java.util.Objects;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.domain.SafetyStockConfig;
import com.samhanair.logis.inventory.repository.SafetyStockConfigRepository;
import com.samhanair.logis.inventory.repository.StockBalanceRepository;
import com.samhanair.logis.inventory.web.dto.SafetyStockAlertResponse;
import com.samhanair.logis.inventory.web.dto.SafetyStockConfigResponse;
import com.samhanair.logis.inventory.web.dto.SafetyStockSetRequest;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 안전재고 알림 서비스 (P1-3).
 *
 * <p>기능 요약:
 * <ol>
 *   <li>임계값 설정/갱신 — {@link #setSafetyStock(UUID, SafetyStockSetRequest)}</li>
 *   <li>임계 미만 제품 목록 조회 — {@link #findAlerts()}</li>
 *   <li>재고 변동 후 즉시 점검 — {@link #checkAndNotify(UUID, UUID)}</li>
 *   <li>주기적 polling (5분 간격) — {@link #scheduledCheck()}</li>
 * </ol>
 *
 * <p>알림 발송은 {@link NotificationClient#sendSafetyStockAlert} 를 통해 fire-and-forget 방식으로
 * notification-service 에 위임한다. 발송 실패 시 경고 로그만 남기고 트랜잭션에 영향을 주지 않는다.
 */
@Service
@RequiredArgsConstructor
public class SafetyStockService {

    private static final Logger log = LoggerFactory.getLogger(SafetyStockService.class);

    private final SafetyStockConfigRepository safetyStockConfigRepository;
    private final StockBalanceRepository stockBalanceRepository;
    private final ProductClient productClient;
    private final NotificationClient notificationClient;

    /**
     * 제품별 안전재고 임계값을 설정하거나 기존 설정을 갱신한다.
     *
     * <p>동일 (productId, warehouseId) 조합의 활성 설정이 이미 존재하면 임계값과 메모를 갱신한다.
     * 없으면 신규 생성한다. productId 유효성은 product-service 에 internal 호출로 검증한다.
     *
     * @param productId 대상 제품 UUID
     * @param request   임계값 설정 요청 (warehouseId / threshold / note)
     * @return 설정 결과 {@link SafetyStockConfigResponse}
     * @throws BusinessException(NOT_FOUND)    productId 가 product-service 에 없을 때
     * @throws BusinessException(INVALID_INPUT) threshold 가 0 미만일 때
     * @throws BusinessException(INTERNAL_ERROR) product-service 호출 자체가 실패할 때
     */
    @Transactional
    public SafetyStockConfigResponse setSafetyStock(UUID productId, SafetyStockSetRequest request) {
        productClient.requireExists(productId);

        SafetyStockConfig config = safetyStockConfigRepository
                .findByProductIdAndWarehouseId(productId, request.warehouseId())
                .orElseGet(() -> Objects.requireNonNull(
                        safetyStockConfigRepository.save(
                                SafetyStockConfig.create(
                                        productId,
                                        request.warehouseId(),
                                        request.threshold(),
                                        request.note()
                                )
                        ),
                        "SafetyStockConfig 저장 결과가 null입니다"
                ));

        // 이미 존재하는 경우 도메인 메서드로 갱신
        if (config.getThreshold() != request.threshold()) {
            config.updateThreshold(request.threshold());
        }
        config.updateNote(request.note());

        return SafetyStockConfigResponse.from(config);
    }

    /**
     * 현재 가용 재고가 안전재고 임계값 이하인 제품 목록을 반환한다.
     *
     * <p>warehouseId 가 null 인 설정(전체 합산 기준)은 해당 productId 의 모든 창고 availableQty 합계로 비교한다.
     * warehouseId 가 지정된 설정은 해당 (productId, warehouseId) 의 availableQty 로 비교한다.
     *
     * @return 임계 이하 제품의 {@link SafetyStockAlertResponse} 목록 (비어있으면 빈 리스트)
     */
    @Transactional(readOnly = true)
    public List<SafetyStockAlertResponse> findAlerts() {
        List<SafetyStockConfig> configs = safetyStockConfigRepository.findAll();
        List<SafetyStockAlertResponse> alerts = new ArrayList<>();

        for (SafetyStockConfig config : configs) {
            int currentQty = resolveCurrentQty(config);
            if (currentQty <= config.getThreshold()) {
                alerts.add(SafetyStockAlertResponse.of(config, currentQty));
            }
        }
        return alerts;
    }

    /**
     * 재고 변동 이벤트(입고/출고/조정) 후 특정 (productId, warehouseId) 의 안전재고 임계를 즉시 점검하고,
     * 임계 미만이면 notification-service 에 알림을 fire-and-forget 으로 전송한다.
     *
     * <p>트랜잭션 외부에서 호출되어야 하며, 본 메서드 자체는 읽기 전용 트랜잭션으로 실행된다.
     * 알림 발송 실패는 재고 변동 결과에 영향을 주지 않는다.
     *
     * @param productId   재고가 변동된 제품 UUID
     * @param warehouseId 재고가 변동된 창고 UUID
     */
    @Transactional(readOnly = true)
    public void checkAndNotify(UUID productId, UUID warehouseId) {
        // (productId, 특정 창고) 설정 점검
        safetyStockConfigRepository
                .findByProductIdAndWarehouseId(productId, warehouseId)
                .ifPresent(config -> {
                    int currentQty = resolveCurrentQty(config);
                    if (currentQty <= config.getThreshold()) {
                        fireAlert(config, currentQty);
                    }
                });

        // (productId, 전체 합산 기준 = null) 설정 점검
        safetyStockConfigRepository
                .findByProductIdAndWarehouseId(productId, null)
                .ifPresent(config -> {
                    int currentQty = resolveCurrentQty(config);
                    if (currentQty <= config.getThreshold()) {
                        fireAlert(config, currentQty);
                    }
                });
    }

    /**
     * 5분 주기 polling — 모든 안전재고 설정을 순회하여 임계 미만인 항목에 알림을 발송한다.
     *
     * <p>초기 기동 지연 1분(60000ms) 후 시작. polling 간격은 향후 환경변수로 외부화 가능.
     * 발송 실패는 경고 로그만 남기고 다음 cycle 에 재시도한다.
     */
    @Scheduled(fixedDelayString = "300000", initialDelayString = "60000")
    @Transactional(readOnly = true)
    public void scheduledCheck() {
        List<SafetyStockConfig> configs = safetyStockConfigRepository.findAll();
        if (configs.isEmpty()) {
            return;
        }
        log.debug("안전재고 주기 점검 시작 — 설정 건수={}", configs.size());
        int alertCount = 0;
        for (SafetyStockConfig config : configs) {
            int currentQty = resolveCurrentQty(config);
            if (currentQty <= config.getThreshold()) {
                fireAlert(config, currentQty);
                alertCount++;
            }
        }
        log.info("안전재고 주기 점검 완료 — 설정={}, 알림발송={}", configs.size(), alertCount);
    }

    // ------------------------------------------------------------------
    // private helpers
    // ------------------------------------------------------------------

    /**
     * SafetyStockConfig 의 warehouseId 유무에 따라 현재 가용 재고 수량을 계산한다.
     *
     * @param config 안전재고 설정 엔티티
     * @return warehouseId != null 이면 해당 창고 availableQty, null 이면 productId 전체 창고 합산
     */
    private int resolveCurrentQty(SafetyStockConfig config) {
        if (config.getWarehouseId() != null) {
            return stockBalanceRepository
                    .findByProductIdAndWarehouse_IdAndIsDeletedFalse(
                            config.getProductId(), config.getWarehouseId())
                    .map(b -> b.getAvailableQty())
                    .orElse(0);
        } else {
            // 전체 창고 합산
            return stockBalanceRepository
                    .findAllByProductIdInAndIsDeletedFalse(List.of(config.getProductId()))
                    .stream()
                    .mapToInt(b -> b.getAvailableQty())
                    .sum();
        }
    }

    /**
     * 안전재고 알림을 notification-service 에 fire-and-forget 으로 전송한다.
     *
     * @param config     임계값 설정 엔티티
     * @param currentQty 현재 가용 재고 수량
     */
    private void fireAlert(SafetyStockConfig config, int currentQty) {
        String warehouseLabel = config.getWarehouseId() != null
                ? config.getWarehouseId().toString()
                : "전체 창고 합산";
        String subject = String.format("[안전재고 경보] 제품 %s 재고 부족 (%s)",
                config.getProductId(), warehouseLabel);
        String body = String.format(
                "제품 ID: %s%n창고: %s%n현재 가용 재고: %d%n안전재고 임계값: %d%n부족량: %d",
                config.getProductId(),
                warehouseLabel,
                currentQty,
                config.getThreshold(),
                config.getThreshold() - currentQty
        );
        notificationClient.sendSafetyStockAlert(subject, body);
    }
}
