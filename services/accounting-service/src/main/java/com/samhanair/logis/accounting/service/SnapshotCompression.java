package com.samhanair.logis.accounting.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Base64;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

/** 홈택스 일괄발행과 문서 이력이 공유하는 gzip+base64 JSON 스냅샷 코덱. */
public final class SnapshotCompression {

    private SnapshotCompression() {
    }

    /** 객체를 JSON으로 직렬화하고 gzip+base64로 압축한다. */
    public static String compress(ObjectMapper mapper, Object value) {
        try {
            byte[] json = mapper.writeValueAsBytes(value);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            try (GZIPOutputStream gzip = new GZIPOutputStream(out)) {
                gzip.write(json);
            }
            return Base64.getEncoder().encodeToString(out.toByteArray());
        } catch (IOException e) {
            throw new IllegalStateException("문서 스냅샷 압축 실패", e);
        }
    }

    /** gzip+base64 JSON 스냅샷을 객체로 복원한다. */
    public static <T> T decompress(ObjectMapper mapper, String value, Class<T> type) {
        try {
            byte[] compressed = Base64.getDecoder().decode(value);
            try (GZIPInputStream gzip = new GZIPInputStream(new ByteArrayInputStream(compressed))) {
                return mapper.readValue(gzip, type);
            }
        } catch (IOException | IllegalArgumentException e) {
            throw new IllegalStateException("문서 스냅샷 복원 실패", e);
        }
    }
}
