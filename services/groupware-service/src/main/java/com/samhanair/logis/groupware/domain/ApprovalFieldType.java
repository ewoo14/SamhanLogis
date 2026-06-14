package com.samhanair.logis.groupware.domain;

/** 결재유형 템플릿 필드 입력 타입. */
public enum ApprovalFieldType {
    /** 한 줄 텍스트. */
    TEXT,
    /** 숫자 입력. */
    NUMBER,
    /** ISO yyyy-MM-dd 일자. */
    DATE,
    /** 사전 정의 옵션 중 선택. */
    SELECT,
    /** 여러 줄 텍스트. */
    TEXTAREA
}
