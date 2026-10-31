import type { SVGProps } from 'react';

/** Custom botanical icons on the Lucide 24px grid with a 1.75 stroke. Decorative unless labelled. */
type IconProps = SVGProps<SVGSVGElement> & { title?: string };

function Svg({ title, children, ...rest }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      {...rest}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

export const PotIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 13h14l-1.6 7.2a1 1 0 0 1-1 .8H7.6a1 1 0 0 1-1-.8z" />
    <path d="M4 13h16" />
    <path d="M12 13V7" />
    <path d="M12 9c-.5-2.5-2.5-4-5-4 0 2.6 2 4.3 5 4" />
    <path d="M12 8c.5-2.6 2.6-4 5-4 0 2.7-2.1 4.4-5 4" />
  </Svg>
);

export const WateringCanIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 9h9v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" />
    <path d="M15 11l5-4" />
    <path d="M20 7l1.5-.5" />
    <path d="M6 12H4.5a1.5 1.5 0 0 1 0-3H6" />
    <path d="M9 9V6.5a1.5 1.5 0 0 1 3 0V9" />
  </Svg>
);

export const BeeIcon = (p: IconProps) => (
  <Svg {...p}>
    <ellipse cx="12" cy="14" rx="4" ry="5.5" />
    <path d="M8.3 12h7.4M8.3 15.5h7.4" />
    <path d="M10 8.7C8 5.5 4.5 5 3.5 6.5s1.5 4 6 4.5" />
    <path d="M14 8.7c2-3.2 5.5-3.7 6.5-2.2s-1.5 4-6 4.5" />
    <path d="M12 19.5v1.5" />
  </Svg>
);

export const SunPathIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 18h18" />
    <path d="M5 18a7 7 0 0 1 14 0" strokeDasharray="2 2.5" />
    <circle cx="15.5" cy="9.5" r="2" />
    <path d="M15.5 5.5v-1M19.5 9.5h1M18.3 6.7l.7-.7" />
  </Svg>
);

export const RainBarrelIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 8h12v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" />
    <path d="M6 12h12M6 16h12" />
    <path d="M12 2.5c-1 1.4-1.6 2.4-1.6 3.1a1.6 1.6 0 0 0 3.2 0c0-.7-.6-1.7-1.6-3.1z" />
  </Svg>
);

export const CompostIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20h16" />
    <path d="M6 20l1.5-8h9L18 20" />
    <path d="M9 12c0-2 1.3-3.5 3-3.5S15 10 15 12" />
    <path d="M12 8.5V5.5c1.5 0 3-1 3-3" />
  </Svg>
);

export const SeedPacketIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3h12v18H6z" />
    <path d="M6 7h12" />
    <path d="M12 17v-5" />
    <path d="M12 13.5c-.4-1.8-1.8-2.8-3.5-2.8 0 1.9 1.4 3 3.5 2.8M12 12.5c.4-1.8 1.8-2.8 3.5-2.8 0 1.9-1.4 3-3.5 2.8" />
  </Svg>
);

export const HoverflyIcon = (p: IconProps) => (
  <Svg {...p}>
    <ellipse cx="12" cy="14.5" rx="2.6" ry="5" />
    <path d="M9.6 13h4.8M9.6 16h4.8" />
    <path d="M10.5 10.5 4 7.5M13.5 10.5 20 7.5" />
    <circle cx="12" cy="8.5" r="1.8" />
  </Svg>
);
