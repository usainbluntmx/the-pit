/**
 * Runs on every navigation (unlike a layout), so each route change gets a
 * short enter animation instead of snapping into place.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
