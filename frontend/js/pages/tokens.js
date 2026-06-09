import { apiFetch, formatNumber, formatCost, formatDate } from '../api.js';
import { el, clear, buildTable, buildPagination, showLoading, showError } from '../dom.js';
import { pageShell } from '../layout.js';

pageShell('Token 用量', '各使用者、各模型的 Token 用量與花費統計', '/html/tokens.html');

const params = new URLSearchParams(window.location.search);
let userId = params.get('user_id') || '';
let userPage = 1;
const limit = 20;

const toolbar = document.getElementById('toolbar');
const summarySection = document.getElementById('summary-section');
const userDetailSection = document.getElementById('user-detail-section');
const byUserSection = document.getElementById('by-user-section');

const userInput = el('input', { className: 'input-field', placeholder: '使用者 UUID（查看個人用量）', value: userId });
const userBtn = el('button', { className: 'btn btn-primary', textContent: '查看使用者' });

userBtn.addEventListener('click', () => {
    userId = userInput.value.trim();
    if (userId) loadUserDetail();
    else { clear(userDetailSection); loadSummary(); }
});

toolbar.appendChild(userInput);
toolbar.appendChild(userBtn);

async function loadSummary() {
    showLoading(summarySection);
    try {
        const data = await apiFetch('/api/tokens/summary');
        clear(summarySection);

        const overall = data.overall || {};
        const stats = el('div', { className: 'stats-grid' });
        [
            { label: '總 Token', value: formatNumber(overall.total_tokens) },
            { label: 'Prompt Tokens', value: formatNumber(overall.prompt_tokens) },
            { label: 'Completion Tokens', value: formatNumber(overall.completion_tokens) },
            { label: '總花費', value: formatCost(overall.total_cost_usd) },
        ].forEach(s => {
            stats.appendChild(el('div', { className: 'stat-card' },
                el('div', { className: 'label', textContent: s.label }),
                el('div', { className: 'value', textContent: s.value }),
            ));
        });
        summarySection.appendChild(stats);

        summarySection.appendChild(el('div', { className: 'card' },
            el('div', { className: 'card-title', textContent: '各模型用量' }),
            buildModelTable(data.by_model || []),
        ));

        summarySection.appendChild(el('div', { className: 'card' },
            el('div', { className: 'card-title', textContent: '各 Caller 用量（含 Query Rewrite）' }),
            buildCallerTable(data.by_caller || []),
        ));
    } catch (err) {
        showError(summarySection, err.message);
    }
}

function buildModelTable(items) {
    const headers = [
        { label: '模型', key: 'model_name' },
        { label: 'Token', render: r => formatNumber(r.total_tokens) },
        { label: '花費', render: r => formatCost(r.total_cost_usd) },
        { label: '呼叫次數', render: r => formatNumber(r.call_count) },
        { label: '使用者數', render: r => formatNumber(r.user_count) },
    ];
    return buildTable(headers, items);
}

function buildCallerTable(items) {
    const headers = [
        { label: 'Caller', key: 'caller' },
        { label: 'Token', render: r => formatNumber(r.total_tokens) },
        { label: '花費', render: r => formatCost(r.total_cost_usd) },
        { label: '呼叫次數', render: r => formatNumber(r.call_count) },
    ];
    return buildTable(headers, items);
}

async function loadUserDetail() {
    showLoading(userDetailSection);
    try {
        const data = await apiFetch(`/api/tokens/user/${userId}`);
        clear(userDetailSection);

        const summary = data.summary || {};
        userDetailSection.appendChild(el('div', { className: 'card' },
            el('div', { className: 'card-title', textContent: `使用者 ${userId.slice(0, 8)}… 用量` }),
            el('div', { className: 'stats-grid' },
                el('div', { className: 'stat-card' },
                    el('div', { className: 'label', textContent: '總 Token' }),
                    el('div', { className: 'value', textContent: formatNumber(summary.total_tokens) }),
                ),
                el('div', { className: 'stat-card' },
                    el('div', { className: 'label', textContent: '總花費' }),
                    el('div', { className: 'value', textContent: formatCost(summary.total_cost_usd) }),
                ),
                el('div', { className: 'stat-card' },
                    el('div', { className: 'label', textContent: '呼叫次數' }),
                    el('div', { className: 'value', textContent: formatNumber(summary.call_count) }),
                ),
            ),
            el('div', { style: 'margin-top:1rem' },
                el('div', { className: 'card-title', textContent: '依模型' }),
                buildModelTable(data.by_model || []),
            ),
            el('div', { style: 'margin-top:1rem' },
                el('div', { className: 'card-title', textContent: '依 Caller' }),
                buildCallerTable(data.by_caller || []),
            ),
        ));
    } catch (err) {
        showError(userDetailSection, err.message);
    }
}

async function loadByUser() {
    try {
        const data = await apiFetch('/api/tokens/by-user', { page: userPage, limit });
        clear(byUserSection);
        byUserSection.appendChild(el('div', { className: 'card' },
            el('div', { className: 'card-title', textContent: '各使用者用量' }),
            buildTable([
                { label: 'Email', key: 'email' },
                { label: 'Username', key: 'username' },
                { label: 'Token', render: r => formatNumber(r.total_tokens) },
                { label: '花費', render: r => formatCost(r.total_cost_usd) },
                { label: '呼叫次數', render: r => formatNumber(r.call_count) },
                { label: '操作', render: r => {
                    const btn = el('button', { className: 'btn btn-sm', textContent: '詳情' });
                    btn.addEventListener('click', () => {
                        userId = r.user_id;
                        userInput.value = userId;
                        loadUserDetail();
                    });
                    return btn;
                }},
            ], data.items),
            buildPagination(userPage, data.total, limit, (p) => { userPage = p; loadByUser(); }),
        ));
    } catch (err) {
        showError(byUserSection, err.message);
    }
}

loadSummary();
if (userId) loadUserDetail();
loadByUser();
