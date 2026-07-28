'use client';

import {
  type CSSProperties,
  type RefObject,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { saveGuidedTourStateAction } from '@/app/w/[workspaceId]/tour-actions';
import {
  firstRunTour,
  resolveGuidedTourRoute,
  stakeholderDemoTour,
  type GuidedTourDefinition,
  type GuidedTourStep,
} from '@/lib/guided-tour/definitions';
import {
  initialGuidedTourState,
  guidedTourReducer,
  type GuidedTourRunMode,
} from '@/lib/guided-tour/state';
import {
  placeTourPanel,
  tourScrollBehavior,
  tourConnectorPoints,
  type TourRectangle,
} from '@/lib/guided-tour/geometry';

type PersistedTourState = {
  status: 'started' | 'completed' | 'dismissed';
  last_completed_step: number;
} | null;

type TargetState = {
  element: HTMLElement;
  rect: TourRectangle;
} | null;

const PANEL_WIDTH = 360;
const TARGET_PADDING = 6;
const TARGET_WAIT_MS = 2_500;

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function routeParts(route: string) {
  const [pathname, search = ''] = route.split('?');
  return { pathname, search };
}

function visible(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function paddedRect(rect: DOMRect): TourRectangle {
  const left = Math.max(4, rect.left - TARGET_PADDING);
  const top = Math.max(4, rect.top - TARGET_PADDING);
  const right = Math.min(window.innerWidth - 4, rect.right + TARGET_PADDING);
  const bottom = Math.min(window.innerHeight - 4, rect.bottom + TARGET_PADDING);
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

export function WorkspaceGuidedTour({
  workspaceId,
  demoEligible,
  initialOnboardingState,
  children,
}: {
  workspaceId: string;
  demoEligible: boolean;
  initialOnboardingState: PersistedTourState;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, dispatch] = useReducer(guidedTourReducer, initialGuidedTourState);
  const [target, setTarget] = useState<TargetState>(null);
  const [panelSize, setPanelSize] = useState({ width: PANEL_WIDTH, height: 300 });
  const [retryNonce, setRetryNonce] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [persistenceError, setPersistenceError] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const autoStartedRef = useRef(false);
  const missingDiagnosticRef = useRef('');

  useEffect(() => setMounted(true), []);

  const activeState = state.status === 'idle' ? null : state;
  const active = activeState !== null;
  const step = activeState ? activeState.definition.steps[activeState.stepIndex] : null;
  const resolvedStepRoute = step ? resolveGuidedTourRoute(step.route, workspaceId) : null;
  const reducedMotion = mounted
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : true;

  const persist = useCallback(
    async (
      definition: GuidedTourDefinition,
      mode: GuidedTourRunMode,
      status: 'started' | 'completed' | 'dismissed',
      lastCompletedStep: number,
    ) => {
      if (mode === 'demo') return;
      const result = await saveGuidedTourStateAction({
        workspaceId,
        tourId: definition.id,
        tourVersion: definition.version,
        status,
        lastCompletedStep,
      });
      if (!result.ok) setPersistenceError(result.error);
    },
    [workspaceId],
  );

  const startTour = useCallback(
    (
      definition: GuidedTourDefinition,
      mode: GuidedTourRunMode,
      startAt = 0,
      source?: HTMLElement | null,
    ) => {
      returnFocusRef.current =
        source ?? launcherRef.current ?? (document.activeElement as HTMLElement);
      setPersistenceError('');
      dispatch({ type: 'start', definition, mode, stepIndex: startAt });
      setAnnouncement(`${definition.steps[startAt]?.title ?? 'Guided tour'} started.`);
      void persist(definition, mode, 'started', Math.max(0, startAt));
    },
    [persist],
  );

  useEffect(() => {
    if (
      autoStartedRef.current ||
      !demoEligible ||
      state.status !== 'idle' ||
      pathname !== `/w/${workspaceId}` ||
      initialOnboardingState?.status === 'completed' ||
      initialOnboardingState?.status === 'dismissed'
    )
      return;
    autoStartedRef.current = true;
    const startAt =
      initialOnboardingState?.status === 'started'
        ? Math.min(
            firstRunTour.steps.length - 1,
            Math.max(0, initialOnboardingState.last_completed_step),
          )
        : 0;
    startTour(firstRunTour, 'onboarding', startAt);
  }, [demoEligible, initialOnboardingState, pathname, startTour, state.status, workspaceId]);

  useEffect(() => {
    if (!activeState || !step || !resolvedStepRoute) {
      setTarget(null);
      return;
    }
    const definition = activeState.definition;
    const missingTarget = activeState.missingTarget;
    const sourceDetour =
      state.status !== 'idle' &&
      state.sourceDetour &&
      pathname.startsWith(`/w/${workspaceId}/documents/`);
    const targetKey = sourceDetour ? 'source-page-viewer' : step.targetKey;
    const expected = routeParts(resolvedStepRoute);
    if (
      !sourceDetour &&
      (pathname !== expected.pathname || searchParams.toString() !== expected.search)
    ) {
      setTarget(null);
      router.push(resolvedStepRoute);
      return;
    }

    let stopped = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let observer: MutationObserver | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let locatedElement: HTMLElement | null = null;
    let updateTarget: (() => void) | null = null;
    const locate = () => {
      if (stopped) return false;
      const element = document.querySelector<HTMLElement>(`[data-tour-target="${targetKey}"]`);
      if (!element || !visible(element)) return false;
      locatedElement = element;
      const initialRect = element.getBoundingClientRect();
      const outside =
        initialRect.bottom < 16 ||
        initialRect.top > window.innerHeight - 16 ||
        initialRect.right < 16 ||
        initialRect.left > window.innerWidth - 16;
      if (outside)
        element.scrollIntoView({
          behavior: tourScrollBehavior(reducedMotion),
          block: 'center',
          inline: 'nearest',
        });
      updateTarget = () => {
        if (!stopped) setTarget({ element, rect: paddedRect(element.getBoundingClientRect()) });
      };
      window.requestAnimationFrame(updateTarget);
      resizeObserver = new ResizeObserver(updateTarget);
      resizeObserver.observe(element);
      window.addEventListener('resize', updateTarget);
      window.addEventListener('scroll', updateTarget, true);
      clearTimeout(timeout);
      if (missingTarget) dispatch({ type: 'missing_target', missing: false });
      return true;
    };
    if (!locate()) {
      observer = new MutationObserver(() => {
        if (locate()) observer?.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      timeout = setTimeout(() => {
        observer?.disconnect();
        if (stopped) return;
        setTarget(null);
        dispatch({ type: 'missing_target', missing: true });
        const diagnosticKey = `${definition.id}:${step.id}:${targetKey}`;
        if (missingDiagnosticRef.current !== diagnosticKey) {
          missingDiagnosticRef.current = diagnosticKey;
          document.dispatchEvent(
            new CustomEvent('guided-tour-missing-target', {
              detail: {
                tourId: definition.id,
                tourVersion: definition.version,
                stepId: step.id,
                targetKey,
                required: step.fallbackBehavior === 'required',
              },
            }),
          );
        }
      }, TARGET_WAIT_MS);
    }
    const onTargetClick = (event: Event) => {
      if (step.interactionRequirement !== 'open_source') return;
      const anchor = (event.target as Element | null)?.closest('a[href*="/documents/"]');
      if (anchor && locatedElement?.contains(anchor)) {
        dispatch({ type: 'source_detour', active: true });
        setAnnouncement('Original source opened. Return to the review when you are ready.');
      }
    };
    document.addEventListener('click', onTargetClick, true);
    return () => {
      stopped = true;
      clearTimeout(timeout);
      observer?.disconnect();
      resizeObserver?.disconnect();
      if (updateTarget) {
        window.removeEventListener('resize', updateTarget);
        window.removeEventListener('scroll', updateTarget, true);
      }
      document.removeEventListener('click', onTargetClick, true);
    };
  }, [
    pathname,
    reducedMotion,
    resolvedStepRoute,
    retryNonce,
    router,
    searchParams,
    activeState,
    step,
    workspaceId,
  ]);

  useEffect(() => {
    if (!active || !panelRef.current) return;
    const update = () => {
      const rect = panelRef.current?.getBoundingClientRect();
      if (rect) setPanelSize({ width: rect.width, height: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(panelRef.current);
    return () => observer.disconnect();
  }, [active, activeState?.status, activeState?.stepIndex, activeState?.missingTarget]);

  const finish = useCallback(
    (status: 'completed' | 'dismissed' = 'completed') => {
      if (state.status === 'idle') return;
      const completedStep =
        status === 'completed' ? state.definition.steps.length : state.stepIndex;
      void persist(state.definition, state.mode, status, completedStep);
      dispatch({ type: 'exit' });
      setTarget(null);
      setAnnouncement(status === 'completed' ? 'Guided tour completed.' : 'Guided tour dismissed.');
      window.requestAnimationFrame(() => returnFocusRef.current?.focus());
    },
    [persist, state],
  );

  const next = useCallback(() => {
    if (state.status === 'idle') return;
    const current = state.definition.steps[state.stepIndex];
    if (!current) return;
    if (state.sourceDetour && resolvedStepRoute) {
      dispatch({ type: 'source_detour', active: false });
      router.push(resolvedStepRoute);
      setAnnouncement('Returned to the source-evidence step.');
      return;
    }
    if (state.stepIndex === state.definition.steps.length - 1) {
      finish('completed');
      return;
    }
    void persist(state.definition, state.mode, 'started', current.order);
    dispatch({ type: 'next' });
    setAnnouncement(
      `Step ${state.stepIndex + 2} of ${state.definition.steps.length}: ${
        state.definition.steps[state.stepIndex + 1]?.title ?? ''
      }`,
    );
  }, [finish, persist, resolvedStepRoute, router, state]);

  const back = useCallback(() => {
    if (state.status === 'idle') return;
    if (state.sourceDetour && resolvedStepRoute) {
      dispatch({ type: 'source_detour', active: false });
      router.push(resolvedStepRoute);
      return;
    }
    dispatch({ type: 'back' });
    setAnnouncement(`Step ${Math.max(1, state.stepIndex)} of ${state.definition.steps.length}.`);
  }, [resolvedStepRoute, router, state]);

  useEffect(() => {
    if (!active) return;
    window.requestAnimationFrame(() => panelRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dispatch({ type: 'request_exit' });
        return;
      }
      const tag = (event.target as HTMLElement | null)?.tagName;
      const isField = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
      if (!isField && event.key === 'ArrowRight') {
        event.preventDefault();
        next();
        return;
      }
      if (!isField && event.key === 'ArrowLeft') {
        event.preventDefault();
        back();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const panelFocusable = [...panelRef.current.querySelectorAll<HTMLElement>(focusableSelector)];
      const targetFocusable =
        step?.interactionRequirement === 'informational' || !target?.element
          ? []
          : [...target.element.querySelectorAll<HTMLElement>(focusableSelector)].filter(visible);
      if (target?.element.matches(focusableSelector) && visible(target.element))
        targetFocusable.unshift(target.element);
      const focusable = [...targetFocusable, ...panelFocusable];
      if (!focusable.length) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const nextIndex = event.shiftKey
        ? currentIndex <= 0
          ? focusable.length - 1
          : currentIndex - 1
        : currentIndex < 0 || currentIndex === focusable.length - 1
          ? 0
          : currentIndex + 1;
      event.preventDefault();
      focusable[nextIndex]?.focus();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [active, back, next, step?.interactionRequirement, target?.element]);

  const panelPosition = useMemo(() => {
    if (!target)
      return {
        top: Math.max(12, (mounted ? window.innerHeight : 700) / 2 - panelSize.height / 2),
        left: Math.max(12, (mounted ? window.innerWidth : 1000) / 2 - panelSize.width / 2),
        placement: 'bottom' as const,
      };
    return placeTourPanel({
      target: target.rect,
      panel: panelSize,
      viewport: {
        width: mounted ? window.innerWidth : 1000,
        height: mounted ? window.innerHeight : 700,
      },
      preferred: step?.preferredPlacement ?? 'bottom',
    });
  }, [mounted, panelSize, step?.preferredPlacement, target]);

  const resetDemo = (source: HTMLElement) => {
    const firstStep = stakeholderDemoTour.steps[0];
    if (!firstStep) return;
    startTour(stakeholderDemoTour, 'demo', 0, source);
    router.push(resolveGuidedTourRoute(firstStep.route, workspaceId));
  };

  return (
    <>
      {children}
      {demoEligible ? (
        <details
          hidden={state.status !== 'idle'}
          className="no-print fixed bottom-4 right-4 z-50 rounded-md border border-line-default bg-surface-850 shadow-overlay"
        >
          <summary className="cursor-pointer list-none px-4 py-2.5 text-sm font-semibold text-ink">
            Guided tour
          </summary>
          <div className="grid min-w-52 gap-2 border-t border-line-subtle p-3">
            <button
              ref={launcherRef}
              type="button"
              className="secondary-action btn-sm"
              onClick={(event) => startTour(firstRunTour, 'onboarding', 0, event.currentTarget)}
            >
              {initialOnboardingState ? 'Restart tour' : 'Start guided tour'}
            </button>
            <button
              type="button"
              className="primary-action btn-sm"
              onClick={(event) => startTour(stakeholderDemoTour, 'demo', 0, event.currentTarget)}
            >
              Start guided demo
            </button>
            <button
              type="button"
              className="tertiary-action btn-sm"
              onClick={(event) => resetDemo(event.currentTarget)}
            >
              Reset demo walkthrough
            </button>
          </div>
        </details>
      ) : null}
      {mounted && activeState && step
        ? createPortal(
            <TourOverlay
              state={activeState}
              step={step}
              target={target}
              panelRef={panelRef}
              panelPosition={panelPosition}
              panelSize={panelSize}
              persistenceError={persistenceError}
              onBack={back}
              onNext={next}
              onExit={() => finish('dismissed')}
              onRequestExit={() => dispatch({ type: 'request_exit' })}
              onCancelExit={() => dispatch({ type: 'cancel_exit' })}
              onSkip={() => finish('dismissed')}
              onRetry={() => {
                dispatch({ type: 'missing_target', missing: false });
                setRetryNonce((value) => value + 1);
              }}
              onRestart={() => {
                const firstStep = activeState.definition.steps[0];
                if (!firstStep) return;
                dispatch({
                  type: 'start',
                  definition: activeState.definition,
                  mode: activeState.mode,
                  stepIndex: 0,
                });
                router.push(resolveGuidedTourRoute(firstStep.route, workspaceId));
              }}
              onToggleNotes={() => dispatch({ type: 'toggle_presenter_notes' })}
            />,
            document.body,
          )
        : null}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </>
  );
}

function TourOverlay({
  state,
  step,
  target,
  panelRef,
  panelPosition,
  panelSize,
  persistenceError,
  onBack,
  onNext,
  onExit,
  onRequestExit,
  onCancelExit,
  onSkip,
  onRetry,
  onRestart,
  onToggleNotes,
}: {
  state: Exclude<ReturnType<typeof guidedTourReducer>, { status: 'idle' }>;
  step: GuidedTourStep;
  target: TargetState;
  panelRef: RefObject<HTMLDivElement | null>;
  panelPosition: { top: number; left: number; placement: 'top' | 'right' | 'bottom' | 'left' };
  panelSize: { width: number; height: number };
  persistenceError: string;
  onBack: () => void;
  onNext: () => void;
  onExit: () => void;
  onRequestExit: () => void;
  onCancelExit: () => void;
  onSkip: () => void;
  onRetry: () => void;
  onRestart: () => void;
  onToggleNotes: () => void;
}) {
  const informational = step.interactionRequirement === 'informational';
  const missing = state.missingTarget;
  const locating = !state.missingTarget && !target;
  const last = state.stepIndex === state.definition.steps.length - 1;
  const panelRect: TourRectangle = {
    top: panelPosition.top,
    left: panelPosition.left,
    width: panelSize.width,
    height: panelSize.height,
  };
  const connector = target
    ? tourConnectorPoints({
        target: target.rect,
        panel: panelRect,
        placement: panelPosition.placement,
      })
    : null;
  const panelStyle: CSSProperties = {
    position: 'fixed',
    zIndex: 80,
    top: panelPosition.top,
    left: panelPosition.left,
    width: `min(${PANEL_WIDTH}px, calc(100vw - 24px))`,
    maxHeight: 'calc(100vh - 24px)',
    overflowY: 'auto',
  };

  return (
    <div
      data-testid="guided-tour"
      data-tour-id={state.definition.id}
      data-tour-step={step.id}
      data-tour-missing-target={missing ? step.targetKey : undefined}
    >
      <Spotlight target={target?.rect ?? null} blockTarget={informational} />
      {connector && !missing ? (
        <svg
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[76] h-screen w-screen"
        >
          <defs>
            <marker
              id="tour-arrowhead"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8 z" fill="var(--color-teal-300)" />
            </marker>
          </defs>
          <line
            x1={connector.start.x}
            y1={connector.start.y}
            x2={connector.end.x}
            y2={connector.end.y}
            stroke="var(--color-teal-300)"
            strokeWidth="2"
            markerEnd="url(#tour-arrowhead)"
          />
        </svg>
      ) : null}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guided-tour-step-title"
        aria-describedby="guided-tour-step-description"
        tabIndex={-1}
        className="dialog-surface outline-none"
        style={panelStyle}
      >
        {state.status === 'confirming_exit' ? (
          <>
            <p className="section-kicker">Exit guided tour?</p>
            <h2 id="guided-tour-step-title" className="section-title mt-2">
              Your place can be resumed later
            </h2>
            <p id="guided-tour-step-description" className="mt-2 text-sm text-ink-soft">
              Exit without changing any RFP evidence or business decision.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" className="secondary-action btn-sm" onClick={onCancelExit}>
                Stay in tour
              </button>
              <button type="button" className="primary-action btn-sm" onClick={onExit}>
                Exit tour
              </button>
            </div>
          </>
        ) : missing ? (
          <>
            <p className="section-kicker">
              Step {state.stepIndex + 1} of {state.definition.steps.length}
            </p>
            <h2 id="guided-tour-step-title" className="section-title mt-2">
              This part of the walkthrough is unavailable
            </h2>
            <p id="guided-tour-step-description" className="mt-2 text-sm text-ink-soft">
              The expected page element could not be found. No action was performed. You can retry,
              continue, or exit.
            </p>
            <p className="analyst-only mono mt-3 text-xs text-ink-muted">
              Missing target: {step.targetKey}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" className="secondary-action btn-sm" onClick={onRetry}>
                Retry
              </button>
              <button type="button" className="secondary-action btn-sm" onClick={onNext}>
                Continue
              </button>
              <button type="button" className="tertiary-action btn-sm" onClick={onRequestExit}>
                Exit
              </button>
            </div>
          </>
        ) : locating ? (
          <>
            <p className="section-kicker">
              Step {state.stepIndex + 1} of {state.definition.steps.length}
            </p>
            <h2 id="guided-tour-step-title" className="section-title mt-2">
              Loading this walkthrough step
            </h2>
            <p id="guided-tour-step-description" className="mt-2 text-sm text-ink-soft">
              Waiting for the page and highlighted control to become available.
            </p>
            <button type="button" className="tertiary-action btn-sm mt-4" onClick={onRequestExit}>
              Exit tour
            </button>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <p className="section-kicker">
                Step {state.stepIndex + 1} of {state.definition.steps.length}
              </p>
              <button
                type="button"
                className="quiet-link text-xs font-semibold"
                onClick={onRequestExit}
                aria-label="Exit guided tour"
              >
                Exit
              </button>
            </div>
            <div
              className="progress-track mt-3"
              role="progressbar"
              aria-label="Guided tour progress"
              aria-valuemin={1}
              aria-valuemax={state.definition.steps.length}
              aria-valuenow={state.stepIndex + 1}
            >
              <div
                className="progress-fill"
                style={{
                  width: `${((state.stepIndex + 1) / state.definition.steps.length) * 100}%`,
                }}
              />
            </div>
            <h2 id="guided-tour-step-title" className="section-title mt-4 text-lg">
              {step.title}
            </h2>
            <p
              id="guided-tour-step-description"
              className="mt-2 text-sm leading-relaxed text-ink-soft"
            >
              {state.sourceDetour
                ? 'You are viewing the original source. Return to the review to continue from the same step.'
                : step.text}
            </p>
            {step.interactionRequirement === 'manual_business_action' ? (
              <p className="notice notice-info mt-3 py-3">
                Perform the highlighted action only if you choose. The tour will not do it for you.
              </p>
            ) : null}
            {state.mode === 'demo' && step.presenterNote ? (
              <div className="mt-3 border-t border-line-subtle pt-3">
                <button
                  type="button"
                  className="tertiary-action btn-sm px-0"
                  onClick={onToggleNotes}
                >
                  {state.presenterNotesVisible ? 'Hide presenter notes' : 'Show presenter notes'}
                </button>
                {state.presenterNotesVisible ? (
                  <p
                    className="mt-2 rounded-sm border border-line-subtle bg-canvas-950/70 p-3 text-xs leading-relaxed text-ink-muted"
                    data-testid="presenter-note"
                  >
                    {step.presenterNote}
                  </p>
                ) : null}
              </div>
            ) : null}
            {persistenceError ? (
              <p role="status" className="notice notice-warning mt-3 py-3">
                Tour progress could not be saved. The walkthrough can continue in this browser
                session.
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  className="secondary-action btn-sm"
                  disabled={state.stepIndex === 0 && !state.sourceDetour}
                  onClick={onBack}
                >
                  Back
                </button>
                <button type="button" className="primary-action btn-sm" onClick={onNext}>
                  {state.sourceDetour ? 'Return to review' : last ? 'Finish tour' : 'Next'}
                </button>
              </div>
              <div className="flex gap-1">
                <button type="button" className="tertiary-action btn-sm" onClick={onRestart}>
                  Restart tour
                </button>
                <button type="button" className="tertiary-action btn-sm" onClick={onSkip}>
                  Skip tour
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Spotlight({
  target,
  blockTarget,
}: {
  target: TourRectangle | null;
  blockTarget: boolean;
}) {
  const shade = 'rgba(4, 6, 6, 0.78)';
  if (!target)
    return (
      <div aria-hidden="true" className="fixed inset-0 z-[70]" style={{ background: shade }} />
    );
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  return (
    <>
      <div
        aria-hidden="true"
        className="fixed left-0 top-0 z-[70]"
        style={{ width: viewportWidth, height: target.top, background: shade }}
      />
      <div
        aria-hidden="true"
        className="fixed left-0 z-[70]"
        style={{
          top: target.top,
          width: target.left,
          height: target.height,
          background: shade,
        }}
      />
      <div
        aria-hidden="true"
        className="fixed z-[70]"
        style={{
          top: target.top,
          left: target.left + target.width,
          width: Math.max(0, viewportWidth - target.left - target.width),
          height: target.height,
          background: shade,
        }}
      />
      <div
        aria-hidden="true"
        className="fixed bottom-0 left-0 z-[70]"
        style={{
          top: target.top + target.height,
          width: viewportWidth,
          height: Math.max(0, viewportHeight - target.top - target.height),
          background: shade,
        }}
      />
      <div
        aria-hidden="true"
        data-testid="guided-tour-spotlight"
        className="pointer-events-none fixed z-[75] rounded-md border-2 border-teal-300 shadow-[0_0_0_3px_rgba(155,189,186,0.18)]"
        style={{
          top: target.top,
          left: target.left,
          width: target.width,
          height: target.height,
        }}
      />
      {blockTarget ? (
        <div
          aria-hidden="true"
          className="fixed z-[74]"
          style={{
            top: target.top,
            left: target.left,
            width: target.width,
            height: target.height,
          }}
        />
      ) : null}
    </>
  );
}
