import type { GuidedTourDefinition } from './definitions';

export type GuidedTourRunMode = 'onboarding' | 'demo';
export type GuidedTourRuntimeState =
  | { status: 'idle' }
  | {
      status: 'active';
      definition: GuidedTourDefinition;
      mode: GuidedTourRunMode;
      stepIndex: number;
      presenterNotesVisible: boolean;
      sourceDetour: boolean;
      missingTarget: boolean;
    }
  | {
      status: 'confirming_exit';
      definition: GuidedTourDefinition;
      mode: GuidedTourRunMode;
      stepIndex: number;
      presenterNotesVisible: boolean;
      sourceDetour: boolean;
      missingTarget: boolean;
    };

export type GuidedTourAction =
  | {
      type: 'start';
      definition: GuidedTourDefinition;
      mode: GuidedTourRunMode;
      stepIndex?: number;
    }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'request_exit' }
  | { type: 'cancel_exit' }
  | { type: 'exit' }
  | { type: 'toggle_presenter_notes' }
  | { type: 'source_detour'; active: boolean }
  | { type: 'missing_target'; missing: boolean };

export const initialGuidedTourState: GuidedTourRuntimeState = { status: 'idle' };

export function guidedTourReducer(
  state: GuidedTourRuntimeState,
  action: GuidedTourAction,
): GuidedTourRuntimeState {
  if (action.type === 'start')
    return {
      status: 'active',
      definition: action.definition,
      mode: action.mode,
      stepIndex: Math.max(0, Math.min(action.definition.steps.length - 1, action.stepIndex ?? 0)),
      presenterNotesVisible: false,
      sourceDetour: false,
      missingTarget: false,
    };
  if (state.status === 'idle') return state;
  if (action.type === 'exit') return initialGuidedTourState;
  if (action.type === 'request_exit') return { ...state, status: 'confirming_exit' };
  if (action.type === 'cancel_exit') return { ...state, status: 'active' };
  if (action.type === 'toggle_presenter_notes')
    return state.mode === 'demo'
      ? { ...state, presenterNotesVisible: !state.presenterNotesVisible }
      : state;
  if (action.type === 'source_detour') return { ...state, sourceDetour: action.active };
  if (action.type === 'missing_target') return { ...state, missingTarget: action.missing };
  if (action.type === 'back')
    return {
      ...state,
      status: 'active',
      stepIndex: Math.max(0, state.stepIndex - 1),
      sourceDetour: false,
      missingTarget: false,
    };
  if (action.type === 'next')
    return {
      ...state,
      status: 'active',
      stepIndex: Math.min(state.definition.steps.length - 1, state.stepIndex + 1),
      sourceDetour: false,
      missingTarget: false,
    };
  return state;
}
