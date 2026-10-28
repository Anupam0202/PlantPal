import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  HelpCircle,
  Moon,
  Sun,
} from 'lucide-react';
import type { WeatherKind } from '../../env/weather';

export function WeatherIcon({
  kind,
  isDay = true,
  className = 'size-6',
}: {
  kind: WeatherKind;
  isDay?: boolean;
  className?: string;
}) {
  const p = { className, 'aria-hidden': true as const };
  switch (kind) {
    case 'clear':
      return isDay ? <Sun {...p} /> : <Moon {...p} />;
    case 'mainlyClear':
    case 'partlyCloudy':
      return isDay ? <CloudSun {...p} /> : <Cloud {...p} />;
    case 'overcast':
      return <Cloud {...p} />;
    case 'fog':
      return <CloudFog {...p} />;
    case 'drizzle':
      return <CloudDrizzle {...p} />;
    case 'rain':
    case 'showers':
    case 'freezingRain':
      return <CloudRain {...p} />;
    case 'snow':
    case 'snowShowers':
      return <CloudSnow {...p} />;
    case 'thunder':
      return <CloudLightning {...p} />;
    default:
      return <HelpCircle {...p} />;
  }
}
