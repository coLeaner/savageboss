import type { ImageMetadata } from 'astro';
import bossformLogo from '../assets/logos/bossform.webp';
import habitLogo from '../assets/logos/habit.png';
import mansaLightLogo from '../assets/logos/mansastock-light.webp';
import mansaDarkLogo from '../assets/logos/mansastock-dark.webp';

/**
 * The things Abraham is building. One list, read by both the announcement
 * pill at the top of the page and the Work section, so a new product or a
 * changed link only has to be written once.
 *
 * The logos are the real app marks, lifted from each project:
 *   MansaStock  mansa-stock/public/brand/mark-{light,dark}-256.webp
 *   BossForm    Bossform/bossform/public/branding/logo-3d.webp
 *   Habit       HabitT/HabitT/assets/icons/adaptive-icon/foreground.png
 *   Connectz    connectz.com/src/components/Logo.jsx (the inline mark)
 */
export type Product = {
	title: string;
	/** One short line: what the thing is. */
	note: string;
	/**
	 * PLACEHOLDER means there's no public URL yet. Swap it for the real one
	 * and the title turns into a link everywhere by itself — nothing else to
	 * change. Until then nothing links to a dead `#`.
	 */
	href: string;
	/** Raster mark imported from src/assets (Astro resizes it at build). */
	logo?: ImageMetadata;
	/** Alternate artwork for a dark background. */
	logoDark?: ImageMetadata;
	/** Vector mark served from public/logos. */
	svg?: string;
	/** Flat black artwork that has to flip on the dark theme. */
	invert?: boolean;
	/** 'contain' for a transparent mark, 'cover' for a square app icon. */
	fit?: 'contain' | 'cover';
	/** Work section details. */
	tag?: string;
	variant?: 'building' | 'data';
	period?: string;
};

/** Drop this in `href` until the real URL exists. */
export const PLACEHOLDER = '#';

export const products: Product[] = [
	{
		title: 'MansaStock',
		note: 'AI business management app',
		href: 'https://mansa-stock.vercel.app',
		tag: 'Building',
		variant: 'building',
		period: '2025 — Now',
		logo: mansaLightLogo,
		logoDark: mansaDarkLogo,
		fit: 'contain',
	},
	{
		title: 'BossForm',
		note: 'Forms, responses and automations',
		href: 'https://bossform.vercel.app/',
		tag: 'Building',
		variant: 'building',
		period: '2025 — Now',
		logo: bossformLogo,
		fit: 'contain',
	},
	{
		title: 'Connectz',
		note: 'Digital contact cards',
		href: 'https://libconnectz.com/login',
		tag: 'Building',
		variant: 'building',
		period: '2025 — Now',
		svg: '/logos/connectz.svg',
		fit: 'contain',
	},
	{
		title: 'Habit',
		note: 'Daily habit tracker for Android',
		tag: 'Building',
		variant: 'building',
		period: '2025 — Now',
		href: 'https://habitmarketing.netlify.app/',
		logo: habitLogo,
		fit: 'contain',
	},
];

/** True once a product has somewhere real to point at. */
export const isLive = (p: Product) => p.href !== PLACEHOLDER;
