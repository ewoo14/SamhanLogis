package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.Order;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderRepository extends JpaRepository<Order, UUID> {
    Optional<Order> findByOrderNo(String orderNo);
    Optional<Order> findByExternalRef(String externalRef);
}
