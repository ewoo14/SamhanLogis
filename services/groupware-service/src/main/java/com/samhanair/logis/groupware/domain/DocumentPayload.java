package com.samhanair.logis.groupware.domain;

import com.fasterxml.jackson.annotation.JsonInclude;
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
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Element(
            String key,
            String type,
            Geometry geometry,
            Style style,
            String binding,
            String text
    ) {
        /** v1 레거시 요소를 생성하는 호환 생성자. */
        public Element(String key, String type) {
            this(key, type, null, null, null, null);
        }
    }

    /** v2 편집 요소의 밴드 상대 백분율 geometry. */
    public record Geometry(
            Double x,
            Double y,
            Double w,
            Double h
    ) {
    }

    /** 자유 CSS를 허용하지 않는 v2 style 화이트리스트. */
    public record Style(
            Double fontSize,
            Boolean bold,
            String align,
            Boolean border
    ) {
    }
}
