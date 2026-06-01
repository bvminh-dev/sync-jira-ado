import axios from "axios";
import { logAdoCall } from "./db.js";

const {
  ADO_ORG,
  ADO_PROJECT,
  ADO_PAT,
  ADO_JIRA_KEY_FIELD = "Custom.JiraID",
} = process.env;

async function sendAndLog({
  method,
  url,
  ops,
  action,
  workItemType,
  jiraID,
  extra,
}) {
  const requestedAt = new Date();
  const logBase = {
    action,
    workItemType,
    jiraID: jiraID ?? null,
    method,
    url,
    request: ops,
    requestedAt,
    ...(extra || {}),
  };
  try {
    const { data, status } = await client.request({
      method,
      url,
      data: ops,
      headers: { "Content-Type": "application/json-patch+json" },
    });
    await logAdoCall({
      ...logBase,
      status: "success",
      httpStatus: status,
      response: data,
      durationMs: Date.now() - requestedAt.getTime(),
    });
    return data;
  } catch (e) {
    await logAdoCall({
      ...logBase,
      status: "error",
      httpStatus: e.response?.status ?? null,
      response: e.response?.data ?? null,
      error: { message: e.message, code: e.code ?? null },
      durationMs: Date.now() - requestedAt.getTime(),
    });
    throw e;
  }
}

const auth = Buffer.from(`:${ADO_PAT}`).toString("base64");
const apiVersion = "7.1-preview";
const baseUrl = `https://dev.azure.com/${ADO_ORG}/${encodeURIComponent(ADO_PROJECT)}/_apis`;

const client = axios.create({
  baseURL: baseUrl,
  headers: {
    Authorization: `Basic ${auth}`,
    Accept: "application/json",
  },
  timeout: 30_000,
});

export async function findWorkItemByJiraKey(jiraKey) {
  const wiql = {
    query: `SELECT [System.Id] FROM WorkItems
            WHERE [System.TeamProject] = '${ADO_PROJECT}'
            AND [${ADO_JIRA_KEY_FIELD}] = '${jiraKey}'`,
  };
  // console.log("wiql", wiql);
  const { data } = await client.post(
    `/wit/wiql?api-version=${apiVersion}`,
    wiql,
    {
      headers: { "Content-Type": "application/json" },
    },
  );
  return data.workItems?.[0]?.id ?? null;
}

export async function createWorkItem(workItemType, fields, parentId = null) {
  const ops = toPatchOps(fields, "add");
  if (parentId) ops.push(parentLinkOp(parentId));
  const url = `/wit/workitems/$${encodeURIComponent(workItemType)}?api-version=${apiVersion}`;
  console.log("bodyyyy", JSON.stringify(ops));
  const { data } = await client.post(url, ops, {
    headers: { "Content-Type": "application/json-patch+json" },
  });
  return data;
}

export async function createWorkFeature(
  title,
  description,
  startDate,
  targetDate,
  priority,
  state,
  areaPath,
  iterationPath,
  jiraID,
  createdBy,
  assignedTo,
  parentId,
) {
  const opsAll = [
    {
      op: "add",
      path: "/fields/System.Title",
      value: title,
    },
    {
      op: "add",
      path: "/fields/System.Description",
      value: description,
    },
    {
      op: "add",
      path: "/fields/Microsoft.VSTS.Scheduling.StartDate",
      value: startDate,
    },
    {
      op: "add",
      path: "/fields/Microsoft.VSTS.Scheduling.TargetDate",
      value: targetDate,
    },
    {
      op: "add",
      path: "/fields/Microsoft.VSTS.Common.Priority",
      value: priority, // 1, 2, 3, 4
    },
    {
      op: "add",
      path: "/fields/System.State",
      value: state, // New, In Design, In Development, Done, Removed
    },
    {
      op: "add",
      path: "/fields/System.AreaPath",
      value: areaPath,
    },
    {
      op: "add",
      path: "/fields/System.IterationPath",
      value: iterationPath,
    },
    {
      op: "add",
      path: "/fields/Custom.JiraID",
      value: jiraID,
    },
    {
      op: "add",
      path: "/fields/System.CreatedBy",
      value: createdBy,
    },
    {
      op: "add",
      path: "/fields/System.AssignedTo",
      value: assignedTo,
    },
  ];

  if (parentId) {
    opsAll.push({
      op: "add",
      path: "/relations/-", // add patientID
      value: {
        rel: "System.LinkTypes.Hierarchy-Reverse",
        url: `https://dev.azure.com/torus-engineering/Tickets/_apis/wit/workItems/${parentId}`,
      },
    });
  }

  const ops = opsAll.filter(
    (x) => x.value !== null && x.value !== undefined && x.value !== "",
  );

  const url = `/wit/workitems/$Product%20Backlog%20Item?api-version=${apiVersion}`;
  console.log("bodyyyy-Feature", JSON.stringify(ops));
  return await sendAndLog({
    method: "POST",
    url,
    ops,
    action: "create",
    workItemType: "PRODUCT BACKLOG ITEM",
    jiraID,
  });
}

export async function createWorkTask(
  title,
  assignedTo,
  description,
  parentId,
  startDate,
  dueDate,
  priority,
  state,
  areaPath,
  iterationPath,
  jiraID,
  createdBy,
  aggregateTimeEstimateSecond,
  aggregateTimeOriginalEstimateSecond,
  aggregateTimeSpentSecond,
) {
  const opsAll = [
    {
      op: "add",
      path: "/fields/System.Title",
      value: title,
    },
    {
      op: "add",
      path: "/fields/System.AssignedTo",
      value: assignedTo,
    },
    {
      op: "add",
      path: "/fields/System.Description",
      value: description,
    },

    {
      op: "add",
      path: "/fields/Microsoft.VSTS.Scheduling.StartDate",
      value: startDate,
    },
    {
      op: "add",
      path: "/fields/Microsoft.VSTS.Scheduling.DueDate",
      value: dueDate,
    },
    {
      op: "add",
      path: "/fields/Microsoft.VSTS.Common.Priority",
      value: priority,
    },
    {
      op: "add",
      path: "/fields/System.State",
      value: state, // To Do, In Progress, Done, Removed
    },
    {
      op: "add",
      path: "/fields/System.AreaPath",
      value: areaPath,
    },
    {
      op: "add",
      path: "/fields/System.IterationPath",
      value: iterationPath,
    },
    {
      op: "add",
      path: "/fields/Custom.JiraID",
      value: jiraID,
    },
    {
      op: "add",
      path: "/fields/System.CreatedBy",
      value: createdBy,
    },
    {
      op: "add",
      path: "/fields/Microsoft.VSTS.Scheduling.OriginalEstimate",
      value: secondsToHours(aggregateTimeOriginalEstimateSecond),
    },
    {
      op: "add",
      path: "/fields/Microsoft.VSTS.Scheduling.RemainingWork",
      value: secondsToHours(aggregateTimeEstimateSecond),
    },
    {
      op: "add",
      path: "/fields/Microsoft.VSTS.Scheduling.CompletedWork",
      value: secondsToHours(aggregateTimeSpentSecond),
    },
  ];

  const ops = opsAll.filter(
    (x) => x.value !== null && x.value !== undefined && x.value !== "",
  );

  if (parentId) {
    ops.push({
      op: "add",
      path: "/relations/-", // add patientID
      value: {
        rel: "System.LinkTypes.Hierarchy-Reverse",
        url: `https://dev.azure.com/torus-engineering/Tickets/_apis/wit/workItems/${parentId}`,
      },
    });
  }
  const url = `/wit/workitems/$Task?api-version=${apiVersion}`;
  console.log("bodyyyy-Task", JSON.stringify(ops));
  return await sendAndLog({
    method: "POST",
    url,
    ops,
    action: "create",
    workItemType: "Task",
    jiraID,
    extra: { parentId: parentId ?? null },
  });
}

export async function updateWorkItemFeature(
  id,
  title,
  description,
  startDate,
  targetDate,
  priority,
  state,
  areaPath,
  iterationPath,
  jiraID,
  createdBy,
  assignedTo,
  parentId,
) {
  const opsAll = [
    {
      op: "add",
      path: "/fields/System.Title",
      value: title,
    },
    {
      op: "add",
      path: "/fields/System.Description",
      value: description,
    },
    {
      op: "add",
      path: "/fields/Microsoft.VSTS.Scheduling.StartDate",
      value: startDate,
    },
    {
      op: "add",
      path: "/fields/Microsoft.VSTS.Scheduling.TargetDate",
      value: targetDate,
    },
    {
      op: "add",
      path: "/fields/Microsoft.VSTS.Common.Priority",
      value: priority, // 1, 2, 3, 4
    },
    {
      op: "add",
      path: "/fields/System.State",
      value: state, // New, In Design, In Development, Done, Removed
    },
    {
      op: "add",
      path: "/fields/System.AreaPath",
      value: areaPath,
    },
    {
      op: "add",
      path: "/fields/System.IterationPath",
      value: iterationPath,
    },
    {
      op: "add",
      path: "/fields/Custom.JiraID",
      value: jiraID,
    },
    {
      op: "add",
      path: "/fields/System.CreatedBy",
      value: createdBy,
    },
    {
      op: "add",
      path: "/fields/System.AssignedTo",
      value: assignedTo,
    },
  ];

  if (parentId) {
    opsAll.push({
      op: "add",
      path: "/relations/-", // add patientID
      value: {
        rel: "System.LinkTypes.Hierarchy-Reverse",
        url: `https://dev.azure.com/torus-engineering/Tickets/_apis/wit/workItems/${parentId}`,
      },
    });
  }

  const ops = opsAll.filter(
    (x) => x.value !== null && x.value !== undefined && x.value !== "",
  );
  return await sendAndLog({
    method: "PATCH",
    url: `/wit/workitems/${id}?api-version=${apiVersion}`,
    ops,
    action: "update",
    workItemType: "PRODUCT BACKLOG ITEM",
    jiraID,
    extra: { workItemId: id },
  });
}

export async function updateWorkItemTask(
  id,
  title,
  assignedTo,
  description,
  parentId,
  startDate,
  dueDate,
  priority,
  state,
  areaPath,
  iterationPath,
  jiraID,
  createdBy,
  aggregateTimeEstimateSecond,
  aggregateTimeOriginalEstimateSecond,
  aggregateTimeSpentSecond,
) {
  const opsAll = [
    {
      op: "add",
      path: "/fields/System.Title",
      value: title,
    },
    {
      op: "add",
      path: "/fields/System.AssignedTo",
      value: assignedTo,
    },
    {
      op: "add",
      path: "/fields/System.Description",
      value: description,
    },
    {
      op: "add",
      path: "/fields/Microsoft.VSTS.Scheduling.StartDate",
      value: startDate,
    },
    {
      op: "add",
      path: "/fields/Microsoft.VSTS.Scheduling.DueDate",
      value: dueDate,
    },
    {
      op: "add",
      path: "/fields/Microsoft.VSTS.Common.Priority",
      value: priority,
    },
    {
      op: "add",
      path: "/fields/System.State",
      value: state, // To Do, In Progress, Done, Removed
    },
    {
      op: "add",
      path: "/fields/System.AreaPath",
      value: areaPath,
    },
    {
      op: "add",
      path: "/fields/System.IterationPath",
      value: iterationPath,
    },
    {
      op: "add",
      path: "/fields/Custom.JiraID",
      value: jiraID,
    },
    {
      op: "add",
      path: "/fields/System.CreatedBy",
      value: createdBy,
    },
    {
      op: "add",
      path: "/fields/Microsoft.VSTS.Scheduling.OriginalEstimate",
      value: secondsToHours(aggregateTimeOriginalEstimateSecond),
    },
    {
      op: "add",
      path: "/fields/Microsoft.VSTS.Scheduling.RemainingWork",
      value: secondsToHours(aggregateTimeEstimateSecond),
    },
    {
      op: "add",
      path: "/fields/Microsoft.VSTS.Scheduling.CompletedWork",
      value: secondsToHours(aggregateTimeSpentSecond),
    },
  ];

  const ops = opsAll.filter(
    (x) => x.value !== null && x.value !== undefined && x.value !== "",
  );

  if (parentId) {
    ops.push({
      op: "add",
      path: "/relations/-", // add patientID
      value: {
        rel: "System.LinkTypes.Hierarchy-Reverse",
        url: `https://dev.azure.com/torus-engineering/Tickets/_apis/wit/workItems/${parentId}`,
      },
    });
  }
  return await sendAndLog({
    method: "PATCH",
    url: `/wit/workitems/${id}?api-version=${apiVersion}`,
    ops,
    action: "update",
    workItemType: "Task",
    jiraID,
    extra: { workItemId: id, parentId: parentId ?? null },
  });
}

export async function updateWorkItem(id, fields, parentId = null) {
  const ops = toPatchOps(fields, "replace");
  if (parentId) ops.push(parentLinkOp(parentId));
  const { data } = await client.patch(
    `/wit/workitems/${id}?api-version=${apiVersion}`,
    ops,
    { headers: { "Content-Type": "application/json-patch+json" } },
  );
  return data;
}

export async function deleteWorkItem(id) {
  const url = `/wit/workitems/${id}?api-version=7.1`;
  const requestedAt = new Date();
  try {
    const { data, status } = await client.delete(url);
    await logAdoCall({
      action: "delete",
      workItemType: null,
      jiraID: null,
      method: "DELETE",
      url,
      request: null,
      requestedAt,
      status: "success",
      httpStatus: status,
      response: data,
      durationMs: Date.now() - requestedAt.getTime(),
      extra: { workItemId: id },
    });
    return data;
  } catch (e) {
    await logAdoCall({
      action: "delete",
      workItemType: null,
      jiraID: null,
      method: "DELETE",
      url,
      request: null,
      requestedAt,
      status: "error",
      httpStatus: e.response?.status ?? null,
      response: e.response?.data ?? null,
      error: { message: e.message, code: e.code ?? null },
      durationMs: Date.now() - requestedAt.getTime(),
      extra: { workItemId: id },
    });
    throw e;
  }
}

export async function listWorkItemAttachments(workItemId) {
  const { data } = await client.get(
    `/wit/workitems/${workItemId}?$expand=relations&api-version=${apiVersion}`,
  );
  const relations = Array.isArray(data?.relations) ? data.relations : [];
  return relations
    .map((rel, index) => ({ ...rel, index }))
    .filter((rel) => rel.rel === "AttachedFile");
}

export async function removeAllAttachments(workItemId) {
  const { data } = await client.get(
    `/wit/workitems/${workItemId}?$expand=relations&api-version=${apiVersion}`,
  );
  const relations = Array.isArray(data?.relations) ? data.relations : [];
  const attachmentIndices = [];
  relations.forEach((rel, index) => {
    if (rel.rel === "AttachedFile") attachmentIndices.push(index);
  });
  if (attachmentIndices.length === 0) return null;

  const ops = attachmentIndices
    .sort((a, b) => b - a)
    .map((index) => ({ op: "remove", path: `/relations/${index}` }));

  return await sendAndLog({
    method: "PATCH",
    url: `/wit/workitems/${workItemId}?api-version=${apiVersion}`,
    ops,
    action: "remove-attachments",
    workItemType: null,
    jiraID: null,
    extra: { workItemId, removed: attachmentIndices.length },
  });
}

export async function uploadAttachment(workItemId, filename, buffer) {
  const uploadUrl = `/wit/attachments?fileName=${encodeURIComponent(filename)}&api-version=${apiVersion}`;
  const { data: uploaded } = await client.post(uploadUrl, buffer, {
    headers: { "Content-Type": "application/octet-stream" },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  const ops = [
    {
      op: "add",
      path: "/relations/-",
      value: {
        rel: "AttachedFile",
        url: uploaded.url,
        attributes: { comment: "Synced from Jira" },
      },
    },
  ];

  await sendAndLog({
    method: "PATCH",
    url: `/wit/workitems/${workItemId}?api-version=${apiVersion}`,
    ops,
    action: "attach-file",
    workItemType: null,
    jiraID: null,
    extra: { workItemId, filename, attachmentId: uploaded.id },
  });

  return uploaded;
}

function secondsToHours(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round((value / 3600) * 100) / 100;
}

function toPatchOps(fields, op) {
  return Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([path, value]) => ({ op, path: `/fields/${path}`, value }));
}

function parentLinkOp(parentId) {
  return {
    op: "add",
    path: "/relations/-",
    value: {
      rel: "System.LinkTypes.Hierarchy-Reverse",
      url: `https://dev.azure.com/${ADO_ORG}/_apis/wit/workItems/${parentId}`,
    },
  };
}
