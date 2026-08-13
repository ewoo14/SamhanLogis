package com.samhanair.logis.inventory.repository;

import com.samhanair.logis.inventory.domain.StockInstanceStatus;
import java.util.UUID;

/** 재고 현황 합성을 위한 활성 시리얼 인스턴스 집계 한 행. */
public interface StockInstanceBalanceProjection {

    UUID getProductId();

    UUID getWarehouseId();

    StockInstanceStatus getStatus();

    long getQuantity();
}
