package com.samhanair.logis.groupware.domain;

import java.util.List;

/** 영속 문서 레이아웃 JSONB payload. */
public record DocumentPayload(
        String paper,
        List<Band> bands
) {

    /** 문서의 band 구조. */
    public record Band(
            String key,
            String kind,
            List<Element> elements
    ) {
    }

    /** band 안에 배치되는 renderer element. */
    public record Element(
            String key,
            String type
    ) {
    }
}
