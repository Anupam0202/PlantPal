/** Original single-weight ink illustrations for empty states (decorative). */
const ink = {
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none',
};

export function SeedlingIllustration({ size = 120 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <ellipse cx="60" cy="100" rx="38" ry="6" fill="currentColor" opacity="0.08" />
      <path {...ink} d="M36 70h48l-6 28a3 3 0 0 1-3 2.4H45a3 3 0 0 1-3-2.4z" />
      <path {...ink} d="M33 70h54" />
      <path {...ink} d="M60 70V44" />
      <path
        d="M60 52c-2-10-10-16-21-16 0 11 8 18 21 16Z"
        fill="currentColor"
        opacity="0.18"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M60 46c2-11 11-17 23-17 0 12-9 19-23 17Z"
        fill="currentColor"
        opacity="0.3"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path {...ink} d="M44 82c5 2 27 2 32 0" opacity="0.5" />
    </svg>
  );
}

export function SleepingBeeIllustration({ size = 120 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <path {...ink} d="M20 92c14-6 26-6 40 0s26 6 40 0" opacity="0.5" />
      <ellipse
        cx="60"
        cy="72"
        rx="16"
        ry="11"
        fill="currentColor"
        opacity="0.15"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path {...ink} d="M54 62v20M64 62v20" />
      <path {...ink} d="M52 62c-6-10-16-12-20-8s4 10 16 10" />
      <path {...ink} d="M66 62c6-10 16-12 20-8s-4 10-16 10" />
      <circle cx="44" cy="72" r="5" {...ink} />
      <path {...ink} d="M80 40h8l-8 8h8M92 26h6l-6 6h6" opacity="0.6" />
    </svg>
  );
}

export function RainCloudIllustration({ size = 120 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <path
        d="M36 66h48a14 14 0 0 0 0-28 20 20 0 0 0-38-4 15 15 0 0 0-10 32Z"
        fill="currentColor"
        opacity="0.14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path {...ink} d="M44 76l-4 10M60 76l-4 10M76 76l-4 10M52 92l-3 7M68 92l-3 7" />
    </svg>
  );
}

export function MagnifierLeafIllustration({ size = 120 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="54" cy="54" r="24" {...ink} />
      <path {...ink} d="M72 72l18 18" strokeWidth="4" />
      <path
        d="M54 66c-1-10 4-18 14-20 1 10-4 18-14 20Z"
        fill="currentColor"
        opacity="0.25"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path {...ink} d="M54 66c2-6 6-10 11-13" />
    </svg>
  );
}
