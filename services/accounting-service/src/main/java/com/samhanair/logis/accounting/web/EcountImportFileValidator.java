package com.samhanair.logis.accounting.web;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import org.springframework.web.multipart.MultipartFile;

/** 이카운트 import controller 공통 multipart 검증. */
final class EcountImportFileValidator {

    private static final long MAX_SIZE_BYTES = 10L * 1024 * 1024;

    private EcountImportFileValidator() {
    }

    static void validate(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "CSV 파일 필수");
        }
        if (file.getSize() > MAX_SIZE_BYTES) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "파일 크기 한도 초과: " + file.getSize() + " > " + MAX_SIZE_BYTES);
        }
    }
}
