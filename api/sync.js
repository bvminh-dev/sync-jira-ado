import {
  fetchUpdatedIssues,
  extractPlainText,
  fetchUpdatedIssuesDetail,
  downloadAttachment,
} from "../lib/jira.js";
import {
  findWorkItemByJiraKey,
  createWorkItem,
  updateWorkItem,
  updateWorkItemFeature,
  updateWorkItemTask,
  createWorkFeature,
  createWorkTask,
  removeAllAttachments,
  uploadAttachment,
} from "../lib/ado.js";
import { getLastSyncIso, setLastSyncIso } from "../lib/state.js";

const { ADO_PROJECT, ADO_JIRA_KEY_FIELD = "Custom.JiraID" } = process.env;

// Jira issue type -> ADO work item type
const TYPE_MAP = {
  Task: "Product Backlog Item",
  Story: "Product Backlog Item",
  "Sub-task": "Task",
  Subtask: "Task",
  Bug: "Bug",
};

function extractText(node) {
  let results = [];

  if (Array.isArray(node)) {
    for (const item of node) {
      results.push(extractText(item));
    }
  } else if (node && typeof node === "object") {
    if (node.type === "text" && node.text) {
      results.push(node.text);
    }

    for (const key in node) {
      results.push(extractText(node[key]));
    }
  }

  return results.filter(Boolean).join("\n");
}

const mapPriority = {
  Highest: "1",
  High: "2",
  Medium: "3",
  Low: "4",
  Lowest: "4",
};

const mapUserPBI = {
  "To Do": "New",
  "In Progress": "In Progress",
  "In Review": "In Progress",
  Done: "Done",
};

const mapStateTask = {
  "To Do": "To Do",
  "In Progress": "In Progress",
  "In Review": "In Progress",
  Done: "Done",
};

async function runSync() {
  const startedAt = new Date();
  const since = await getLastSyncIso();
  console.log(`[sync] since=${since}`);

  const issues = await fetchUpdatedIssues(since);
  const listHasSubTask = issues.filter((x) => x.fields.subtasks.length > 0);
  console.log("listHasSubTask", JSON.stringify(listHasSubTask));
  console.log(`[sync] ${issues.length} updated issue(s) from Jira`);

  // Parent trước con để link hierarchy được giải quyết khi tạo Sub-task.
  issues.sort((a, b) => (isSubtask(a) ? 1 : 0) - (isSubtask(b) ? 1 : 0));

  const results = { created: 0, updated: 0, skipped: 0, errors: [] };

  for (const issue of issues) {
    try {
      const jiraID = issue.id;
      const issueDetailList = await fetchUpdatedIssuesDetail(jiraID);
      if (issueDetailList.length === 0) {
        continue;
      }
      const issueDetail = issueDetailList[0];
      if (issueDetail.key === "SE-156") {
        console.log("den roi");
      }

      const workItemType = resolveAdoType(issueDetail);
      const title = issueDetail.fields.summary;
      const description = extractText(issueDetail);
      const startDate = issueDetail.fields.created;
      const targetDate = issueDetail.fields.duedate;

      const priorityName = issueDetail.fields?.priority?.name ?? "4";
      const priority = mapPriority?.[priorityName] ?? "4";

      const stateName = issueDetail.fields?.status?.name ?? ""; // nếu khác new hay to do thì cần update đúng trạng thái
      const state =
        workItemType === "Product Backlog Item"
          ? mapUserPBI?.[stateName] || "New"
          : mapStateTask?.[stateName] || "To Do";
      const component = issueDetail.fields.components.name;
      const areaPath = `Tickets\\Clients\\C-Keppel\\P-KAI`;
      const iterationPath = `Tickets\\Weekly Sprint\\Sprint 62`;
      const createdByOld =
        (issueDetail.fields?.reporter?.emailAddress ??
        issueDetail.fields?.reporter?.displayName === "Phạm Quang Huy")
          ? "huy.pham@atstechnology.vn"
          : issueDetail.fields?.reporter?.displayName === "Nguyen Hong Quan"
            ? "quan.nguyen@atstechnology.vn"
            : issueDetail.fields?.reporter?.displayName === "Thai Le (Tyson)"
              ? "thai.le@atstechnology.vn"
              : issueDetail.fields?.reporter?.displayName === "Hien To"
                ? "hien.to@atstechnology.vn"
                : issueDetail.fields?.reporter?.displayName === "Le Phi Hung"
                  ? "hung.le@atstechnology.vn"
                  : "hung.le@atstechnology.vn"; // đổi về mail torus

      const assignToOld =
        (issueDetail.fields?.assignee?.emailAddress ??
        issueDetail.fields?.assignee?.displayName === "Phạm Quang Huy")
          ? "huy.pham@atstechnology.vn"
          : issueDetail.fields?.assignee?.displayName === "Nguyen Hong Quan"
            ? "quan.nguyen@atstechnology.vn"
            : issueDetail.fields?.assignee?.displayName === "Thai Le (Tyson)"
              ? "thai.le@atstechnology.vn"
              : issueDetail.fields?.assignee?.displayName === "Hien To"
                ? "hien.to@atstechnology.vn"
                : issueDetail.fields?.assignee?.displayName === "Le Phi Hung"
                  ? "hung.le@atstechnology.vn"
                  : ""; // đổi về mail torus

      const createdBy =
        createdByOld.includes("hien.to") ||
        createdByOld.includes("thai.le") ||
        // createdByOld.includes("hung.le") ||
        createdByOld.includes("quan.nguyen") ||
        createdByOld.includes("huy.pham")
          ? createdByOld.replaceAll("atstechnology", "torus")
          : "";

      const assignTo =
        assignToOld.includes("hien.to") ||
        assignToOld.includes("thai.le") ||
        // assignToOld.includes("hung.le") ||
        assignToOld.includes("quan.nguyen") ||
        assignToOld.includes("huy.pham")
          ? assignToOld.replaceAll("atstechnology", "torus")
          : assignToOld.includes("hung.le")
            ? "hung.le@atstechnology.vn"
            : "";

      if (!assignTo) {
        continue;
      }

      const keyLinkAdo = `${issueDetail.key} - ${jiraID}`;
      const existingId = await findWorkItemByJiraKey(keyLinkAdo);
      const keyParentLinkAdo = `${issueDetail.fields?.parent?.key} - ${issueDetail.fields?.parent?.id}`;
      const parentId = issueDetail.fields?.parent?.key
        ? await findWorkItemByJiraKey(keyParentLinkAdo)
        : null;
      let parentIDOfAdo = "";
      let currentAdoId = null;
      console.log(
        `current: ${existingId} - patentId: ${parentId} - keyParentLinkAdo: ${keyParentLinkAdo}`,
      );
      if (existingId) {
        const data =
          workItemType === "Product Backlog Item"
            ? await updateWorkItemFeature(
                existingId,
                `${keyLinkAdo} - ${title}`,
                description,
                startDate,
                targetDate,
                priority,
                state,
                areaPath,
                iterationPath,
                keyLinkAdo,
                createdBy,
                assignTo,
                parentId,
              )
            : await updateWorkItemTask(
                existingId,
                `${keyLinkAdo} - ${title}`,
                assignTo,
                description,
                parentId,
                startDate,
                null,
                priority,
                state,
                areaPath,
                iterationPath,
                keyLinkAdo,
                createdBy,
              );
        parentIDOfAdo =
          workItemType === "Product Backlog Item" ? data.id : null;
        currentAdoId = data.id;
        results.updated++;
      } else {
        const fakeState =
          workItemType === "Product Backlog Item" ? "New" : "To Do";
        const data =
          workItemType === "Product Backlog Item"
            ? await createWorkFeature(
                `${keyLinkAdo} - ${title}`,
                description,
                startDate,
                targetDate,
                priority,
                fakeState,
                areaPath,
                iterationPath,
                keyLinkAdo,
                createdBy,
                assignTo,
                parentId,
              )
            : await createWorkTask(
                `${keyLinkAdo} - ${title}`,
                assignTo,
                description,
                parentId,
                startDate,
                null,
                priority,
                fakeState,
                areaPath,
                iterationPath,
                keyLinkAdo,
                createdBy,
              );
        if (fakeState !== state) {
          // update realState
          workItemType === "Product Backlog Item"
            ? await updateWorkItemFeature(
                data.id,
                `${keyLinkAdo} - ${title}`,
                description,
                startDate,
                targetDate,
                priority,
                state,
                areaPath,
                iterationPath,
                keyLinkAdo,
                createdBy,
                assignTo,
                parentId,
              )
            : await updateWorkItemTask(
                data.id,
                `${keyLinkAdo} - ${title}`,
                assignTo,
                description,
                parentId,
                startDate,
                null,
                priority,
                state,
                areaPath,
                iterationPath,
                keyLinkAdo,
                createdBy,
              );
        }
        parentIDOfAdo =
          workItemType === "Product Backlog Item" ? data.id : null;
        currentAdoId = data.id;
        results.created++;
      }

      await syncAttachments(currentAdoId, issueDetail.fields.attachment);

      const subTask = issue.fields.subtasks;
    } catch (e) {
      console.error(
        `[sync] error on ${issue.key}:`,
        e.response?.data || e.message,
      );
      results.errors.push({ key: issue.key, message: e.message });
    }
  }

  await setLastSyncIso(startedAt.toISOString());
  console.log(`[sync] done`, results);
  return { since, until: startedAt.toISOString(), ...results };
}

async function syncAttachments(workItemId, listAttachments) {
  if (!workItemId) return;
  if (!Array.isArray(listAttachments) || listAttachments.length === 0) {
    try {
      await removeAllAttachments(workItemId);
    } catch (e) {
      console.warn(
        `[sync] removeAllAttachments(${workItemId}) failed:`,
        e.response?.data || e.message,
      );
    }
    return;
  }

  try {
    await removeAllAttachments(workItemId);
  } catch (e) {
    console.warn(
      `[sync] removeAllAttachments(${workItemId}) failed:`,
      e.response?.data || e.message,
    );
  }

  for (const att of listAttachments) {
    try {
      const buffer = await downloadAttachment(att.content);
      await uploadAttachment(workItemId, att.filename, buffer);
      console.log(
        `[sync] attached ${att.filename} (${att.size ?? "?"}B) -> WI ${workItemId}`,
      );
    } catch (e) {
      console.warn(
        `[sync] failed to attach ${att.filename} -> WI ${workItemId}:`,
        e.response?.data || e.message,
      );
    }
  }
}

function isSubtask(issue) {
  return (
    Boolean(issue.fields?.issuetype?.subtask) || Boolean(issue.fields?.parent)
  );
}

function resolveAdoType(issue) {
  const issuetype = issue.fields?.issuetype?.name?.toLowerCase() || "task";
  if (issuetype === "subtask" || issuetype === "sub-task") return "Task";
  return "Product Backlog Item";
}

async function resolveParentAdoId(issue) {
  const parentKey = issue.fields?.parent?.key;
  if (!parentKey) return null;
  try {
    return await findWorkItemByJiraKey(parentKey);
  } catch (e) {
    console.warn(`[sync] cannot resolve parent ${parentKey}:`, e.message);
    return null;
  }
}

function mapIssueToAdoFields(issue) {
  const f = issue.fields || {};
  const subtask = Boolean(f.issuetype?.subtask);

  const common = {
    "System.Title": f.summary || "",
    "System.AssignedTo": f.assignee?.displayName,
    "System.Description": extractPlainText(f.description),
    "Microsoft.VSTS.Scheduling.StartDate": toIsoDate(f.created),
    "Microsoft.VSTS.Common.Priority": f.priority?.name,
    "System.State": f.status?.name,
    [ADO_JIRA_KEY_FIELD]: issue.key,
    "System.AreaPath": resolveAreaPath(f.components),
  };

  if (subtask) {
    return {
      ...common,
      "Microsoft.VSTS.Scheduling.DueDate": toIsoDate(f.duedate),
      // System.Parent là link hierarchy — set qua relations, không qua field.
    };
  }

  return {
    ...common,
    "System.CreatedBy": f.reporter?.displayName,
    "Microsoft.VSTS.Scheduling.TargetDate": toIsoDate(f.duedate),
  };
}

function resolveAreaPath(components) {
  if (!Array.isArray(components) || components.length === 0) return undefined;
  const name = components[0]?.name;
  if (!name) return undefined;
  return `${ADO_PROJECT}\\${name}`;
}

function toIsoDate(value) {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export default async function handler(req, res) {
  // Vercel cron sends GET with `Authorization: Bearer $CRON_SECRET`.
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers["authorization"];
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  try {
    const result = await runSync();
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    console.error("[api/sync] failed:", e.response?.data || e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
