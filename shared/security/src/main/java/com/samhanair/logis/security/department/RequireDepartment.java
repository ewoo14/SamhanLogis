package com.samhanair.logis.security.department;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 기존 {@code @PreAuthorize("@hr.isExecutiveOffice()")} 부서 게이트 대체 어노테이션.
 *
 * <p>{@link DepartmentAspect} 가 메서드 실행 전에 기존 SpEL 이 사용하던
 * {@link com.samhanair.logis.security.HrAuthorizationHelper} 빈의 동일 메서드를 호출한다.
 */
@Documented
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.METHOD, ElementType.TYPE})
public @interface RequireDepartment {

    /**
     * 요구 부서.
     *
     * @return 요구 부서 enum
     */
    Department value();
}
