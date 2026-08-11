package com.samhanair.logis.auth.repository;

import com.samhanair.logis.auth.domain.RolePagePermissionTemplate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 역할별 페이지 권한 템플릿 저장소. */
public interface RolePagePermissionTemplateRepository extends JpaRepository<RolePagePermissionTemplate, UUID> {

    List<RolePagePermissionTemplate> findByActorId(String actorId);

    List<RolePagePermissionTemplate> findByRoleCode(String roleCode);

    List<RolePagePermissionTemplate> findByRoleCodeOrderByPageCodeAsc(String roleCode);

    Optional<RolePagePermissionTemplate> findByRoleCodeAndPageCode(String roleCode, String pageCode);
}
