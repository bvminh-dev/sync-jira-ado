import { fetchUpdatedIssues, extractPlainText } from "./jira.js";
import {
  findWorkItemByJiraKey,
  createWorkItem,
  updateWorkItem,
} from "./ado.js";
import { getLastSyncIso, setLastSyncIso } from "./state.js";

const { ADO_PROJECT, ADO_JIRA_KEY_FIELD = "Custom.JiraID" } = process.env;

// Jira issue type -> ADO work item type
const TYPE_MAP = {
  Task: "Feature",
  Story: "Feature",
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

export async function runSync() {
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
      const title = issue.fields.summary;
      const description = extractText(issue);
      const startDate = issue.fields.created;
      const targetDate = issue.fields.duedate;
      const priority = issue.fields.priority.name;
      const state = issue.fields.status.name;
      const component = issue.fields.components.name;
      const areaPath = `Tickets\\Clients\\C-Keppel\\P-KAI`;
      const iterationPath = `Tickets\\Weekly Sprint\\Sprint 60`;
      const reporter = issue.fields.reporter.displayName; // chua co
      const createdBy = issue.fields.reporter.displayName; // chua co
      const assignTo = issue.fields.assignee.emailAddress; // đổi về mail torus

      const subTask = issue.fields.subtasks;
      for (const st of subTask) {
        const stField = st.fields;
        const stJiraID = st.id;
        const stTitle = stField.summary;
        const stAssignTo = stField.assignee.emailAddress; // đổi về mail torus
        const stDes = extractText(st);
        const stParent = "..."; // get từ task
        const stStartDate = stField.created;
        const stDueDate = stField.duedate;
        const stPriority = stField.priority.name;
        const stState = stField.status.name;

        //  "System.Title": "fields.summary",
        //   "System.AssignedTo": "fields.assignee.displayName",
        //   "System.Description": "fields.description",
        //   "System.Parent": "fields.parent.key",
        //   "Microsoft.VSTS.Scheduling.StartDate": "fields.created",
        //   "Microsoft.VSTS.Scheduling.DueDate": "fields.duedate",
        //   "Microsoft.VSTS.Common.Priority": "fields.priority.name",
        //   "System.State": "fields.status.name",
        //   "Custom.JiraID": "key",
        //   "System.AreaPath": component
      }
      // const workItemType = resolveAdoType(issue);
      // const fields = mapIssueToAdoFields(issue);
      // const parentId = isSubtask(issue) ? await resolveParentAdoId(issue) : null;
      // const existingId = await findWorkItemByJiraKey(issue.key);
      // if (existingId) {
      //   await updateWorkItem(existingId, fields);
      //   results.updated++;
      // } else {
      //   await createWorkItem(workItemType, fields, parentId);
      //   results.created++;
      // }
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

function isSubtask(issue) {
  return (
    Boolean(issue.fields?.issuetype?.subtask) || Boolean(issue.fields?.parent)
  );
}

function resolveAdoType(issue) {
  if (issue.fields?.issuetype?.subtask) return "Task";
  return TYPE_MAP[issue.fields?.issuetype?.name] || "Feature";
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
