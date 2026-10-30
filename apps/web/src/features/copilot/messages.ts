import type { ProposalTool } from '@plantpal/ai';
import { usePrefs, type LocalePref } from '../../state/prefs';

/** Garden Copilot (F6) and the weekly reflection (F8). */
const en = {
  title: 'Garden Copilot',
  intro:
    'Ask about your garden. It looks things up in your records on this device and suggests changes for you to confirm. It uses your own Gemini key.',
  off: 'AI features are switched off.',
  noKey: 'Add your Gemini key in Settings › AI to use the Copilot.',
  settings: 'Open Settings › AI',
  noGarden: 'Create a garden first, so the Copilot has something to look at.',
  access: {
    title: 'What the Copilot may read',
    intro:
      'It only sends what it looks up while answering. Your exact location is never sent; weather and climate are looked up on this device and only the results go.',
    plants: 'Your plants and their care schedules',
    space: 'Your spaces and their sun',
    journal: 'Care history and journal notes',
    climate: 'Weather and climate for the garden',
    search: 'Search the web for open questions (sends only the question)',
    catalogue: 'PlantPal’s plant catalogue is always available; it holds no personal data.',
    save: 'Save and start',
    change: 'Change what it may read',
    done: 'Done',
  },
  composer: 'Ask the Copilot',
  placeholder: 'e.g. “Which plants need water this week?”',
  send: 'Ask',
  cancel: 'Stop',
  thinking: 'Looking things up…',
  you: 'You',
  copilot: 'Copilot',
  tools: {
    get_garden_overview: 'your garden',
    get_specimen: 'a plant',
    get_recent_activity: 'recent care and notes',
    get_conditions: 'the weather',
    get_climate_fit: 'your climate',
    search_catalog: 'the catalogue',
    get_species_facts: 'species facts',
    check_eligibility: 'whether a plant fits',
    get_tasks: 'your tasks',
    search_web: 'the web',
  } as Record<string, string>,
  lookedAt: 'Looked at',
  sources: 'Sources',
  withheld:
    'The answer broke PlantPal’s safety rules, so it is not shown. For plant safety questions, ask a local extension service or poison centre.',
  proposals: {
    title: 'Suggested change: review before it is saved',
    kinds: {
      propose_care_event: 'Log care',
      propose_observation: 'Add a journal note',
      propose_task: 'Add a reminder',
      propose_schedule_change: 'Change a schedule',
      propose_plan_items: 'Add to a plan',
      propose_health_case: 'Open a health case',
    } satisfies Record<ProposalTool, string>,
    confirm: 'Confirm',
    dismiss: 'Dismiss',
    done: 'Saved',
    dismissed: 'Dismissed',
    stale: 'Something changed since this was suggested, or it is older than 30 minutes. Ask again.',
  },
  empty: 'Ask anything about your plants, care, pests or what to grow next.',
  clear: 'New conversation',
  reflection: {
    title: 'Last week in your garden',
    care: (n: number) => (n === 1 ? '1 care action logged' : `${n} care actions logged`),
    notes: (n: number) => (n === 1 ? '1 journal note' : `${n} journal notes`),
    visits: (n: number) => (n === 1 ? '1 nature visit' : `${n} nature visits`),
    harvest: (n: number) => (n === 1 ? '1 harvest' : `${n} harvests`),
    quiet: 'A quiet week: nothing logged, and that’s fine. Plants keep growing.',
    tasks: (n: number) => (n === 1 ? '1 task this week' : `${n} tasks this week`),
    dismiss: 'Close',
    words: 'Put it in words',
  },
};

export type CopilotMessages = typeof en;
const catalogs: Record<LocalePref, CopilotMessages> = {
  en,
  hi: { ...en, title: 'गार्डन कोपायलट' },
  es: { ...en, title: 'Copiloto del jardín' },
};

export function useCopilotT(): CopilotMessages {
  return catalogs[usePrefs((s) => s.locale)];
}
