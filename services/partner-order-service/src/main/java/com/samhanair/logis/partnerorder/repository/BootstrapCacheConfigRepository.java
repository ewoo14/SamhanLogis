package com.samhanair.logis.partnerorder.repository;

import com.samhanair.logis.partnerorder.domain.BootstrapCacheConfig;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface BootstrapCacheConfigRepository extends JpaRepository<BootstrapCacheConfig, UUID> {
    Optional<BootstrapCacheConfig> findByCacheKey(String cacheKey);

    List<BootstrapCacheConfig> findAllByOrderByCacheKeyAsc();
}
