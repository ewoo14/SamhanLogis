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

    /**
     * v2 편집 요소의 밴드 상대 백분율 geometry.
     *
     * <p>🔴 BLOCKING-1: 이 record에 {@code @JsonInclude(NON_NULL)}이 없으면, 부분 지정된 값(예:
     * {@code style}의 fontSize만 지정)이 Java 객체를 거쳐 재직렬화될 때(JSONB 저장·activate 재검증·API
     * 응답) 나머지 필드가 명시적 {@code null}로 채워진다. FE parser({@code value.foo !== undefined})와
     * BE {@link DocumentPayloadValidator}({@code node.has(key)}) 는 둘 다 "값이 있는데 null"과 "값이
     * 없음"을 구분하지 못해 존재하지만 유효하지 않은 값으로 거부한다 — 저장은 201로 성공하지만 재열람(GET)과
     * activate() 재검증이 동일 payload를 거부하는 모순이 발생했다.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Geometry(
            Double x,
            Double y,
            Double w,
            Double h
    ) {
    }

    /** 자유 CSS를 허용하지 않는 v2 style 화이트리스트. 부분 지정 null 소거는 {@link Geometry} 문서 참고. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Style(
            Double fontSize,
            Boolean bold,
            String align,
            Boolean border
    ) {
    }
}
