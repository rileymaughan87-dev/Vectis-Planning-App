// The suite's apps in the Index style (docs/brand-brief.md): each has an
// index number and two letters — Vectis 00 Ve, Planner 01 Pl, Finance
// 02 Fi, Record 03 Re. A new app takes the next number and its first two
// letters. The icons themselves are finished PNGs in each app's public/
// folder (drawn with the real fonts): icon-1024.png for the Home Screen,
// favicon-16/32.png (one letter, heavier rule) for 48px and below.

export interface SuiteApp {
  index: string
  name: string
  letters: string
}

export const SUITE_APPS: SuiteApp[] = [
  { index: '00', name: 'Vectis', letters: 'Ve' },
  { index: '01', name: 'Planner', letters: 'Pl' },
  { index: '02', name: 'Finance', letters: 'Fi' },
  { index: '03', name: 'Record', letters: 'Re' },
]
