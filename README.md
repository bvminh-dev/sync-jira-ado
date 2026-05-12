# sync-jira-ado

Đồng bộ ticket từ **Jira** sang **Azure DevOps**, chạy mỗi **2 phút** trên **Vercel Cron**, lọc theo `updated`.

## Kiến trúc

- `api/sync.js` — Vercel Serverless Function, endpoint cho cron.
- `lib/jira.js` — query Jira bằng JQL `updated >= <lastSync>`.
- `lib/ado.js` — upsert work item qua WIQL + Patch API.
- `lib/state.js` — lưu cursor `lastSyncIso` trong Vercel KV (Upstash). Nếu chưa cấu hình KV thì dùng sliding window `SYNC_WINDOW_MINUTES`.
- `lib/sync.js` — pipeline map + upsert.
- `vercel.json` — `*/2 * * * *`.

## Thiết lập

1. Tạo **Jira API token**: https://id.atlassian.com/manage-profile/security/api-tokens
2. Tạo **ADO PAT** scope `Work Items (Read & Write)`.
3. Trong ADO process, thêm **custom field** lưu Jira key (vd `Custom.JiraKey`) cho work item type bạn dùng — dùng để upsert idempotent.
4. (Khuyến nghị) Tạo **Vercel KV** store để lưu cursor giữa các lần chạy.

## Deploy Vercel

```bash
npm i -g vercel
vercel link
vercel env add JIRA_BASE_URL
vercel env add JIRA_EMAIL
vercel env add JIRA_API_TOKEN
vercel env add JIRA_PROJECT_KEY
vercel env add ADO_ORG
vercel env add ADO_PROJECT
vercel env add ADO_PAT
vercel env add ADO_WORK_ITEM_TYPE
vercel env add ADO_JIRA_KEY_FIELD
vercel env add CRON_SECRET
# nếu dùng KV: tạo từ dashboard, các biến KV_REST_API_* sẽ tự inject
vercel deploy --prod
```

> ⚠️ **Vercel Cron** chỉ hỗ trợ tần suất theo phút (`*/2 * * * *`) trên **Pro plan** trở lên. Hobby plan tối thiểu 1 lần/ngày.

## Test local

```bash
cp .env.example .env
npm i
npm i -D dotenv
npm run sync:local
```

Hoặc dùng `vercel dev` rồi gọi:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/sync
```

## Mapping mặc định

| Jira                  | ADO                                  |
|-----------------------|--------------------------------------|
| `key + summary`       | `System.Title`                       |
| `description` (ADF)   | `System.Description` (plain text)    |
| `priority`            | `Microsoft.VSTS.Common.Priority`     |
| `labels`              | `System.Tags`                        |
| `status`              | `System.State` (qua `STATUS_MAP`)    |
| `key`                 | `Custom.JiraKey` (upsert key)        |

Sửa `STATUS_MAP` và `mapIssueToAdoFields` trong [lib/sync.js](lib/sync.js) cho đúng workflow của bạn.
