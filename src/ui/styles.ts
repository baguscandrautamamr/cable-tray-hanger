/**
 * The handful of surfaces this app is built from, each written once in both
 * themes.
 *
 * Two themes doubles every colour decision, and a border repeated inline in
 * fourteen places is fourteen chances for one of them to keep a light-only
 * value and vanish against a dark background. Naming them keeps the pair in
 * step, and makes "what does a table look like here" a question with one
 * answer.
 */

/** A panel: form block, stat card, anything sitting on the page background. */
export const surface =
  "rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50";

/** Wrapper that lets a wide table scroll on its own instead of the page. */
export const tableWrap =
  "overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800";

export const tableHead =
  "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-400";

export const tableBody = "divide-y divide-slate-200 dark:divide-slate-800";

export const tableRow = "text-slate-700 dark:text-slate-300";

export const input =
  "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none " +
  "focus:border-amber-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 " +
  "dark:focus:border-amber-400";

/** The one call to action on a page. Amber reads on both backgrounds. */
export const primaryButton =
  "inline-flex items-center justify-center gap-1.5 rounded-md bg-amber-500 px-4 py-2 text-sm " +
  "font-medium text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50";

/** The push-to-Revit action, kept distinct from the amber of everything else. */
export const actionButton =
  "inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium " +
  "text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40 " +
  "dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400";

export const secondaryButton =
  "inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-sm " +
  "text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 " +
  "dark:hover:bg-slate-800";

/** Square version of the above, for the icon-only toggles in the header. */
export const iconButton =
  "inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 " +
  "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 " +
  "dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100";

export const heading = "text-slate-900 dark:text-slate-100";

export const label =
  "flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200";

/** Explanatory text under a field, and every other secondary line. */
export const muted = "text-slate-500 dark:text-slate-400";

/** Fainter still: axis labels, timestamps in a table.  */
export const faint = "text-slate-400 dark:text-slate-500";

export const accentIcon = "text-sky-600 dark:text-sky-400";
