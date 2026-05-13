import axios from "axios";

const {
  ADO_ORG,
  ADO_PROJECT,
  ADO_PAT,
  ADO_JIRA_KEY_FIELD = "Custom.JiraID",
} = process.env;

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
  console.log("wiql", wiql);
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

  const ops = opsAll.filter(
    (x) => x.value !== null && x.value !== undefined && x.value !== "",
  );

  const url = `/wit/workitems/$Feature?api-version=${apiVersion}`;
  console.log("bodyyyy-Feature", JSON.stringify(ops));
  const { data } = await client.post(url, ops, {
    headers: { "Content-Type": "application/json-patch+json" },
  });
  return data;
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
  const { data } = await client.post(url, ops, {
    headers: { "Content-Type": "application/json-patch+json" },
  });
  return data;
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

  const ops = opsAll.filter(
    (x) => x.value !== null && x.value !== undefined && x.value !== "",
  );
  const { data } = await client.patch(
    `/wit/workitems/${id}?api-version=${apiVersion}`,
    ops,
    { headers: { "Content-Type": "application/json-patch+json" } },
  );
  return data;
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
  const { data } = await client.patch(
    `/wit/workitems/${id}?api-version=${apiVersion}`,
    ops,
    { headers: { "Content-Type": "application/json-patch+json" } },
  );
  return data;
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
