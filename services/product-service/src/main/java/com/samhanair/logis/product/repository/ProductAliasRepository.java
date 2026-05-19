package com.samhanair.logis.product.repository;

import com.samhanair.logis.product.domain.ProductAlias;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 이카운트 품목 alias_code lookup repository. */
public interface ProductAliasRepository extends JpaRepository<ProductAlias, UUID> {

    Optional<ProductAlias> findByAliasCodeAndIsDeletedFalse(String aliasCode);

    boolean existsByAliasCodeAndIsDeletedFalse(String aliasCode);
}
