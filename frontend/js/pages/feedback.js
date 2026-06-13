import { apiFetch, formatDate, truncate, truncateUuid } from '../api.js';
import { el, clear, buildTable, buildPagination, showLoading, showError, createModal, badge, renderJson } from '../dom.js';
import { pageShell } from '../layout.js';

pageShell('使用者回饋', 'Stock-Insight-Chat user_feedback 完整回饋資訊', '/html/feedback.html');

let currentPage = 1;
const limit = 20;
let filterStatus = '';
let filterCategory = '';
let filterUserId = '';
let searchQ = '';

const toolbar = document.getElementById('toolbar');
const summarySection = document.getElementById('summary-section');
const tableContainer = document.getElementById('table-container');
const paginationContainer = document.getElementById('pagination-container');
const modalRoot = document.getElementById('modal-root');

const STATUS_OPTIONS = [
    ['', '全部狀態'],
    ['new', '新回饋'],
    ['reviewed', '已閱讀'],
    ['in_progress', '處理中'],
    ['resolved', '已解決'],
    ['closed', '已關閉'],
];

const CATEGORY_OPTIONS = [
    ['', '全部類型'],
    ['feature', '許願功能'],
    ['bug', 'BUG 回報'],
    ['other', '其他'],
];

const statusSelect = el('select', { className: 'input-field' });
STATUS_OPTIONS.forEach(([v, label]) => {
    statusSelect.appendChild(el('option', { value: v, textContent: label }));
});

const categorySelect = el('select', { className: 'input-field' });
CATEGORY_OPTIONS.forEach(([v, label]) => {
    categorySelect.appendChild(el('option', { value: v, textContent: label }));
});

const userInput = el('input', { className: 'input-field', placeholder: '使用者 UUID（可選）' });
const searchInput = el('input', { className: 'input-field', placeholder: '搜尋回饋內容…', type: 'search' });
const searchBtn = el('button', { className: 'btn btn-primary', textContent: '搜尋' });

searchBtn.addEventListener('click', () => {
    filterStatus = statusSelect.value;
    filterCategory = categorySelect.value;
    filterUserId = userInput.value.trim();
    searchQ = searchInput.value.trim();
    currentPage = 1;
    load();
});
searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') searchBtn.click(); });

toolbar.appendChild(statusSelect);
toolbar.appendChild(categorySelect);
toolbar.appendChild(userInput);
toolbar.appendChild(searchInput);
toolbar.appendChild(searchBtn);

function statusBadgeType(status) {
    const map = {
        new: 'warning',
        reviewed: 'info',
        in_progress: 'info',
        resolved: 'success',
        closed: 'neutral',
    };
    return map[status] || 'neutral';
}

function copyBtn(text) {
    const btn = el('button', { className: 'btn btn-sm', textContent: '複製' });
    btn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(text);
            btn.textContent = '已複製';
            setTimeout(() => { btn.textContent = '複製'; }, 1500);
        } catch {
            btn.textContent = '失敗';
        }
    });
    return btn;
}

async function load() {
    showLoading(tableContainer);
    clear(paginationContainer);
    clear(summarySection);
    try {
        const data = await apiFetch('/api/feedback', {
            status: filterStatus,
            category: filterCategory,
            user_id: filterUserId,
            q: searchQ,
            page: currentPage,
            limit,
        });

        if (data.status_summary?.length) {
            const stats = el('div', { className: 'stats-grid' });
            data.status_summary.forEach(s => {
                stats.appendChild(el('div', { className: 'stat-card' },
                    el('div', { className: 'label', textContent: s.status }),
                    el('div', { className: 'value', textContent: String(s.count) }),
                ));
            });
            summarySection.appendChild(stats);
        }

        clear(tableContainer);
        tableContainer.appendChild(buildTable([
            { label: '時間', render: r => formatDate(r.created_at) },
            { label: '類型', render: r => badge(r.category_label || r.category, 'info') },
            { label: '狀態', render: r => badge(r.status_label || r.status, statusBadgeType(r.status)) },
            { label: '使用者', render: r => `${r.email || r.username}` },
            { label: 'UUID', render: r => {
                const span = el('span', { textContent: truncateUuid(r.user_id), title: r.user_id });
                return span;
            }},
            { label: '內容', render: r => truncate(r.message, 60) },
            { label: '頁面', render: r => truncate(r.page_url || '-', 30) },
            { label: '操作', render: r => {
                const btn = el('button', { className: 'btn btn-sm', textContent: '詳情' });
                btn.addEventListener('click', () => showDetail(r.id));
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

async function showDetail(feedbackId) {
    const { overlay, body } = createModal('回饋詳情');
    modalRoot.appendChild(overlay);
    showLoading(body);

    try {
        const item = await apiFetch(`/api/feedback/${feedbackId}`);
        clear(body);

        const uuidRow = el('div', { className: 'toolbar', style: 'margin-bottom:0.75rem' });
        uuidRow.appendChild(el('span', { textContent: '回饋 ID: ' }));
        uuidRow.appendChild(el('code', { textContent: item.id, style: 'font-size:0.82rem' }));
        uuidRow.appendChild(copyBtn(item.id));
        body.appendChild(uuidRow);

        const grid = el('div', { className: 'detail-grid' });
        const fields = [
            ['使用者 Email', item.email],
            ['Username', item.username],
            ['使用者狀態', item.user_status],
            ['類型', item.category_label || item.category],
            ['狀態', item.status_label || item.status],
            ['建立時間', formatDate(item.created_at)],
            ['更新時間', formatDate(item.updated_at)],
            ['頁面 URL', item.page_url || '-'],
        ];
        fields.forEach(([label, val]) => {
            grid.appendChild(el('div', { className: 'detail-item' },
                el('div', { className: 'label', textContent: label }),
                el('div', { className: 'value', textContent: String(val ?? '-') }),
            ));
        });

        const userUuidItem = el('div', { className: 'detail-item', style: 'grid-column:1/-1' });
        userUuidItem.appendChild(el('div', { className: 'label', textContent: '使用者 UUID' }));
        const userUuidRow = el('div', { className: 'value', style: 'display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap' });
        userUuidRow.appendChild(el('code', { textContent: item.user_id, style: 'font-size:0.82rem;word-break:break-all' }));
        userUuidRow.appendChild(copyBtn(item.user_id));
        userUuidItem.appendChild(userUuidRow);
        grid.appendChild(userUuidItem);
        body.appendChild(grid);

        body.appendChild(el('div', { className: 'card', style: 'margin-top:1rem' },
            el('div', { className: 'card-title', textContent: '回饋內容' }),
            el('div', { className: 'trace-block', textContent: item.message }),
        ));

        if (item.user_agent) {
            body.appendChild(el('div', { className: 'card', style: 'margin-top:1rem' },
                el('div', { className: 'card-title', textContent: 'User Agent' }),
                el('div', { className: 'trace-block', textContent: item.user_agent }),
            ));
        }

        if (item.context && Object.keys(item.context).length) {
            body.appendChild(el('div', { className: 'card', style: 'margin-top:1rem' },
                el('div', { className: 'card-title', textContent: 'Context（頁面情境）' }),
                renderJson(item.context),
            ));
        }

        const statusRow = el('div', { className: 'toolbar', style: 'margin-top:1rem' });
        const statusUpdate = el('select', { className: 'input-field' });
        STATUS_OPTIONS.filter(([v]) => v).forEach(([v, label]) => {
            const opt = el('option', { value: v, textContent: label });
            if (v === item.status) opt.selected = true;
            statusUpdate.appendChild(opt);
        });
        const updateBtn = el('button', { className: 'btn btn-primary', textContent: '更新狀態' });
        const statusMsg = el('span', { style: 'font-size:0.85rem;color:var(--text-dim)' });

        updateBtn.addEventListener('click', async () => {
            updateBtn.disabled = true;
            try {
                await apiFetch(`/api/feedback/${feedbackId}/status`, {}, {
                    method: 'PATCH',
                    body: { status: statusUpdate.value },
                });
                statusMsg.textContent = '已更新';
                load();
            } catch (err) {
                statusMsg.textContent = err.message;
                statusMsg.style.color = 'var(--danger)';
            } finally {
                updateBtn.disabled = false;
            }
        });

        statusRow.appendChild(el('span', { textContent: '工單狀態：' }));
        statusRow.appendChild(statusUpdate);
        statusRow.appendChild(updateBtn);
        statusRow.appendChild(statusMsg);
        body.appendChild(statusRow);

        const links = el('div', { className: 'toolbar', style: 'margin-top:0.75rem' });
        links.appendChild(el('a', {
            className: 'btn',
            href: `/html/users.html`,
            textContent: '使用者列表',
        }));
        links.appendChild(el('a', {
            className: 'btn',
            href: `/html/conversations.html?user_id=${item.user_id}`,
            textContent: '查看該使用者問答',
        }));
        body.appendChild(links);
    } catch (err) {
        showError(body, err.message);
    }

    if (window.lucide) lucide.createIcons();
}

load();
