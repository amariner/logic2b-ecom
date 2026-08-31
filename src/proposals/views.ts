import InlogemLanding from './inlogem/ProposalLanding.astro';
// new-proposal:view-imports — no borrar: el scaffold añade aquí su micrositio.

const proposalLandingViews = {
  inlogem: InlogemLanding,
  // new-proposal:view-entries — no borrar: el scaffold añade aquí su vista.
};

export function proposalLandingView(id: string) {
  return proposalLandingViews[id as keyof typeof proposalLandingViews] ?? null;
}
