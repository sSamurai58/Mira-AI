/**
 * Renders a vendored official brand mark inside a rounded tile.
 * Assets live in public/brand-icons/ (see scripts/vendor-brand-icons.mjs).
 */

export type OfficialBrandAsset = {
  /** Filename under public/brand-icons/ */
  file: string;
  /** Tile background */
  bg: string;
  /** Logo scale relative to tile (0–1). Default 0.68 */
  scale?: number;
};

type Props = {
  asset: OfficialBrandAsset;
  size?: number;
  className?: string;
};

/** Relative path works for Vite + Electron loadFile (base: "./"). */
export function brandIconSrc(file: string): string {
  return `./brand-icons/${file}`;
}

export function OfficialBrandIcon({ asset, size = 36, className }: Props) {
  const s = size;
  const scale = asset.scale ?? 0.68;
  const inner = Math.round(s * scale);
  const radius = Math.max(6, Math.round(s * 0.25));

  return (
    <span
      className={className}
      aria-hidden
      style={{
        width: s,
        height: s,
        borderRadius: radius,
        background: asset.bg,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        flexShrink: 0,
        boxSizing: "border-box",
      }}
    >
      <img
        src={brandIconSrc(asset.file)}
        alt=""
        width={inner}
        height={inner}
        draggable={false}
        style={{
          width: inner,
          height: inner,
          objectFit: "contain",
          display: "block",
          pointerEvents: "none",
        }}
      />
    </span>
  );
}
