/**
 * Admin dashboard icons. Extracted from dashboard.tsx so the main file
 * stays focused on coordination + layout.
 */

export function HighlightIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 2l3 3-7 7-3.5.5L4 9l7-7z" />
      <path d="M2 14h12" />
    </svg>
  );
}

export function RedactIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="2" y="6" width="12" height="4" rx="1" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg
      className="h-3 w-3"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}
