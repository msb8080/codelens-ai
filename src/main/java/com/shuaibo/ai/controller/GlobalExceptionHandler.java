package com.shuaibo.ai.controller;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

/**
 * 全局异常处理
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(com.shuaibo.ai.exception.ApiKeyInvalidException.class)
    public ResponseEntity<Map<String, Object>> handleApiKeyInvalid(com.shuaibo.ai.exception.ApiKeyInvalidException e) {
        return build(HttpStatus.UNAUTHORIZED, "API_KEY_INVALID", e.getMessage(), e);
    }

    @ExceptionHandler(com.shuaibo.ai.exception.ModelNotFoundException.class)
    public ResponseEntity<Map<String, Object>> handleModelNotFound(com.shuaibo.ai.exception.ModelNotFoundException e) {
        return build(HttpStatus.NOT_FOUND, "MODEL_NOT_FOUND", e.getMessage(), e);
    }

    @ExceptionHandler(com.shuaibo.ai.exception.RateLimitedException.class)
    public ResponseEntity<Map<String, Object>> handleRateLimited(com.shuaibo.ai.exception.RateLimitedException e) {
        return build(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED", e.getMessage(), e);
    }

    @ExceptionHandler(com.shuaibo.ai.exception.TimeoutException.class)
    public ResponseEntity<Map<String, Object>> handleTimeout(com.shuaibo.ai.exception.TimeoutException e) {
        return build(HttpStatus.GATEWAY_TIMEOUT, "TIMEOUT", e.getMessage(), e);
    }

    @ExceptionHandler(com.shuaibo.ai.exception.UpstreamServiceException.class)
    public ResponseEntity<Map<String, Object>> handleUpstream(com.shuaibo.ai.exception.UpstreamServiceException e) {
        return build(HttpStatus.BAD_GATEWAY, "UPSTREAM_ERROR", e.getMessage(), e);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldError() != null
                ? e.getBindingResult().getFieldError().getDefaultMessage()
                : "请求参数校验失败";
        return build(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", message, e);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleException(Exception e) {
        return build(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误，请稍后重试", e);
    }

    private ResponseEntity<Map<String, Object>> build(HttpStatus status, String error, String message, Exception e) {
        log.error("Handled error: status={}, error={}, message={}", status.value(), error, message, e);
        return ResponseEntity.status(status)
                .body(Map.of(
                        "error", error,
                        "message", message,
                        "status", status.value(),
                        "timestamp", System.currentTimeMillis()
                ));
    }
}
