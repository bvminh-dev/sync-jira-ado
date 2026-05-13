import {
  fetchUpdatedIssues,
  extractPlainText,
  fetchUpdatedIssuesDetail,
} from "./jira.js";
import {
  findWorkItemByJiraKey,
  createWorkItem,
  updateWorkItem,
  updateWorkItemFeature,
  updateWorkItemTask,
  createWorkFeature,
  createWorkTask,
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

const mapPriority = {
  Highest: "1",
  High: "2",
  Medium: "3",
  Low: "4",
  Lowest: "4",
};

const mapStateFeature = {
  "To Do": "New",
  "In Progress": "In Design",
  "In Review": "In Development",
  Done: "Done",
};

const mapStateTask = {
  "To Do": "To Do",
  "In Progress": "In Progress",
  "In Review": "In Progress",
  Done: "Done",
};

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
      const issueDetailList = await fetchUpdatedIssuesDetail(jiraID);
      if (issueDetailList.length === 0) {
        continue;
      }
      const issueDetail = issueDetailList[0];
      const workItemType = resolveAdoType(issueDetail);
      const title = issueDetail.fields.summary;
      const description = extractText(issueDetail);
      const startDate = issueDetail.fields.created;
      const targetDate = issueDetail.fields.duedate;

      const priorityName = issueDetail.fields?.priority?.name ?? "4";
      const priority = mapPriority?.[priorityName] ?? "4";

      const stateName = issueDetail.fields?.status?.name ?? ""; // nếu khác new hay to do thì cần update đúng trạng thái
      const state =
        workItemType === "Feature"
          ? mapStateFeature?.[stateName] || "New"
          : mapStateTask?.[stateName] || "To Do";
      const component = issueDetail.fields.components.name;
      const areaPath = `Tickets\\Clients\\C-Keppel\\P-KAI`;
      const iterationPath = `Tickets\\Weekly Sprint\\Sprint 60`;
      const createdBy =
        "minh.bui@torus.vn" ??
        issueDetail.fields?.reporter?.emailAddress ??
        issueDetail.fields?.reporter?.displayName ??
        ""; // chua co -> cần mapping sang torus

      const assignTo =
        "minh.bui@torus.vn" ??
        issueDetail.fields?.assignee?.emailAddress ??
        issueDetail.fields?.assignee?.displayName ??
        ""; // đổi về mail torus

      const keyLinkAdo = `${issueDetail.key} - ${jiraID}`;
      const existingId = await findWorkItemByJiraKey(keyLinkAdo);
      let parentIDOfAdo = "";
      if (existingId) {
        const data =
          workItemType === "Feature"
            ? await updateWorkItemFeature(
                existingId,
                title,
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
              )
            : await updateWorkItemTask(
                existingId,
                title,
                assignTo,
                description,
                null,
                startDate,
                null,
                priority,
                state,
                areaPath,
                iterationPath,
                keyLinkAdo,
                createdBy,
              );
        parentIDOfAdo = workItemType === "Feature" ? data.id : null;
        results.updated++;
      } else {
        const fakeState = workItemType === "Feature" ? "To Do" : "New";
        const data =
          workItemType === "Feature"
            ? await createWorkFeature(
                title,
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
              )
            : await createWorkTask(
                title,
                assignTo,
                description,
                null,
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
          workItemType === "Feature"
            ? await updateWorkItemFeature(
                data.id,
                title,
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
              )
            : await updateWorkItemTask(
                data.id,
                title,
                assignTo,
                description,
                null,
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
        parentIDOfAdo = workItemType === "Feature" ? data.id : null;
        results.created++;
      }

      const subTask = issue.fields.subtasks;

      for (const st of subTask) {
        const stJiraID = st.id;
        const stIssueDetailList = await fetchUpdatedIssuesDetail(stJiraID);
        if (stIssueDetailList.length === 0) {
          continue;
        }
        const stIssueDetail = stIssueDetailList[0];
        const stWorkItemType = resolveAdoType(stIssueDetail);

        const stField = stIssueDetail.fields;
        const stTitle = stField.summary;
        const stCreatedBy =
          "minh.bui@torus.vn" ??
          stField?.reporter?.emailAddress ??
          stField?.reporter?.displayName ??
          ""; // chua co

        const stAssignTo =
          "minh.bui@torus.vn" ??
          stField?.assignee?.emailAddress ??
          stField?.assignee?.displayName ??
          ""; // đổi về mail torus

        const stDes = extractText(stIssueDetail);
        const stParent = "..."; // get từ task
        const stStartDate = stField.created;
        const stDueDate = stField.duedate;

        const stPriorityName = stField?.priority?.name || "";
        const stPriority = mapPriority?.[stPriorityName] ?? "4";

        const stStateName = stField.status.name ?? "";
        const stState =
          stWorkItemType === "Task"
            ? mapStateTask?.[stStateName] || "To Do"
            : mapStateFeature?.[stStateName] || "New";

        const stKeyLinkAdo = `${stIssueDetail.key} - ${stJiraID}`;
        const stExistingId = await findWorkItemByJiraKey(stKeyLinkAdo);
        let idSubTask = "";
        if (stExistingId) {
          const data =
            stWorkItemType === "Feature"
              ? await updateWorkItemFeature(
                  stExistingId,
                  stTitle,
                  stDes,
                  stStartDate,
                  null,
                  stPriority,
                  stState,
                  areaPath,
                  iterationPath,
                  stKeyLinkAdo,
                  stCreatedBy,
                  stAssignTo,
                )
              : await updateWorkItemTask(
                  stExistingId,
                  stTitle,
                  stAssignTo,
                  stDes,
                  parentIDOfAdo,
                  stStartDate,
                  stDueDate,
                  stPriority,
                  stState,
                  areaPath,
                  iterationPath,
                  stKeyLinkAdo,
                  stCreatedBy,
                );
          idSubTask = data.id;
          results.updated++;
        } else {
          const stFakeState = workItemType === "Feature" ? "To Do" : "New";
          const data =
            stWorkItemType === "Feature"
              ? await createWorkFeature(
                  stTitle,
                  stDes,
                  stStartDate,
                  null,
                  stPriority,
                  stFakeState,
                  areaPath,
                  iterationPath,
                  stKeyLinkAdo,
                  stCreatedBy,
                  stAssignTo,
                )
              : await createWorkTask(
                  stTitle,
                  stAssignTo,
                  stDes,
                  parentIDOfAdo,
                  startDate,
                  stDueDate,
                  stPriority,
                  stFakeState,
                  areaPath,
                  iterationPath,
                  stKeyLinkAdo,
                  stCreatedBy,
                );
          if (stFakeState !== stState) {
            stWorkItemType === "Feature"
              ? await updateWorkItemFeature(
                  data.id,
                  stTitle,
                  stDes,
                  stStartDate,
                  null,
                  stPriority,
                  stState,
                  areaPath,
                  iterationPath,
                  stKeyLinkAdo,
                  stCreatedBy,
                  stAssignTo,
                )
              : await updateWorkItemTask(
                  data.id,
                  stTitle,
                  stAssignTo,
                  stDes,
                  parentIDOfAdo,
                  stStartDate,
                  stDueDate,
                  stPriority,
                  stState,
                  areaPath,
                  iterationPath,
                  stKeyLinkAdo,
                  stCreatedBy,
                );
          }
          idSubTask = data.id;
          results.created++;
        }
      }
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
  if (issue.fields?.issuetype?.name?.toLowerCase() === "task") return "Feature";
  return "Task";
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
