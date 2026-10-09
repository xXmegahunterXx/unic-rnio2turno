import clsx, { type ClassValue } from 'clsx';
/** Junta classes condicionalmente. */
export const cn = (...v: ClassValue[]) => clsx(v);
