package com.samhanair.logis.inventory.repository;

import com.samhanair.logis.inventory.domain.StockScanEvent;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** QR 스캔 감사 이벤트 저장소. */
public interface StockScanEventRepository extends JpaRepository<StockScanEvent, UUID> {
}
