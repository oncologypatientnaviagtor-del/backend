import neo4j, { type Driver } from "neo4j-driver";
import { env } from "../config/env";
import { Encounter } from "../models/Encounter";
import { logger } from "../utils/logger";
import { toPatientIntake } from "./intake.service";

export interface VisitReportLink {
  documentId: string;
  name: string;
}

export interface VisitMap {
  sessionId: string;
  concern: string | null;
  reports: VisitReportLink[];
}

export const VISIT_MAP_QUERY = `
MERGE (concern:Concern {sessionId: $sessionId})
SET concern.summary = $summary
WITH concern
OPTIONAL MATCH (concern)-[oldLink:LEADS_TO]->(:VisitType)
DELETE oldLink
WITH DISTINCT concern
FOREACH (doc IN $reports |
  MERGE (report:Report {documentId: doc.documentId})
  SET report.sessionId = $sessionId, report.name = doc.name
  MERGE (report)-[:ABOUT]->(concern)
)
WITH DISTINCT concern
FOREACH (_ IN CASE WHEN $visitType IS NULL THEN [] ELSE [1] END |
  MERGE (visitType:VisitType {name: $visitType})
  MERGE (concern)-[:LEADS_TO]->(visitType)
)
`;

let driver: Driver | null = null;
let missingConfigLogged = false;

export function isNeo4jConfigured(): boolean {
  return env.NEO4J_URI.trim().length > 0 && env.NEO4J_USERNAME.trim().length > 0 && env.NEO4J_PASSWORD.trim().length > 0;
}

export function visitTypeForConcern(concern: string | null): string | null {
  const text = concern?.trim() ?? "";
  if (!text) return null;
  if (/\bbreasts?\b/i.test(text)) return "Breast clinic visit";
  return "Clinic visit for this concern";
}

function graphDriver(): Driver {
  if (!driver) {
    driver = neo4j.driver(env.NEO4J_URI, neo4j.auth.basic(env.NEO4J_USERNAME, env.NEO4J_PASSWORD), {
      connectionTimeout: 3000,
    });
  }
  return driver;
}

export async function linkVisitMap(input: VisitMap): Promise<void> {
  if (input.reports.length === 0) return;
  if (!isNeo4jConfigured()) {
    if (!missingConfigLogged) {
      missingConfigLogged = true;
      logger.info("neo4j_not_configured");
    }
    return;
  }

  const session = graphDriver().session({ database: env.NEO4J_DATABASE || "neo4j" });
  try {
    await session.executeWrite((tx) =>
      tx.run(VISIT_MAP_QUERY, {
        sessionId: input.sessionId,
        summary: input.concern?.trim() || null,
        visitType: visitTypeForConcern(input.concern),
        reports: input.reports.map((report) => ({
          documentId: report.documentId,
          name: report.name,
        })),
      }),
    );
    logger.info("visit_map_linked");
  } catch {
    logger.warn("neo4j_link_failed");
  } finally {
    await session.close();
  }
}

export async function linkStoredVisitMaps(): Promise<void> {
  if (!isNeo4jConfigured()) {
    if (!missingConfigLogged) {
      missingConfigLogged = true;
      logger.info("neo4j_not_configured");
    }
    return;
  }

  try {
    await graphDriver().verifyConnectivity();
    logger.info("neo4j_connected");
  } catch {
    logger.warn("neo4j_unreachable");
    return;
  }

  const encounters = await Encounter.find({ "documents.0": { $exists: true } });
  for (const encounter of encounters) {
    const intake = toPatientIntake(encounter.structuredIntake);
    await linkVisitMap({
      sessionId: encounter.sessionId,
      concern: intake.concern,
      reports: encounter.documents.map((document) => ({
        documentId: document.documentId,
        name: document.originalName,
      })),
    });
  }
}
