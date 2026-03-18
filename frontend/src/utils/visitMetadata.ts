/**
 * Visit Metadata — stored as a hidden report with section='__metadata__'
 * This allows adding extra visit fields without any backend changes.
 */

export interface VisitMetadata {
  location?: string;
  purpose?: string;
  outcome?: string;
  followUpRequired?: boolean;
  nextAction?: string;
}

export const METADATA_SECTION = '__metadata__';

/**
 * Encode metadata into a report object ready to be included in visit creation.
 */
export function encodeMetadata(meta: VisitMetadata): { section: string; content: string } | null {
  // Only create if there's actual data
  const hasData = meta.location || meta.purpose || meta.outcome || meta.followUpRequired || meta.nextAction;
  if (!hasData) return null;

  return {
    section: METADATA_SECTION,
    content: JSON.stringify(meta),
  };
}

/**
 * Decode metadata from a visit's reports array.
 * Returns null if no metadata report found.
 */
export function decodeMetadata(reports: any[]): VisitMetadata | null {
  if (!reports || !Array.isArray(reports)) return null;

  const metaReport = reports.find(r => r.section === METADATA_SECTION);
  if (!metaReport) return null;

  try {
    return JSON.parse(metaReport.content) as VisitMetadata;
  } catch {
    return null;
  }
}

/**
 * Filter out the __metadata__ report so it doesn't show in the report list.
 */
export function filterDisplayReports(reports: any[]): any[] {
  if (!reports || !Array.isArray(reports)) return [];
  return reports.filter(r => r.section !== METADATA_SECTION);
}
