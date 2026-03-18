const admin = require("firebase-admin");

let firestoreInstance = null;
let initAttempted = false;

function tryInitFirestore() {
  if (firestoreInstance) return firestoreInstance;
  if (initAttempted) return firestoreInstance;
  initAttempted = true;

  const hasAnyConfig =
    Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_PATH) ||
    Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON) ||
    Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS) ||
    process.env.FIREBASE_PROJECT_ID;

  if (!hasAnyConfig) return null;

  try {
    if (!admin.apps.length) {
      if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
        // Path to a service account JSON file.
        // eslint-disable-next-line global-require, import/no-dynamic-require
        const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: process.env.FIREBASE_PROJECT_ID,
        });
      } else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        // Service account JSON passed as a string.
        const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        const maybeJson = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
        const serviceAccount = JSON.parse(maybeJson);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID,
        });
      } else {
        // Use default credentials (requires GOOGLE_APPLICATION_CREDENTIALS to be set).
        admin.initializeApp({
          credential: admin.credential.applicationDefault(),
          projectId: process.env.FIREBASE_PROJECT_ID,
        });
      }
    }

    firestoreInstance = admin.firestore();
    return firestoreInstance;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("Firestore init failed, continuing without Firestore logging.", err.message);
    firestoreInstance = null;
    return null;
  }
}

function getFirestore() {
  return tryInitFirestore();
}

module.exports = { getFirestore };

