import type { GuidedTourPlacement } from './definitions';

export type TourRectangle = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type TourPanelPosition = {
  top: number;
  left: number;
  placement: GuidedTourPlacement;
};

export function tourScrollBehavior(reducedMotion: boolean): ScrollBehavior {
  return reducedMotion ? 'auto' : 'smooth';
}

const GAP = 18;
const MARGIN = 12;

function fits(
  placement: GuidedTourPlacement,
  target: TourRectangle,
  panel: { width: number; height: number },
  viewport: { width: number; height: number },
) {
  if (placement === 'top') return target.top - panel.height - GAP >= MARGIN;
  if (placement === 'bottom')
    return target.top + target.height + GAP + panel.height <= viewport.height - MARGIN;
  if (placement === 'left') return target.left - panel.width - GAP >= MARGIN;
  return target.left + target.width + GAP + panel.width <= viewport.width - MARGIN;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function placeTourPanel(input: {
  target: TourRectangle;
  panel: { width: number; height: number };
  viewport: { width: number; height: number };
  preferred: GuidedTourPlacement;
}): TourPanelPosition {
  const opposite: Record<GuidedTourPlacement, GuidedTourPlacement> = {
    top: 'bottom',
    bottom: 'top',
    left: 'right',
    right: 'left',
  };
  const candidates = [
    input.preferred,
    opposite[input.preferred],
    'bottom',
    'top',
    'right',
    'left',
  ] as GuidedTourPlacement[];
  const placement =
    candidates.find((candidate) => fits(candidate, input.target, input.panel, input.viewport)) ??
    input.preferred;
  const centeredLeft = input.target.left + input.target.width / 2 - input.panel.width / 2;
  const centeredTop = input.target.top + input.target.height / 2 - input.panel.height / 2;
  const raw =
    placement === 'top'
      ? {
          top: input.target.top - input.panel.height - GAP,
          left: centeredLeft,
        }
      : placement === 'bottom'
        ? {
            top: input.target.top + input.target.height + GAP,
            left: centeredLeft,
          }
        : placement === 'left'
          ? {
              top: centeredTop,
              left: input.target.left - input.panel.width - GAP,
            }
          : {
              top: centeredTop,
              left: input.target.left + input.target.width + GAP,
            };
  return {
    placement,
    top: clamp(raw.top, MARGIN, input.viewport.height - input.panel.height - MARGIN),
    left: clamp(raw.left, MARGIN, input.viewport.width - input.panel.width - MARGIN),
  };
}

export function tourConnectorPoints(input: {
  target: TourRectangle;
  panel: TourRectangle;
  placement: GuidedTourPlacement;
}) {
  const target = {
    x: input.target.left + input.target.width / 2,
    y: input.target.top + input.target.height / 2,
  };
  const panel =
    input.placement === 'top'
      ? { x: input.panel.left + input.panel.width / 2, y: input.panel.top + input.panel.height }
      : input.placement === 'bottom'
        ? { x: input.panel.left + input.panel.width / 2, y: input.panel.top }
        : input.placement === 'left'
          ? { x: input.panel.left + input.panel.width, y: input.panel.top + input.panel.height / 2 }
          : { x: input.panel.left, y: input.panel.top + input.panel.height / 2 };
  return { start: panel, end: target };
}
