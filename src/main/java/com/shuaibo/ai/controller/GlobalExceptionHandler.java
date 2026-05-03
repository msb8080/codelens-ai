package com.shuaibo.ai.controller;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

/**
 * 全局异常处理
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<Map<String, Object>> handleRuntimeException(RuntimeException e) {
        log.error("Runtime exception: {}", e.getMessage(), e);
        
        String message = e.getMessage();
        String errorType = "UNKNOWN_ERROR";
        
        // 识别常见错误类型
        if (message != null) {
            if (message.contains("401") || message.contains("Unauthorized") || message.contains("Invalid API")) {
                errorType = "API_KEY_INVALID";
                message = "API Key 无效，请检查配置";
            } else if (message.contains("404") || message.contains("Not Found")) {
                errorType = "MODEL_NOT_FOUND";
                message = "模型不存在，请检查模型 ID";
            } else if (message.contains("429") || message.contains("Rate limit")) {
                errorType = "RATE_LIMITED";
                message = "请求过于频繁，请稍后重试";
            } else if (message.contains("timeout") || message.contains("Timeout")) {
                errorType = "TIMEOUT";
                message = "请求超时，请重试";
            } else if (message.contains("Connection") || message.contains("connect")) {
                errorType = "CONNECTION_ERROR";
                message = "连接失败，请检查网络或 API 地址";
            }
        }
        
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of(
                    "error", errorType,
                    "message", message,
                    "timestamp", System.currentTimeMillis()
                ));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleException(Exception e) {
        log.error("Unexpected exception: {}", e.getMessage(), e);
        
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of(
                    "error", "INTERNAL_ERROR",
                    "message", "服务器内部错误，请稍后重试",
                    "timestamp", System.currentTimeMillis()
                ));
    }
}
