package com.samhanair.logis.common.dto;

import com.samhanair.logis.common.exception.ErrorCode;
import java.time.Instant;
import lombok.AllArgsConstructor;
import lombok.Getter;

/** Generic success/failure envelope returned by every public REST endpoint. */
@Getter
@AllArgsConstructor
public class ApiResponse<T> {

    private final boolean success;
    private final String code;
    private final String message;
    private final T data;
    private final Instant timestamp;

    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>(true, "OK", "성공", data, Instant.now());
    }

    public static <T> ApiResponse<T> ok(T data, String message) {
        return new ApiResponse<>(true, "OK", message, data, Instant.now());
    }

    public static <T> ApiResponse<T> fail(ErrorCode code, String message) {
        return new ApiResponse<>(false, code.name(), message, null, Instant.now());
    }

    /** 실패 상태에서도 호출 결과 상세를 전달해야 하는 endpoint 용 envelope. */
    public static <T> ApiResponse<T> fail(String code, String message, T data) {
        return new ApiResponse<>(false, code, message, data, Instant.now());
    }
}
