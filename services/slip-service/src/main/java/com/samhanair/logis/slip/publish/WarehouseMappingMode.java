package com.samhanair.logis.slip.publish;

/** 창고 매핑 정책. 환경이 명시적으로 선택하며 profile 이름으로 추론하지 않는다. */
public enum WarehouseMappingMode {
    /** staging alias 검증이 끝난 mapping만 발행에 사용한다. */
    STRICT,
    /** 선언된 개발 대체 UUID를 사용하고 운영 alias 경보를 내지 않는다. */
    DEV_SUBSTITUTE
}
