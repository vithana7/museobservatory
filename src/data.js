// Canonical muse data — the single source for muse → cause.
// Colors are CSS-var references resolved against tokens.css (the single source
// for the 7 brand hexes). The observatory globe + flip-card read from here.

export const MUSES = [
  { name: 'Lunes',  cause: 'Water',            color: 'var(--lunes)',
    description: 'The Moon governs the tides — it has pulled water through its rhythms since before life existed. Lunes holds that same logic: water is more than a resource. It is the condition for everything that lives.' },
  { name: 'Ares',   cause: 'Rewilding',        color: 'var(--ares)',
    description: 'Ares was the god of destruction — raw, unstoppable. That same force, turned: the land that was razed is the first to rewild.' },
  { name: 'Rabu',   cause: 'Human Rights',     color: 'var(--rabu)',
    description: 'Mercury was the only god with free passage everywhere — between the living and the dead, the human and the divine. Rabu moves the same way: rights belong everywhere, without exception.' },
  { name: 'Thunor', cause: 'Renewable Energy', color: 'var(--thunor)',
    description: "Jupiter's thunder was the most powerful force in nature — wielded not to destroy, but to protect. Thunor holds that same logic: the energy was always there. The question is what we do with it." },
  { name: 'Shukra', cause: 'Bio-diversity',    color: 'var(--shukra)',
    description: 'Venus finds beauty in everything. Shukra holds that same logic: no species is expendable. Lose one, and something irreplaceable goes with it.' },
  { name: 'Dosei',  cause: 'Zero Hunger',      color: 'var(--dosei)',
    description: 'The ancients named Saturn the planet of soil — the slowest, the most patient, the one that endures. Dosei holds that same logic: the earth knows how to feed us.' },
  { name: 'Solis',  cause: 'Well-being',       color: 'var(--solis)',
    description: 'Sol crossed the sky every day without fail — no exceptions, no favourites, light for everyone beneath. Solis holds that same logic: well-being is not a privilege. It is what the light does.' },
];
