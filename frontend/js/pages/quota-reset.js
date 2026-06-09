import { apiFetch, formatNumber, formatCost, formatDate } from '../api.js';
import { el, clear, buildTable, showLoading, showError, badge } from '../dom.js';
import { pageShell } from '../layout.js';

pageShell('配額重置', '重置使用者當期 Token 配額，保留花費流水紀錄', '/html/quota-reset.html');

const params = new URLSearchParams(window.location.search);
let userId = params.get('user_id') || '';

const toolbar = document.getElementById('toolbar');
const quotaInfo = document.getElementById('quota-info');
const periodHistory = document.getElementById('period-history');

const userInput = el('input', {
    className: 'input-field',
    placeholder: '使用者 UUID',
    value: userId,
    style: 'min-width:320px',
});
const loadBtn = el('button', { className: 'btn btn-primary', textContent: '載入' });
const resetBtn = el('button', { className: 'btn', textContent: '重置配額', style: 'border-color:rgba(248,113,113,0.4);color:var(--danger)' });
const noteInput = el('input', { className: 'input-field', placeholder: '備註（可選）', style: 'min-width:200px' });

loadBtn.addEventListener('click', () => {
    userId = userInput.value.trim();
    if (!userId) return;
    loadQuota();
});
userInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadBtn.click(); });

resetBtn.addEventListener('click', async () => {
    userId = userInput.value.trim();
    if (!userId) return;
    const confirmed = window.confirm(
        `確定要重置使用者 ${userId} 的配額計數器嗎？\n\n` +
        '這會將 used_tokens 歸零並開始新週期，但不會刪除 token_usage_logs 的花費紀錄。'
    );
    if (!confirmed) return;

    resetBtn.disabled = true;
    try {
        const note = noteInput.value.trim() || null;
        const result = await apiFetch(`/api/quota/user/${userId}/reset`, {}, {
            method: 'POST',
            body: { note },
        });
        alert(result.message || '重置成功');
        loadQuota();
    } catch (err) {
        alert('重置失敗：' + err.message);
    } finally {
        resetBtn.disabled = false;
    }
});

toolbar.appendChild(userInput);
toolbar.appendChild(noteInput);
toolbar.appendChild(loadBtn);
toolbar.appendChild(resetBtn);

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

async function loadQuota() {
    showLoading(quotaInfo);
    clear(periodHistory);
    try {
        const data = await apiFetch(`/api/quota/user/${userId}`);
        clear(quotaInfo);

        const stats = el('div', { className: 'stats-grid' });
        [
            { label: '當期已用（配額）', value: formatNumber(data.used_tokens) },
            { label: '月上限', value: formatNumber(data.monthly_token_limit) },
            { label: '剩餘', value: formatNumber(data.remaining_tokens) },
            { label: '當期流水 Token', value: formatNumber(data.current_period?.total_tokens) },
            { label: '當期流水花費', value: formatCost(data.current_period?.total_cost_usd) },
            { label: '累計花費（永不重置）', value: formatCost(data.all_time?.total_cost_usd) },
        ].forEach(s => {
            stats.appendChild(el('div', { className: 'stat-card' },
                el('div', { className: 'label', textContent: s.label }),
                el('div', { className: 'value', textContent: s.value }),
            ));
        });

        const uuidRow = el('div', { className: 'toolbar', style: 'margin-bottom:1rem' });
        uuidRow.appendChild(el('span', { textContent: 'UUID: ' }));
        uuidRow.appendChild(el('code', { textContent: data.user_id || data.id, style: 'font-size:0.85rem' }));
        uuidRow.appendChild(copyBtn(data.user_id || data.id));

        quotaInfo.appendChild(el('div', { className: 'card' },
            el('div', { className: 'card-title', textContent: `${data.email} (${data.username})` }),
            uuidRow,
            el('div', { className: 'detail-grid', style: 'margin-bottom:1rem' },
                el('div', { className: 'detail-item' },
                    el('div', { className: 'label', textContent: '等級' }),
                    el('div', { className: 'value', textContent: data.tier_name || '-' }),
                ),
                el('div', { className: 'detail-item' },
                    el('div', { className: 'label', textContent: '週期起始' }),
                    el('div', { className: 'value', textContent: formatDate(data.current_period_start) }),
                ),
            ),
            stats,
        ));

        if (data.period_history?.length) {
            periodHistory.appendChild(el('div', { className: 'card' },
                el('div', { className: 'card-title', textContent: '各重置區間用量' }),
                buildTable([
                    { label: '類型', render: r => badge(r.type === 'current' ? '當期' : '已結束', r.type === 'current' ? 'info' : 'neutral') },
                    { label: '區間起始', render: r => formatDate(r.period_start) },
                    { label: '區間結束', render: r => r.period_end ? formatDate(r.period_end) : '進行中' },
                    { label: '配額計數', render: r => r.quota_used_tokens != null ? formatNumber(r.quota_used_tokens) : '-' },
                    { label: '流水 Token', render: r => formatNumber(r.total_tokens) },
                    { label: '流水花費', render: r => formatCost(r.total_cost_usd) },
                    { label: '備註', render: r => r.note || '-' },
                ], data.period_history),
            ));
        }
    } catch (err) {
        showError(quotaInfo, err.message);
    }
}

if (userId) loadQuota();
