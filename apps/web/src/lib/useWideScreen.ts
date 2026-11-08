import { useEffect, useState } from 'react';

/** True from 768 px wide, where the app shows its side navigation instead of the bottom bar. */
export function useWideScreen(): boolean {
  const [wide, setWide] = useState(
    () => typeof matchMedia !== 'undefined' && matchMedia('(min-width: 768px)').matches,
  );
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia('(min-width: 768px)');
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}
