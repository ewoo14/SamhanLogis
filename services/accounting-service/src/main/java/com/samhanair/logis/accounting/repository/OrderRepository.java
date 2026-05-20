package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.Order;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface OrderRepository extends JpaRepository<Order, UUID>,
        JpaSpecificationExecutor<Order> {

    @EntityGraph(attributePaths = "lines")
    Optional<Order> findByOrderNo(String orderNo);

    Optional<Order> findByExternalRef(String externalRef);
}
