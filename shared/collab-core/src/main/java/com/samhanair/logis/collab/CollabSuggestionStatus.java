package com.samhanair.logis.collab;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/** 변경 제안 라이프사이클 상태. */
@Getter
@RequiredArgsConstructor
public enum CollabSuggestionStatus {
    PROPOSED("제안"),
    ACCEPTED("수락"),
    REJECTED("반려"),
    WITHDRAWN("철회");

    private final String displayName;
}
