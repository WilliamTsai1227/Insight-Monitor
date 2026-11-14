---
name: commit-push
description: 檢查目前變更有無隱私/機密資料，確認分支正確後 git commit 並 git push。使用者輸入 /commit-push 時執行。
disable-model-invocation: true
argument-hint: "[可選：commit 訊息重點或要推的分支]"
---

# /commit-push：隱私檢查 → commit → 分支檢查 → push

依序執行以下步驟。任何一步「停止」時，向使用者說明原因與建議，**不要**自行繞過。

使用者附加的說明（可能為空）：$ARGUMENTS

## 1. 盤點變更

```bash
git status --short
git diff HEAD --stat
```

- 沒有任何變更 → 告知使用者並結束。
- 已有未 push 的 commit 但工作區乾淨 → 跳到步驟 4。

## 2. 隱私／機密檢查（必做）

```bash
bash .claude/skills/commit-push/scripts/scan_sensitive.sh
```

腳本只是第一道篩選，**必須再自己讀過完整 diff**（`git diff HEAD`，含新檔案），判斷有無：

- `.env`、金鑰、憑證、token、密碼、含帳密的連線字串（DATABASE_URL 等）
- 真實使用者資料：email、姓名、電話、身分證字號、真實使用者 UUID、聊天內容、資料庫匯出
- 個人環境資訊：本機絕對路徑（`/Users/<name>/…`）、內網 IP、主機名稱
- 不該進版控的產物：`.venv/`、`__pycache__/`、log、大型二進位檔

判斷規則：

- 腳本結束碼 2，或人工確認有真的機密 → **停止**，列出檔案與行號，建議移除／改用環境變數／加入 `.gitignore`。不要 commit。
- 命中但確認是誤判（例如 `/api/users/` 被路徑規則命中、`.env.example` 的空白範例值）→ 在回報中簡短說明為何是誤判，繼續。
- 若發現機密**已經存在於過去的 commit** → 停止並提醒使用者需輪替（rotate）該機密，不要嘗試改寫歷史。

## 3. Commit

- 只 stage 本次相關的檔案（用明確路徑 `git add <path>…`，避免 `git add -A` 誤加入不相關檔案）。不確定某個檔案該不該加 → 問使用者。
- 參考 `git log -5 --format='%s%n%b'` 的既有風格撰寫訊息：第一行精簡摘要，空一行後寫重點（改了什麼、為什麼）。若使用者在 `$ARGUMENTS` 給了重點，以其為主。
- 用 HEREDOC 傳入訊息，並依照當前環境的 commit attribution 規定處理結尾署名。
- 不要使用 `--no-verify`；pre-commit hook 失敗就修正後建立**新的** commit，不要 `--amend`。

## 4. 分支檢查（push 前必做）

```bash
git branch --show-current
git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || echo "(無 upstream)"
git fetch origin
git status -sb
git log --oneline @{u}..HEAD 2>/dev/null
```

逐項確認：

1. **不是 detached HEAD**（`branch --show-current` 為空）→ 是的話停止。
2. **分支符合使用者意圖**：若 `$ARGUMENTS` 指定了分支而目前不在該分支 → 停止並告知。
3. **落後遠端**（behind > 0）→ 停止，建議先 `git pull --rebase`，不要強推。
4. **在預設分支（main/master）上**→ 用 AskUserQuestion 確認「直接推到 main」或「改開 feature 分支再推」；使用者在同一次對話已明確同意推 main 則不必再問。
5. 列出即將 push 的 commit（`@{u}..HEAD`），確認裡面沒有不該出現的 commit。

## 5. Push

```bash
git push                      # 已有 upstream
git push -u origin <branch>   # 新分支第一次推
```

- **禁止** `--force` / `--force-with-lease`，除非使用者明確要求。
- push 被拒（遠端有新 commit）→ 停止並回報，不要自動 rebase 或強推。

## 6. 回報

簡短告訴使用者：

- 隱私檢查結果（有無命中、哪些是誤判）
- commit hash 與標題
- 推到哪個 remote / 分支
- 若在 GitHub 上，附上 commit 或比較頁連結（`https://github.com/<owner>/<repo>/commit/<hash>`）
