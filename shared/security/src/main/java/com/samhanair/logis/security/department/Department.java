package com.samhanair.logis.security.department;

/**
 * 부서 게이트 대상.
 *
 * <p>M1 에서는 기존 {@code @hr.isExecutiveOffice()} SpEL 과 1:1 대응하는
 * 대표실 게이트만 제공한다. 후속 부서 게이트가 필요하면 enum 값을 확장한다.
 */
public enum Department {

    /** 대표실 — {@link com.samhanair.logis.security.HrAuthorizationHelper#isExecutiveOffice()} 판정. */
    EXECUTIVE_OFFICE
}
