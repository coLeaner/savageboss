const liberiaHour = new Intl.DateTimeFormat('en-GB', {
	timeZone: 'Africa/Monrovia',
	hour: '2-digit',
	hourCycle: 'h23',
});

/** The artwork uses a fixed daytime window, not astronomical sunrise/sunset. */
export function getSkyPhase(date = new Date()): 'day' | 'night' {
	const hour = Number(liberiaHour.format(date));
	return hour >= 6 && hour < 18 ? 'day' : 'night';
}
