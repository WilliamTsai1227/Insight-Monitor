import { apiFetch, formatNumber, formatCost, formatDate } from '../api.js';
import { el, clear, showLoading, showError } from '../dom.js';
import { pageShell } from '../layout.js';

pageShell('總覽', 'Stock-Insight-Chat 基礎設施監控', '/');

const container = document.getElementById('page-content');
showLoading(container);

async function load() {
    try {
        const [health, tokens, users, qdrant, errors] = await Promise.all([
            apiFetch('/api/health'),
            apiFetch('/api/tokens/summary'),
            apiFetch('/api/users', { limit: 1 }),
            apiFetch('/api/qdrant/collections').catch(() => ({ items: [] })),
            apiFetch('/api/errors/all', { limit: 1 }).catch(() => ({ total: 0 })),
        ]);

        clear(container);

        const stats = el('div', { className: 'stats-grid' });
        const overall = tokens.overall || {};

        const statItems = [
            { label: '註冊使用者', value: formatNumber(users.total), sub: '位使用者' },
            { label: '總 Token 用量', value: formatNumber(overall.total_tokens), sub: `${formatNumber(overall.record_count)} 次呼叫` },
            { label: '總花費', value: formatCost(overall.total_cost_usd), sub: `${formatNumber(overall.user_count)} 位使用者有紀錄` },
            { label: 'Qdrant Collections', value: formatNumber(qdrant.items?.length || 0), sub: '個向量集合' },
            { label: '系統報錯', value: formatNumber(errors.total || 0), sub: '筆錯誤紀錄' },
            { label: '服務狀態', value: health.status === 'healthy' ? '正常' : '異常', sub: 'API 健康檢查' },
        ];

        statItems.forEach(s => {
            stats.appendChild(el('div', { className: 'stat-card' },
                el('div', { className: 'label', textContent: s.label }),
                el('div', { className: 'value', textContent: s.value }),
                el('div', { className: 'sub', textContent: s.sub }),
            ));
        });
        container.appendChild(stats);

        if (tokens.by_model?.length) {
            container.appendChild(el('div', { className: 'card' },
                el('div', { className: 'card-title', textContent: '各模型用量' }),
                buildModelTable(tokens.by_model),
            ));
        }

        if (qdrant.items?.length) {
            container.appendChild(el('div', { className: 'card' },
                el('div', { className: 'card-title', textContent: 'Qdrant 概覽' }),
                buildQdrantTable(qdrant.items),
            ));
        }
    } catch (err) {
        showError(container, '載入失敗：' + err.message);
    }
}

function buildModelTable(items) {
    const wrap = el('div', { className: 'data-table-wrap' });
    const table = el('table', { className: 'data-table' });
    const thead = el('thead');
    const hr = el('tr');
    ['模型', 'Token', '花費', '呼叫次數'].forEach(t => hr.appendChild(el('th', { textContent: t })));
    thead.appendChild(hr);
    table.appendChild(thead);
    const tbody = el('tbody');
    items.forEach(m => {
        const tr = el('tr');
        [m.model_name, formatNumber(m.total_tokens), formatCost(m.total_cost_usd), formatNumber(m.call_count)]
            .forEach(v => tr.appendChild(el('td', { textContent: v })));
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
}

function buildQdrantTable(items) {
    const wrap = el('div', { className: 'data-table-wrap' });
    const table = el('table', { className: 'data-table' });
    const thead = el('thead');
    const hr = el('tr');
    ['Collection', '資料筆數', '最新', '最早'].forEach(t => hr.appendChild(el('th', { textContent: t })));
    thead.appendChild(hr);
    table.appendChild(thead);
    const tbody = el('tbody');
    items.forEach(c => {
        const tr = el('tr');
        [c.name, formatNumber(c.points_count), formatDate(c.latest), formatDate(c.earliest)]
            .forEach(v => tr.appendChild(el('td', { textContent: v })));
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
}

load();
