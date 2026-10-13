import { z } from 'zod';
export const Intent = z.object({ intent: z.enum(['answer','pose','grab']), puzzleId: z.string().min(1).max(40), answer: z.string().max(200).optional() }).strict();
export const port = Number(process.env.PORT ?? 3000);
export function parseCookie(h: string|undefined){ const o:Record<string,string>={}; for(const p of (h??'').split(';')){const i=p.indexOf('=');if(i>0)o[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1).trim())} return o }
