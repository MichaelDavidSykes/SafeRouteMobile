import type {
  RiskEscalationIndicator,
  RiskZone
} from './liveMapTypes';
import { formatDistance } from './routeProgress';

export interface RiskDetailFact {
  label: string;
  value: string;
}

export interface RiskDetailSection {
  label: string;
  value: string;
}

export interface RiskDetailSource {
  description: string;
  label: string;
  url: string;
}

export interface RiskZoneExpandedPresentation {
  accessibilityLabel: string;
  actions: string[];
  context: RiskDetailSection[];
  description: string;
  facts: RiskDetailFact[];
  indicators: RiskDetailSection[];
  sources: RiskDetailSource[];
}

export function createRiskZoneExpandedPresentation(
  zone: RiskZone
): RiskZoneExpandedPresentation {
  const facts: RiskDetailFact[] = [];
  if (zone.riskScore !== undefined) {
    facts.push({ label: 'Risk score', value: `${Math.round(zone.riskScore)} / 100` });
  }
  if (zone.confidence) {
    facts.push({ label: 'Confidence', value: sentenceCase(zone.confidence) });
  }
  if (zone.evidenceCount !== undefined) {
    facts.push({
      label: 'Evidence',
      value: `${zone.evidenceCount} supporting record${zone.evidenceCount === 1 ? '' : 's'}`
    });
  }
  facts.push({
    label: 'Area',
    value: isMappedArea(zone)
      ? 'Mapped boundary'
      : `${formatDistance(zone.radiusMeters)} radius`
  });
  if (zone.source) {
    facts.push({ label: 'Source', value: zone.source });
  }
  if (zone.sourceType) {
    facts.push({ label: 'Source type', value: sentenceCase(zone.sourceType) });
  }
  if (zone.lastVerifiedAt) {
    facts.push({ label: 'Last verified', value: formatRiskDate(zone.lastVerifiedAt) });
  }
  if (zone.validUntil) {
    facts.push({ label: 'Valid until', value: formatRiskDate(zone.validUntil) });
  }

  const context = [
    detailSection('Risk theme', zone.riskTheme),
    detailSection('Relation to this area', zone.queryRelation),
    detailSection('Expected activity', zone.expectedActivity),
    detailSection('Research context', zone.sourceQuery),
    ...(zone.relatedAreas?.length
      ? [{ label: 'Related areas', value: zone.relatedAreas.join(', ') }]
      : [])
  ].filter((section): section is RiskDetailSection => Boolean(section));

  const indicators = (zone.escalationIndicators ?? [])
    .slice(0, 6)
    .map(escalationIndicatorSection);
  const sources = createRiskDetailSources(zone);

  const spokenFacts = facts.map(({ label, value }) => `${label}: ${value}`).join('. ');
  return {
    accessibilityLabel: `${zone.title}. Detailed risk intelligence. ${spokenFacts}`,
    actions: (zone.recommendedActions ?? []).slice(0, 6),
    context,
    description: zone.description,
    facts,
    indicators,
    sources
  };
}

function createRiskDetailSources(zone: RiskZone): RiskDetailSource[] {
  const sourceUrls = Array.from(new Set(
    [zone.sourceUrl, ...(zone.sourceUrls ?? [])].filter(
      (url): url is string => Boolean(url)
    )
  ));
  const sourceHostCounts = sourceUrls.reduce<Map<string, number>>(
    (counts, url) => {
      const host = sourceHost(url);
      counts.set(host, (counts.get(host) ?? 0) + 1);
      return counts;
    },
    new Map()
  );
  const sourceHostIndexes = new Map<string, number>();

  return sourceUrls.map((url) => {
    const host = sourceHost(url);
    const hostIndex = (sourceHostIndexes.get(host) ?? 0) + 1;
    sourceHostIndexes.set(host, hostIndex);
    return {
      label: (sourceHostCounts.get(host) ?? 0) > 1
        ? `${host} · ${hostIndex}`
        : host,
      description: zone.sourceDescription ?? zone.source ?? 'Original public source',
      url
    };
  });
}

function isMappedArea(zone: RiskZone): boolean {
  return (zone.polygonCoordinates?.length ?? 0) >= 3;
}

function detailSection(
  label: string,
  value: string | undefined
): RiskDetailSection | null {
  return value?.trim() ? { label, value: value.trim() } : null;
}

function escalationIndicatorSection(
  indicator: RiskEscalationIndicator
): RiskDetailSection {
  const metadata = [
    indicator.category ? sentenceCase(indicator.category) : null,
    indicator.confidence ? `${sentenceCase(indicator.confidence)} confidence` : null,
    indicator.evidenceCount !== undefined
      ? `${indicator.evidenceCount} evidence`
      : null,
    indicator.matchedTerms?.length
      ? `Matched: ${indicator.matchedTerms.join(', ')}`
      : null,
    indicator.snippet
  ].filter((value): value is string => Boolean(value));
  return {
    label: indicator.label,
    value: metadata.join(' · ') || 'Observed escalation signal'
  };
}

function sourceHost(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./i, '') || 'Source';
  } catch {
    return 'Source';
  }
}

function sentenceCase(value: string): string {
  const normalized = value.trim().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
  return normalized
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
    : normalized;
}

function formatRiskDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) {
    return value;
  }
  const month = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ][Number(match[2]) - 1];
  return month
    ? `${Number(match[3])} ${month} ${match[1]}`
    : value;
}
