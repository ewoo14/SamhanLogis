package com.samhanair.logis.arologis.domain.auth;

/**
 * 아로로지스 admin 사용자 역할 — 2026-05-14 분리, 2026-06-08 6-롤 확장(개발책임자 지시).
 *
 * <p>arologis-desktop 행정직원 권한. JWT {@code role} claim 으로 발급되며,
 * {@code DynamicPermissionClientConfig.normalize()} 가 중앙 {@code role_page_permissions} 코드
 * (MASTER/MANAGER/DEVELOPER/SALES/ACCOUNTANT/DRIVER)로 변환하여 권한을 조회한다.
 *
 * <ul>
 *   <li>{@code AROLOGIS_MASTER} (마스터) — 모든 admin endpoint + master 전용 운영 + 권한 bypass</li>
 *   <li>{@code AROLOGIS_MANAGER} (매니저) — 일반 admin endpoint(권한관리 제외)</li>
 *   <li>{@code AROLOGIS_DEVELOPER} (개발자) — 권한관리 제외 전권(시스템 운영)</li>
 *   <li>{@code AROLOGIS_SALES} (영업사원) — 배차/지역 조회 중심</li>
 *   <li>{@code AROLOGIS_ACCOUNTANT} (회계사원) — 회계(현금출납/집계) 중심</li>
 *   <li>{@code AROLOGIS_DRIVER} (배송기사) — 기사앱(모바일) 전용</li>
 * </ul>
 *
 * <p>실제 page-code 별 grant 는 중앙 시드(V53)와 마스터의 권한 관리 매트릭스 UI 로 결정된다.
 */
public enum AdminUserRole {
    AROLOGIS_MASTER,
    AROLOGIS_MANAGER,
    AROLOGIS_DEVELOPER,
    AROLOGIS_SALES,
    AROLOGIS_ACCOUNTANT,
    AROLOGIS_DRIVER
}
