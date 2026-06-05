package com.samhanair.logis.auth.repository;

import com.samhanair.logis.auth.domain.PermissionGroup;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 동적 권한그룹 저장소. */
public interface PermissionGroupRepository extends JpaRepository<PermissionGroup, UUID> {

    Optional<PermissionGroup> findByNameAndIsDeletedFalse(String name);

    List<PermissionGroup> findByIsDeletedFalse();

    Optional<PermissionGroup> findByIdAndIsDeletedFalse(UUID id);
}
