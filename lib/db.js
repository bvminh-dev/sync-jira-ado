import { MongoClient } from "mongodb";

const {
  MONGODB_URI,
  MONGODB_DB = "sync_jira_ado",
  MONGODB_STATE_COLLECTION = "sync_state",
  MONGODB_LOG_COLLECTION = "ado_logs",
} = process.env;

if (!MONGODB_URI) {
  console.warn("[db] MONGODB_URI is not set — Mongo operations will fail.");
}

let clientPromise = globalThis.__syncJiraAdoMongoClient;

function getClient() {
  if (!clientPromise) {
    const client = new MongoClient(MONGODB_URI, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 10_000,
    });
    clientPromise = client.connect();
    globalThis.__syncJiraAdoMongoClient = clientPromise;
  }
  return clientPromise;
}

export async function getDb() {
  const client = await getClient();
  return client.db(MONGODB_DB);
}

export async function getStateCollection() {
  const db = await getDb();
  return db.collection(MONGODB_STATE_COLLECTION);
}

export async function getLogCollection() {
  const db = await getDb();
  return db.collection(MONGODB_LOG_COLLECTION);
}

export async function logAdoCall(entry) {
  try {
    const col = await getLogCollection();
    await col.insertOne({ ...entry, createdAt: new Date() });
  } catch (e) {
    console.warn("[db] logAdoCall failed:", e.message);
  }
}
