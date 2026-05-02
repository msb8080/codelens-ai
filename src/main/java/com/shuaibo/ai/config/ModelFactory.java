package com.shuaibo.ai.config;

import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 动态模型工厂 — 根据请求参数创建 ChatModel
 * 支持每个请求指定不同的 model / baseUrl / apiKey
 */
@Component
public class ModelFactory {

    @Value("${spring.ai.openai.base-url}")
    private String defaultBaseUrl;

    @Value("${spring.ai.openai.api-key}")
    private String defaultApiKey;

    @Value("${spring.ai.openai.chat.options.model:Qwen/Qwen2.5-7B-Instruct}")
    private String defaultModel;

    /** 模型缓存 key = baseUrl + "|" + model */
    private final Map<String, OpenAiChatModel> modelCache = new ConcurrentHashMap<>();

    /**
     * 获取 ChatModel
     * @param modelName 模型名（null 则用默认）
     * @param baseUrl   API 地址（null 则用默认）
     * @param apiKey    API Key（null 则用默认）
     * @return ChatModel，若所有参数都为 null 则返回 null（调用方使用默认 bean）
     */
    public OpenAiChatModel getModel(String modelName, String baseUrl, String apiKey) {
        // 全部为空，用 Spring 默认 bean
        if (isBlank(modelName) && isBlank(baseUrl) && isBlank(apiKey)) {
            return null;
        }

        String resolvedModel = isBlank(modelName) ? defaultModel : modelName;
        String resolvedUrl = isBlank(baseUrl) ? defaultBaseUrl : baseUrl;
        String resolvedKey = isBlank(apiKey) ? defaultApiKey : apiKey;

        // 如果和默认配置完全一致，也用默认 bean
        if (resolvedModel.equals(defaultModel) && resolvedUrl.equals(defaultBaseUrl) && resolvedKey.equals(defaultApiKey)) {
            return null;
        }

        String cacheKey = resolvedUrl + "|" + resolvedModel;
        return modelCache.computeIfAbsent(cacheKey, k -> {
            OpenAiApi openAiApi = new OpenAiApi(resolvedUrl, resolvedKey);
            OpenAiChatOptions options = OpenAiChatOptions.builder()
                    .withModel(resolvedModel)
                    .withTemperature(0.7)
                    .withMaxTokens(2048)
                    .build();
            return new OpenAiChatModel(openAiApi, options);
        });
    }

    public String getDefaultModel() {
        return defaultModel;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
