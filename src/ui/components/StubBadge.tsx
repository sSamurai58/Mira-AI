export function StubBadge({ label = "stub" }: { label?: string }) {
  return <span className="stub">{label}</span>;
}
