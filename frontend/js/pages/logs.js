import { apiFetch, formatDate, truncate } from '../api.js';
import { el, clear, buildTable, buildPagination, showLoading, showError, createModal, badge, renderJson } from '../dom.js';
import { pageShell } from '../layout.js';

pageShell('聊天 Log', 'Tool 呼叫、Query Rewrite 與關鍵字追蹤', '/html/logs.html');

let currentPage = 1;
const limit = 20;
let userId = '';
let chatId = '';

const toolbar = document.getElementById('toolbar');
const tableContainer = document.getElementById('table-container');
const paginationContainer = document.getElementById('pagination-container');
const modalRoot = document.getElementById('modal-root');

const userInput = el('input', { className: 'input-field', placeholder: '使用者 UUID（可選）' });
const chatInput = el('input', { className: 'input-field', placeholder: '對話 UUID（可選）' });
const searchBtn = el('button', { className: 'btn btn-primary', textContent: '搜尋' });

searchBtn.addEventListener('click', () => {
    userId = userInput.value.trim();
    chatId = chatInput.value.trim();
    currentPage = 1;
    load();
});

toolbar.appendChild(userInput);
toolbar.appendChild(chatInput);
toolbar.appendChild(searchBtn);

async function load() {
    showLoading(tableContainer);
    clear(paginationContainer);
    try {
        const data = await apiFetch('/api/logs', {
            user_id: userId, chat_id: chatId, page: currentPage, limit,
        });

        clear(tableContainer);
        tableContainer.appendChild(buildTable([
            { label: '使用者', render: r => r.email || r.username },
            { label: '對話', render: r => truncate(r.chat_title, 25) },
            { label: 'Tools', render: r => String(r.tool_count) },
            { label: 'Rewrite', render: r => String(r.rewrite_count) },
            { label: '模式', render: r => r.trace?.response_mode ? badge(r.trace.response_mode, 'info') : '-' },
            { label: '時間', render: r => formatDate(r.created_at) },
            { label: '操作', render: r => {
                const btn = el('button', { className: 'btn btn-sm', textContent: '詳情' });
                btn.addEventListener('click', () => showDetail(r.message_id));
                return btn;
            }},
        ], data.items));

        paginationContainer.appendChild(buildPagination(currentPage, data.total, limit, (p) => {
            currentPage = p;
            load();
        }));
    } catch (err) {
        showError(tableContainer, err.message);
    }
}

async function showDetail(messageId) {
    const { overlay, body } = createModal('Log 詳情');
    modalRoot.appendChild(overlay);
    showLoading(body);

    try {
        const data = await apiFetch(`/api/logs/${messageId}`);
        clear(body);

        body.appendChild(el('div', { className: 'detail-grid' },
            el('div', { className: 'detail-item' },
                el('div', { className: 'label', textContent: '使用者' }),
                el('div', { className: 'value', textContent: data.email || data.username }),
            ),
            el('div', { className: 'detail-item' },
                el('div', { className: 'label', textContent: '模式' }),
                el('div', { className: 'value', textContent: data.trace?.response_mode || '-' }),
            ),
            el('div', { className: 'detail-item' },
                el('div', { className: 'label', textContent: '執行時間' }),
                el('div', { className: 'value', textContent: data.trace?.total_execution_time ? `${data.trace.total_execution_time}s` : '-' }),
            ),
        ));

        if (data.trace?.tool_calls?.length) {
            body.appendChild(el('div', { className: 'card', style: 'margin-top:1rem' },
                el('div', { className: 'card-title', textContent: 'Tool 呼叫' }),
            ));
            data.trace.tool_calls.forEach(tc => {
                body.lastElementChild.appendChild(el('div', { className: 'trace-block' },
                    el('div', { className: 'trace-title', textContent: `${tc.node} → ${tc.name}` }),
                    el('div', { textContent: `Query: ${tc.query || '-'}` }),
                    tc.start_date ? el('div', { textContent: `日期: ${tc.start_date} ~ ${tc.end_date || ''}` }) : null,
                    tc.raw_args ? el('div', {}, el('div', { className: 'label', textContent: 'Raw Args' }), renderJson(tc.raw_args)) : null,
                ));
            });
        }

        if (data.trace?.query_rewrites?.length) {
            body.appendChild(el('div', { className: 'card', style: 'margin-top:1rem' },
                el('div', { className: 'card-title', textContent: 'Query Rewrite' }),
            ));
            data.trace.query_rewrites.forEach(rw => {
                body.lastElementChild.appendChild(el('div', { className: 'trace-block' },
                    el('div', { className: 'trace-title', textContent: `${rw.node} · ${rw.type}` }),
                    rw.pattern ? el('div', { textContent: `Pattern: ${rw.pattern}` }) : null,
                    rw.original_query ? el('div', { textContent: `原始: ${rw.original_query}` }) : null,
                    el('div', { textContent: `改寫: ${rw.rewritten_query || '-'}` }),
                ));
            });
        }

        if (data.token_logs?.length) {
            body.appendChild(el('div', { className: 'card', style: 'margin-top:1rem' },
                el('div', { className: 'card-title', textContent: 'Token 紀錄' }),
                buildTable([
                    { label: 'Caller', key: 'caller' },
                    { label: 'Model', key: 'model_name' },
                    { label: 'Tokens', render: r => String(r.total_tokens) },
                    { label: 'Cost', render: r => '$' + Number(r.cost_usd).toFixed(4) },
                ], data.token_logs),
            ));
        }

        if (data.trace?.steps?.length) {
            body.appendChild(el('div', { className: 'card', style: 'margin-top:1rem' },
                el('div', { className: 'card-title', textContent: '完整 Steps' }),
                renderJson(data.trace.steps),
            ));
        }
    } catch (err) {
        showError(body, err.message);
    }

    if (window.lucide) lucide.createIcons();
}

load();
