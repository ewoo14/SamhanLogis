package com.samhanair.logis.auth.repository;

import com.samhanair.logis.auth.domain.GroupPagePermission;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 권한그룹별 페이지 권한 저장소. */
public interface GroupPagePermissionRepository extends JpaRepository<GroupPagePermission, UUID> {

    List<GroupPagePermission> findByActorId(String actorId);

    List<GroupPagePermission> findByGroupIdAndIsDeletedFalse(UUID groupId);

    Optional<GroupPagePermission> findByGroupIdAndPageCodeAndIsDeletedFalse(UUID groupId, String pageCode);
}
