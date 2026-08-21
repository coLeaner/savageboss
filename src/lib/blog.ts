// Shared helpers for the Notes (blog) section.

/** Rough reading time in minutes from a post body (~200 wpm), floored at 1. */
export function readingTime(body: string | undefined): number {
	const words = (body ?? '').trim().split(/\s+/).filter(Boolean).length;
	return Math.max(1, Math.round(words / 200));
}

/** Marker colors, cycled per entry — the site's "Boss / Sheriff" highlighter pair. */
export const markerColors = ['#f3b5e5', '#f5921f'];

const dateFmt = new Intl.DateTimeFormat('en-US', {
	day: 'numeric',
	month: 'short',
	year: 'numeric',
});

/** "26 Jul 2026" */
export function formatDate(date: Date): string {
	return dateFmt.format(date);
}
