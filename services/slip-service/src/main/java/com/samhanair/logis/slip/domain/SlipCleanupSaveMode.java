package com.samhanair.logis.slip.domain;

/** 전표정리 저장내역 저장 방식. */
public enum SlipCleanupSaveMode {
    /** 사용자별 최신 결과 자동 저장. */
    AUTO_LATEST,
    /** 사용자가 주제를 입력해 명시적으로 보존하는 저장내역. */
    MANUAL_NAMED
}
