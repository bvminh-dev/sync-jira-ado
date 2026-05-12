import axios from "axios";

const {
  JIRA_BASE_URL,
  JIRA_EMAIL,
  JIRA_API_TOKEN,
  JIRA_PROJECT_KEY,
  JIRA_JQL_EXTRA,
} = process.env;

const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");

console.log(
  JIRA_BASE_URL,
  JIRA_EMAIL,
  JIRA_API_TOKEN,
  JIRA_PROJECT_KEY,
  JIRA_JQL_EXTRA,
  auth,
);

const client = axios.create({
  baseURL: `${JIRA_BASE_URL}/rest/api/3`,
  headers: {
    Authorization: `Basic ${auth}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  },
  timeout: 30_000,
});

const DEFAULT_FIELDS = [
  // "*all",
  "summary",
  "description",
  "status",
  "priority",
  "issuetype",
  "assignee",
  "reporter",
  "labels",
  "updated",
  "created",
  "parent",
  "subtasks",
  "duedate",
  "components",
];

/**
 * POST /rest/api/3/search/jql — enhanced search, cursor-based pagination.
 * Docs: https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/#api-rest-api-3-search-jql-post
 */
export async function searchJql({
  jql,
  fields = DEFAULT_FIELDS,
  expand,
  maxResults = 100,
  nextPageToken,
  fieldsByKeys,
  properties,
  reconcileIssues,
} = {}) {
  const body = {
    jql,
    maxResults,
    fields: Array.isArray(fields) ? fields : [fields],
  };
  if (expand) body.expand = Array.isArray(expand) ? expand.join(",") : expand;
  if (nextPageToken) body.nextPageToken = nextPageToken;
  if (fieldsByKeys !== undefined) body.fieldsByKeys = fieldsByKeys;
  if (properties)
    body.properties = Array.isArray(properties) ? properties : [properties];
  if (reconcileIssues) {
    body.reconcileIssues = Array.isArray(reconcileIssues)
      ? reconcileIssues
      : [reconcileIssues];
  }

  console.log("body", JSON.stringify(body));

  const { data } = await client.post("/search/jql", body, {
    headers: { "Content-Type": "application/json" },
  });
  return data; // { issues, nextPageToken?, isLast? }
}

/**
 * GET /rest/api/3/issue/{issueIdOrKey} — lấy chi tiết 1 issue.
 * Docs: https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-get
 */
export async function getIssue(idOrKey, { fields, expand } = {}) {
  const params = {};
  if (fields) params.fields = Array.isArray(fields) ? fields.join(",") : fields;
  if (expand) params.expand = Array.isArray(expand) ? expand.join(",") : expand;
  const { data } = await client.get(`/issue/${encodeURIComponent(idOrKey)}`, {
    params,
  });
  return data;
}

/**
 * Lặp toàn bộ trang kết quả JQL — dùng cursor `nextPageToken`.
 * Không dựa vào `total` (API mới đã bỏ trường này).
 */
export async function iterateJql(opts) {
  const all = [];
  let nextPageToken;
  while (true) {
    const data = await searchJql({ ...opts, nextPageToken });
    if (Array.isArray(data.issues)) all.push(...data.issues);
    if (data.isLast || !data.nextPageToken) break;
    nextPageToken = data.nextPageToken;
  }
  return all;
}

/**
 * Fetch issues updated since `sinceIso`. Granularity của JQL `updated` là phút.
 */
export async function fetchUpdatedIssues(sinceIso) {
  const sinceDate = new Date(sinceIso);
  const jqlTime = formatJqlDate(sinceDate);

  const parts = [`updated >= "${jqlTime}"`];
  if (JIRA_PROJECT_KEY) parts.push(`project = ${JIRA_PROJECT_KEY}`);
  if (JIRA_JQL_EXTRA) parts.push(`(${JIRA_JQL_EXTRA})`);
  const jql = `${parts.join(" AND ")} ORDER BY updated ASC`;

  return iterateJql({ jql, fields: DEFAULT_FIELDS });
}

function formatJqlDate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(
    d.getUTCDate(),
  )} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function extractPlainText(adfOrString) {
  if (!adfOrString) return "";
  if (typeof adfOrString === "string") return adfOrString;
  const walk = (node) => {
    if (!node) return "";
    if (node.type === "text") return node.text || "";
    if (Array.isArray(node.content))
      return node.content.map(walk).join(node.type === "paragraph" ? "" : "\n");
    return "";
  };
  return walk(adfOrString).trim();
}
