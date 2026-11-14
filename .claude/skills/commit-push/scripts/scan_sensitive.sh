#!/usr/bin/env bash
# 掃描「即將被 commit 的變更」中是否含隱私／機密資料。
# 用法：bash .claude/skills/commit-push/scripts/scan_sensitive.sh
# 結束碼：0 = 沒有發現；1 = 有可疑項目（需人工判斷）；2 = 有絕對不能提交的檔案
set -uo pipefail

cd "$(git rev-parse --show-toplevel)" || exit 2

# 讓未追蹤檔案也出現在 diff 中（intent-to-add，不會真的 stage 內容）
git ls-files --others --exclude-standard -z | xargs -0 -r git add -N --

status=0

echo "== 1. 禁止提交的檔案 =="
blocked=$(git diff HEAD --name-only | grep -E '(^|/)\.env(\..+)?$|\.pem$|\.key$|\.p12$|\.pfx$|id_rsa|id_ed25519|credentials.*\.json$|service[-_]account.*\.json$|\.sqlite3?$|\.db$|\.dump$' | grep -vE '\.env\.example$' || true)
if [[ -n "$blocked" ]]; then
    echo "$blocked"
    status=2
else
    echo "（無）"
fi

echo
echo "== 2. 新增內容中的可疑字串 =="
# 只看新增行（+），排除 diff header
pattern='(password|passwd|pwd|secret|api[_-]?key|access[_-]?key|private[_-]?key|token)[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9_/+=.-]{8,}'
pattern+='|sk-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}'
pattern+='|-----BEGIN [A-Z ]*PRIVATE KEY-----'
pattern+='|(postgres(ql)?|mysql|mongodb(\+srv)?|redis|amqp)://[^[:space:]:/@]+:[^[:space:]@]+@'
pattern+='|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
pattern+='|/Users/[A-Za-z0-9._-]+/|/home/[A-Za-z0-9._-]+/|C:\\\\Users\\\\'
pattern+='|\b(10|192\.168|172\.(1[6-9]|2[0-9]|3[01]))\.[0-9]{1,3}\.[0-9]{1,3}(\.[0-9]{1,3})?\b'
pattern+='|\b09[0-9]{2}-?[0-9]{3}-?[0-9]{3}\b|\b[A-Z][12][0-9]{8}\b'

added=$(git diff HEAD -U0 --no-color \
    | awk '/^\+\+\+ /{file=substr($0,7); next} /^\+/{print file": "substr($0,2)}')
hits=$(printf '%s\n' "$added" | grep -E "$pattern")
rc=$?
if (( rc > 1 )); then
    echo "!! grep 執行失敗（正則錯誤），本段檢查無效" >&2
    exit 2
fi
hits=$(printf '%s\n' "$hits" \
    | grep -vE 'noreply@anthropic\.com|example\.(com|org)|@localhost|user@|your[_-]|YOUR_|<[a-z_]+>|\$\{?[A-Z_]+\}?|os\.getenv|os\.environ|placeholder' \
    || true)
if [[ -n "$hits" ]]; then
    echo "$hits"
    [[ $status -eq 0 ]] && status=1
else
    echo "（無）"
fi

echo
echo "== 3. 大型檔案（> 1MB）=="
big=""
while IFS= read -r f; do
    [[ -f "$f" ]] || continue
    size=$(wc -c < "$f" | tr -d ' ')
    if (( size > 1048576 )); then big+="$f ($size bytes)"$'\n'; fi
done < <(git diff HEAD --name-only --diff-filter=AM)
if [[ -n "$big" ]]; then
    printf '%s' "$big"
    [[ $status -eq 0 ]] && status=1
else
    echo "（無）"
fi

exit $status
