/**
 * The product's single icon family: 24x24 outline geometry, 1.6 stroke, round
 * caps and joins. Kept in-repo so every glyph shares one optical weight and no
 * icon dependency is added to the bundle.
 *
 * Icons are decorative by default. Pass `title` only when the icon is the sole
 * label for a control.
 */
import type { ReactNode, SVGProps } from 'react';

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  size?: number;
  title?: string;
};

function icon(path: ReactNode, displayName: string) {
  const Component = ({ size = 18, title, ...rest }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {path}
    </svg>
  );
  Component.displayName = displayName;
  return Component;
}

export const IconSearch = icon(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 3.5 3.5" />
  </>,
  'IconSearch',
);

export const IconChevronRight = icon(<path d="m9.5 5.5 6.5 6.5-6.5 6.5" />, 'IconChevronRight');

export const IconChevronLeft = icon(<path d="m14.5 5.5-6.5 6.5 6.5 6.5" />, 'IconChevronLeft');

export const IconChevronDown = icon(<path d="m5.5 9.5 6.5 6.5 6.5-6.5" />, 'IconChevronDown');

export const IconArrowRight = icon(
  <>
    <path d="M4.5 12h14" />
    <path d="m13 6.5 5.5 5.5-5.5 5.5" />
  </>,
  'IconArrowRight',
);

export const IconArrowLeft = icon(
  <>
    <path d="M19.5 12h-14" />
    <path d="m11 6.5-5.5 5.5 5.5 5.5" />
  </>,
  'IconArrowLeft',
);

export const IconAlert = icon(
  <>
    <path d="M12 4.8 3.6 19.2h16.8L12 4.8Z" />
    <path d="M12 10v4" />
    <path d="M12 17h.01" />
  </>,
  'IconAlert',
);

export const IconBlocker = icon(
  <>
    <path d="M8.4 3.6h7.2L20.4 8.4v7.2L15.6 20.4H8.4L3.6 15.6V8.4L8.4 3.6Z" />
    <path d="M12 8v4.5" />
    <path d="M12 16h.01" />
  </>,
  'IconBlocker',
);

export const IconCheck = icon(<path d="m5 12.5 4.5 4.5L19 7" />, 'IconCheck');

export const IconCheckCircle = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m8.2 12.4 2.6 2.6 5-5.4" />
  </>,
  'IconCheckCircle',
);

export const IconClock = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </>,
  'IconClock',
);

export const IconCalendar = icon(
  <>
    <rect x="3.8" y="5.5" width="16.4" height="14" rx="2.5" />
    <path d="M3.8 10h16.4" />
    <path d="M8.5 3.5v3.5M15.5 3.5v3.5" />
  </>,
  'IconCalendar',
);

export const IconDocument = icon(
  <>
    <path d="M6 3.6h7L18.4 9v11.4H6V3.6Z" />
    <path d="M13 3.6V9h5.4" />
    <path d="M9 13h6M9 16.4h4" />
  </>,
  'IconDocument',
);

export const IconDocuments = icon(
  <>
    <path d="M8.5 2.6h6l4.9 4.9v10.9h-10.9V2.6Z" />
    <path d="M14.5 2.6v4.9h4.9" />
    <path d="M5.5 6.5v14.9h10.4" />
  </>,
  'IconDocuments',
);

export const IconChecklist = icon(
  <>
    <path d="m3.6 7 2 2 3-3.4" />
    <path d="m3.6 16.4 2 2 3-3.4" />
    <path d="M11.6 7.4h8.8M11.6 16.8h8.8" />
  </>,
  'IconChecklist',
);

export const IconReport = icon(
  <>
    <rect x="4.2" y="3.6" width="15.6" height="16.8" rx="2.5" />
    <path d="M8.4 15.4v-3M12 15.4V9M15.6 15.4v-5" />
  </>,
  'IconReport',
);

export const IconDownload = icon(
  <>
    <path d="M12 4v10" />
    <path d="m7.6 10.2 4.4 4.4 4.4-4.4" />
    <path d="M4.6 19.4h14.8" />
  </>,
  'IconDownload',
);

export const IconUpload = icon(
  <>
    <path d="M12 19V9" />
    <path d="m7.6 12.8 4.4-4.4 4.4 4.4" />
    <path d="M4.6 4.6h14.8" />
  </>,
  'IconUpload',
);

export const IconExternal = icon(
  <>
    <path d="M13.5 4.6H19.4V10.5" />
    <path d="M19.4 4.6 11 13" />
    <path d="M17 14.4v4.2a.8.8 0 0 1-.8.8H5.4a.8.8 0 0 1-.8-.8V7.8a.8.8 0 0 1 .8-.8h4.2" />
  </>,
  'IconExternal',
);

export const IconUser = icon(
  <>
    <circle cx="12" cy="8.6" r="3.6" />
    <path d="M5.4 20c.9-3.4 3.5-5.3 6.6-5.3s5.7 1.9 6.6 5.3" />
  </>,
  'IconUser',
);

export const IconInfo = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.2" />
    <path d="M12 7.9h.01" />
  </>,
  'IconInfo',
);

export const IconShield = icon(
  <>
    <path d="M12 3.4 5 6v5.6c0 3.9 2.8 7.4 7 9 4.2-1.6 7-5.1 7-9V6l-7-2.6Z" />
    <path d="m9.2 11.8 2.1 2.1 3.6-3.9" />
  </>,
  'IconShield',
);

export const IconEye = icon(
  <>
    <path d="M2.8 12S6 6.6 12 6.6 21.2 12 21.2 12 18 17.4 12 17.4 2.8 12 2.8 12Z" />
    <circle cx="12" cy="12" r="2.8" />
  </>,
  'IconEye',
);

export const IconTrash = icon(
  <>
    <path d="M4.8 7h14.4" />
    <path d="M9.4 7V4.8h5.2V7" />
    <path d="M6.6 7l.9 12a1 1 0 0 0 1 .9h7a1 1 0 0 0 1-.9l.9-12" />
    <path d="M10.5 11v5M13.5 11v5" />
  </>,
  'IconTrash',
);

export const IconPlus = icon(
  <>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </>,
  'IconPlus',
);

export const IconRefresh = icon(
  <>
    <path d="M19.4 12a7.4 7.4 0 1 1-2.2-5.2" />
    <path d="M19.4 4.6v4h-4" />
  </>,
  'IconRefresh',
);

export const IconQuote = icon(
  <>
    <path d="M9.4 6.6C6.8 8 5.4 10.2 5.4 13v4.4h4.6V12H8.2c0-1.6.6-2.8 2-3.7Z" />
    <path d="M18.4 6.6C15.8 8 14.4 10.2 14.4 13v4.4H19V12h-1.8c0-1.6.6-2.8 2-3.7Z" />
  </>,
  'IconQuote',
);

export const IconLink = icon(
  <>
    <path d="M10 14a3.6 3.6 0 0 1 0-5.1l2.4-2.4a3.6 3.6 0 0 1 5.1 5.1L16.3 12.8" />
    <path d="M14 10a3.6 3.6 0 0 1 0 5.1l-2.4 2.4a3.6 3.6 0 0 1-5.1-5.1L7.7 11.2" />
  </>,
  'IconLink',
);

export const IconFilter = icon(
  <>
    <path d="M4.6 6.4h14.8" />
    <path d="M7.4 12h9.2" />
    <path d="M10.2 17.6h3.6" />
  </>,
  'IconFilter',
);

export const IconSpark = icon(
  <>
    <path d="M12 4.6v4M12 15.4v4M4.6 12h4M15.4 12h4" />
    <path d="M12 9.6 14.4 12 12 14.4 9.6 12Z" />
  </>,
  'IconSpark',
);

export const IconActivity = icon(<path d="M3.6 12.4h3.6l2.4-6 3.2 11 2.4-5h5.2" />, 'IconActivity');
