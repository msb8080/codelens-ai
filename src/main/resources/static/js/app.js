// =========================================
// CodeLens AI - 前端应用逻辑
// =========================================

// ===== 配置 =====
const API_BASE = window.location.origin;
const messages = document.getElementById('messages');
const input = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');

// 流式中断控制
let currentAbort = null;
let streamingMsgEl = null;

// ===== Markdown 渲染 =====
let useMarked = false;
try {
    marked.setOptions({ breaks: true, gfm: true });
    useMarked = true;
    console.log('[CodeLens] marked.js loaded');
} catch (e) {
    console.warn('[CodeLens] marked.js not available', e);
}

function parseMarkdown(text) {
    if (!useMarked || !text) return fallbackMd(text || '');
    const opens = (text.match(/```/g) || []).length;
    if (opens % 2 === 1) {
        const lastIdx = text.lastIndexOf('```');
        const closed = text.substring(0, lastIdx);
        const unclosed = text.substring(lastIdx);
        let html = '';
        if (closed) {
            try { html = marked.parse(closed); } catch { html = fallbackMd(closed); }
        }
        html += '<pre><code>' + escapeHtml(unclosed) + '</code></pre>';
        return html;
    }
    try { return marked.parse(text); }
    catch { return fallbackMd(text); }
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fallbackMd(text) {
    return escapeHtml(text).replace(/\n/g, '<br>');
}

// ===== Mermaid 渲染 =====
let useMermaid = false;
let mermaidCounter = 0;

try {
    mermaid.initialize({
        startOnLoad: false, theme: 'dark',
        themeVariables: {
            primaryColor: '#7e5adc', primaryTextColor: '#fff',
            primaryBorderColor: '#a894df', lineColor: '#a894df',
            secondaryColor: '#3d2966', tertiaryColor: '#1a1030',
            background: 'transparent', mainBkg: '#3d2966',
            nodeBorder: '#a894df', titleColor: '#fff'
        },
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        securityLevel: 'loose'
    });
    useMermaid = true;
    console.log('[CodeLens] mermaid.js loaded');
} catch (e) {
    console.warn('[CodeLens] mermaid.js not available', e);
}

function renderMermaidInElement(container) {
    if (!useMermaid) return;
    container.querySelectorAll('code.language-mermaid').forEach((codeEl) => {
        const preEl = codeEl.closest('pre');
        if (!preEl) return;
        const graphDef = codeEl.textContent.trim();
        if (!graphDef) return;
        const id = 'mermaid-' + (++mermaidCounter);
        const wrapper = document.createElement('div');
        wrapper.className = 'mermaid';
        wrapper.id = id;
        preEl.replaceWith(wrapper);
        try {
            mermaid.render(id + '-svg', graphDef).then(({ svg }) => {
                wrapper.innerHTML = svg;
            }).catch(err => {
                wrapper.innerHTML = '<pre style="color:#f87171;">Mermaid: ' + escapeHtml(err.message || err) + '</pre>';
            });
        } catch (err) {
            wrapper.innerHTML = '<pre style="color:#f87171;">Mermaid 渲染失败</pre>';
        }
    });
}

// ===== 智能滚动 =====
function scrollToBottom(force) {
    const cursor = messages.querySelector('.streaming-cursor');
    if (cursor) {
        cursor.scrollIntoView({ behavior: 'auto', block: 'end' });
    } else {
        messages.scrollTop = messages.scrollHeight;
    }
}

// ===== 发送消息 =====
async function send() {
    const question = input.value.trim();
    if (!question) return;

    addMessage('user', question);
    input.value = '';
    autoResize();

    // 切换为停止按钮
    setSending(true);

    const aiMsgEl = createStreamingMessage();
    streamingMsgEl = aiMsgEl;
    const bubbleEl = aiMsgEl.querySelector('.bubble');
    let fullText = '';

    // 中断控制器
    const controller = new AbortController();
    currentAbort = () => {
        controller.abort();
        fullText = finalizeStopped(aiMsgEl, fullText);
    };

    try {
        const res = await fetch(`${API_BASE}/api/chat/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question }),
            signal: controller.signal
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            let currentEvent = '';
            for (const line of lines) {
                if (line.startsWith('event:')) {
                    currentEvent = line.slice(6).trim();
                } else if (line.startsWith('data:')) {
                    const raw = line.slice(5);
                    if (currentEvent === 'token') {
                        let token;
                        try { token = JSON.parse(raw); } catch { token = raw; }
                        fullText += token;
                        bubbleEl.innerHTML = parseMarkdown(fullText) +
                            '<span class="streaming-cursor"></span>';
                        renderMermaidInElement(bubbleEl);
                        scrollToBottom();
                    } else if (currentEvent === 'done') {
                        try {
                            const result = JSON.parse(raw);
                            finalizeStreamingMessage(aiMsgEl, result.latencyMs, result.ragHits, result.tokenUsage);
                            updateStats(result.latencyMs, result.ragHits);
                        } catch { finalizeStreamingMessage(aiMsgEl); }
                    }
                }
            }
        }

        bubbleEl.innerHTML = parseMarkdown(fullText);
        renderMermaidInElement(bubbleEl);
        if (bubbleEl.querySelector('.streaming-cursor')) {
            finalizeStreamingMessage(aiMsgEl);
        }

    } catch (e) {
        if (e.name === 'AbortError') {
            // 用户中断，已在 currentAbort 中处理
        } else {
            bubbleEl.innerHTML = parseMarkdown(fullText || '') +
                '<br><br>⚠️ 连接失败：' + escapeHtml(e.message);
            const cursor = bubbleEl.querySelector('.streaming-cursor');
            if (cursor) cursor.remove();
            finalizeStreamingMessage(aiMsgEl);
        }
    } finally {
        setSending(false);
        currentAbort = null;
        streamingMsgEl = null;
        input.focus();
    }
}

// ===== 中断后处理 =====
function finalizeStopped(msgEl, fullText) {
    const bubbleEl = msgEl.querySelector('.bubble');
    bubbleEl.innerHTML = parseMarkdown(fullText) +
        '<br><em style="color:var(--brand-light);font-size:0.85em;">⏸ 已中断</em>';
    renderMermaidInElement(bubbleEl);
    finalizeStreamingMessage(msgEl);
    addContinueButton(msgEl);
    return fullText;
}

// ===== 操作按钮 =====
function addCopyButton(msgEl) {
    if (msgEl.querySelector('.msg-actions .copy-btn')) return;
    let actions = msgEl.querySelector('.msg-actions');
    if (!actions) {
        actions = document.createElement('div');
        actions.className = 'msg-actions';
        msgEl.querySelector('.msg-body').appendChild(actions);
    }
    const btn = document.createElement('button');
    btn.className = 'action-btn copy-btn';
    btn.title = '复制';
    btn.innerHTML = '<span class="material-symbols-outlined">content_copy</span>';
    btn.onclick = () => copyBubble(btn, msgEl);
    actions.appendChild(btn);
}

function addContinueButton(msgEl) {
    const actions = msgEl.querySelector('.msg-actions') || (() => {
        const d = document.createElement('div');
        d.className = 'msg-actions';
        msgEl.querySelector('.msg-body').appendChild(d);
        return d;
    })();
    if (actions.querySelector('.continue-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'action-btn continue-btn';
    btn.title = '继续生成';
    btn.innerHTML = '<span class="material-symbols-outlined">play_arrow</span>';
    btn.onclick = () => continueGenerate(msgEl);
    actions.appendChild(btn);
}

function copyBubble(btn, msgEl) {
    const bubble = msgEl.querySelector('.bubble');
    const text = bubble ? bubble.textContent : '';
    navigator.clipboard.writeText(text).then(() => {
        btn.innerHTML = '<span class="material-symbols-outlined">check</span>';
        setTimeout(() => {
            btn.innerHTML = '<span class="material-symbols-outlined">content_copy</span>';
        }, 1500);
    });
}

function continueGenerate(msgEl) {
    const userMsgs = messages.querySelectorAll('.message.user');
    if (userMsgs.length === 0) return;
    const question = userMsgs[userMsgs.length - 1].querySelector('.bubble').textContent;
    msgEl.remove();
    input.value = question;
    send();
}

// ===== 发送/停止按钮切换 =====
function setSending(sending) {
    if (sending) {
        sendBtn.disabled = false;
        sendBtn.classList.add('stop-btn');
        sendBtn.innerHTML = '<span class="material-symbols-outlined">stop_circle</span> 停止';
        sendBtn.onclick = () => { if (currentAbort) currentAbort(); };
    } else {
        sendBtn.classList.remove('stop-btn');
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<span class="material-symbols-outlined">send</span> 发送';
        sendBtn.onclick = () => send();
    }
}

// ===== 创建流式消息 =====
function createStreamingMessage() {
    const div = document.createElement('div');
    div.className = 'message ai streaming';
    div.innerHTML = `
        <div class="msg-avatar">🤖</div>
        <div class="msg-body">
            <div class="bubble"><span class="streaming-cursor"></span></div>
            <div class="msg-meta">
                <span class="generating-text">正在生成</span>
                <span class="generating-dots"><i></i><i></i><i></i></span>
            </div>
        </div>`;
    messages.appendChild(div);
    addCopyButton(div);
    scrollToBottom();
    return div;
}

// ===== 完成流式消息 =====
function finalizeStreamingMessage(msgEl, latency, ragHits, tokenUsage) {
    msgEl.classList.remove('streaming');
    const cursor = msgEl.querySelector('.streaming-cursor');
    if (cursor) cursor.remove();

    const meta = msgEl.querySelector('.msg-meta');
    if (meta) {
        const parts = [];
        if (latency) parts.push(`${latency}ms`);
        if (ragHits !== undefined && ragHits > 0) parts.push(`RAG: ${ragHits}条`);
        if (tokenUsage && tokenUsage.totalTokens) {
            parts.push(`↑${tokenUsage.promptTokens} ↓${tokenUsage.completionTokens}`);
        }
        parts.push(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
        meta.textContent = parts.join(' · ');
    }

    // 确保复制按钮存在
    addCopyButton(msgEl);

    const count = messages.querySelectorAll('.message').length;
    document.getElementById('msgCount').textContent = `消息: ${count}`;
}

// ===== 添加消息 =====
function addMessage(role, text, latency, ragHits) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    const avatarIcon = role === 'user' ? '👤' : '🤖';

    let meta = '';
    if (role === 'ai') {
        const parts = [];
        if (latency) parts.push(`${latency}ms`);
        if (ragHits !== undefined) parts.push(`RAG: ${ragHits}条`);
        parts.push(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
        meta = `<div class="msg-meta">${parts.join(' · ')}</div>`;
    } else {
        meta = `<div class="msg-meta">${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</div>`;
    }

    const content = role === 'ai' ? parseMarkdown(text) : escapeHtml(text).replace(/\n/g, '<br>');

    div.innerHTML = `
        <div class="msg-avatar">${avatarIcon}</div>
        <div class="msg-body">
            <div class="bubble">${content}</div>
            ${meta}
        </div>`;

    messages.appendChild(div);

    if (role === 'ai') {
        renderMermaidInElement(div.querySelector('.bubble'));
        addCopyButton(div);
    }

    scrollToBottom();
    const count = messages.querySelectorAll('.message').length;
    document.getElementById('msgCount').textContent = `消息: ${count}`;
}

// ===== 输入框自适应高度 =====
function autoResize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
}

input.addEventListener('input', autoResize);

// ===== 键盘事件 =====
input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (currentAbort) {
            currentAbort();
        } else {
            send();
        }
    }
});

// ===== 更新统计 =====
function updateStats(latency, ragHits) {
    if (latency) document.getElementById('latencyDisplay').textContent = `延迟: ${latency}ms`;
    if (ragHits !== undefined) document.getElementById('ragDisplay').textContent = `RAG: ${ragHits} 命中`;
}

// ===== 3D 卡片鼠标追踪（已禁用） =====

// ===== GSAP 入场动画 =====
document.addEventListener('DOMContentLoaded', () => {
    if (typeof gsap !== 'undefined') {
        gsap.set('.gsap-reveal', { y: 30 });
        gsap.to('.gsap-reveal', {
            duration: 0.8, opacity: 1, visibility: 'visible',
            y: 0, stagger: 0.15, ease: 'power3.out', delay: 0.1
        });
    } else {
        document.querySelectorAll('.gsap-reveal').forEach(el => {
            el.style.opacity = '1';
            el.style.visibility = 'visible';
        });
    }
});
