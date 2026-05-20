package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.OrderLine;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderLineRepository extends JpaRepository<OrderLine, UUID> {
}
