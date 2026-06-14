package com.samhanair.logis.groupware.domain;

/** 결재 문서에 연결되는 첨부 유형. */
public enum ApprovalAttachmentType {
    /** 전표번호 기반 참조 링크. */
    SLIP_REF,
    /** 거래처 원장 기간 참조 링크. */
    PARTNER_LEDGER_REF,
    /** MinIO 객체 파일. */
    FILE
}
