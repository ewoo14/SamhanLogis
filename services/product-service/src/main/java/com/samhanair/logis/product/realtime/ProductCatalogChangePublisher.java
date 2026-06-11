package com.samhanair.logis.product.realtime;

import com.samhanair.logis.product.service.BundleComponentService;
import java.util.Map;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * 카탈로그 변경 SSE publish 시점 통일 게이트웨이 (P3-1 사이클1 fix, 2026-06-11).
 *
 * <p><b>문제</b>: {@link ProductRealtimeBroker} 는 트랜잭션 인지를 하지 않아 {@code publish()}
 * 호출 즉시 SSE 이벤트를 전송한다. 그 결과 호출 위치에 따라 발화 시점이 일관되지 않았다.
 * <ul>
 *   <li>{@code BundleComponentService.replaceComponents} / {@code updateDisplayOrders}
 *       — {@code @Transactional} 내부에서 호출 → 커밋 <b>전</b> 발화 (롤백 시 헛이벤트 위험)</li>
 *   <li>{@code ProductCatalogController.changeUsage} / {@code clearUsage}
 *       — 서비스 트랜잭션이 이미 커밋된 <b>뒤</b> 호출</li>
 * </ul>
 *
 * <p><b>해법 (afterCommit 지연 + fallback)</b>: 본 publisher 를 단일 경로로 사용하여 모든
 * {@code product:catalog:changed} publish 를 커밋 이후로 통일한다.
 * <ul>
 *   <li>활성 트랜잭션이 있으면({@link TransactionSynchronizationManager#isSynchronizationActive()})
 *       {@link TransactionSynchronization#afterCommit()} 에 publish 를 등록하여
 *       커밋 성공 후에만 SSE 이벤트가 나가도록 한다 (롤백 시 미발화).</li>
 *   <li>활성 트랜잭션이 없으면(이미 커밋된 컨트롤러 경로 등) 즉시 publish 한다 (fallback).</li>
 * </ul>
 *
 * <p>채널/이벤트 상수는 import 파급을 막기 위해 {@link BundleComponentService} 의
 * 컴파일 타임 상수({@code CATALOG_CHANNEL_ID} / {@code EVENT_CATALOG_CHANGED}) 를 그대로 참조한다.
 * 상수 참조는 빈 순환 의존을 만들지 않는다.
 */
@Component
public class ProductCatalogChangePublisher {

    private final ProductRealtimeBroker broker;

    public ProductCatalogChangePublisher(ProductRealtimeBroker broker) {
        this.broker = broker;
    }

    /**
     * 특정 모델코드 기준 카탈로그 변경 publish (커밋 후 발화).
     *
     * @param modelCode 변경된 품목의 카탈로그 노출 식별자
     */
    public void publishCatalogChanged(String modelCode) {
        publishAfterCommit(Map.of(
                "event", BundleComponentService.EVENT_CATALOG_CHANGED,
                "modelCode", modelCode));
    }

    /**
     * 단일 모델코드가 없는 카탈로그 전체 변경 publish (예: display-orders 일괄 갱신, 커밋 후 발화).
     */
    public void publishCatalogChanged() {
        publishAfterCommit(Map.of(
                "event", BundleComponentService.EVENT_CATALOG_CHANGED));
    }

    /**
     * 활성 트랜잭션이 있으면 {@code afterCommit} 으로 지연 발화, 없으면 즉시 발화(fallback).
     */
    private void publishAfterCommit(Map<String, Object> payload) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    broker.publish(BundleComponentService.CATALOG_CHANNEL_ID,
                            BundleComponentService.EVENT_CATALOG_CHANGED, payload);
                }
            });
        } else {
            broker.publish(BundleComponentService.CATALOG_CHANNEL_ID,
                    BundleComponentService.EVENT_CATALOG_CHANGED, payload);
        }
    }
}
