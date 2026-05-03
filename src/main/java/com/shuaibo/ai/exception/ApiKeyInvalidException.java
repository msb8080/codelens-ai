package com.shuaibo.ai.exception;

public class ApiKeyInvalidException extends RuntimeException {
    public ApiKeyInvalidException(String message) {
        super(message);
    }

    public ApiKeyInvalidException(String message, Throwable cause) {
        super(message, cause);
    }
}
