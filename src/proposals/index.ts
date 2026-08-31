import { inlogemProposal } from './inlogem/config';
// new-proposal:imports — no borrar: `pnpm new:proposal <id>` añade aquí su import.
import type { ProposalConfig, ProposalResolution } from './types';

export type { ProposalCatalogItem, ProposalConfig, ProposalPaths, StoreExperienceConfig } from './types';

export const proposals: readonly ProposalConfig[] = Object.freeze([
  inlogemProposal,
  // new-proposal:entries — no borrar: `pnpm new:proposal <id>` añade aquí su entrada.
]);

export function resolveProposalState(
  proposal: ProposalConfig,
  now = new Date(),
  allowDraft = false,
): ProposalResolution {
  if (proposal.status === 'archived') return { kind: 'gone', proposal };
  if (proposal.expiresAt && Date.parse(proposal.expiresAt) <= now.getTime()) return { kind: 'gone', proposal };
  if (proposal.status === 'draft' && !allowDraft) return { kind: 'draft', proposal };
  return { kind: 'active', proposal };
}

export function resolveProposal(
  publicId: string | undefined,
  now = new Date(),
  allowDraft = false,
): ProposalResolution {
  if (!publicId) return { kind: 'missing' };
  const proposal = proposals.find((candidate) => candidate.publicId === publicId);
  if (!proposal) return { kind: 'missing' };
  return resolveProposalState(proposal, now, allowDraft);
}

export function proposalHtmlHeaders(headers: Headers): void {
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Cache-Control', 'private, no-store, max-age=0');
}
