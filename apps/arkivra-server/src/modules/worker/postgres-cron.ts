function addCronValues({
  values,
  start,
  end,
  token,
}: {
  values: Set<number>;
  start: number;
  end: number;
  token: string;
}) {
  const [base, stepRaw] = token.split('/');
  const step = stepRaw === undefined ? 1 : Number.parseInt(stepRaw, 10);

  if (!Number.isInteger(step) || step <= 0) {
    throw new Error(`Invalid cron step "${token}"`);
  }

  const normalizedBase = (base ?? '').trim();

  if (normalizedBase.length === 0) {
    throw new TypeError(`Invalid cron token "${token}"`);
  }
  let rangeStart = start;
  let rangeEnd = end;

  if (normalizedBase !== '*') {
    const [rangeStartRaw, rangeEndRaw] = normalizedBase.split('-');
    rangeStart = Number.parseInt(rangeStartRaw ?? '', 10);
    rangeEnd = rangeEndRaw === undefined ? rangeStart : Number.parseInt(rangeEndRaw, 10);

    if (!Number.isInteger(rangeStart) || !Number.isInteger(rangeEnd)) {
      throw new TypeError(`Invalid cron range "${token}"`);
    }
  }

  if (rangeStart < start || rangeEnd > end || rangeStart > rangeEnd) {
    throw new TypeError(`Cron range "${token}" is out of bounds`);
  }

  for (let value = rangeStart; value <= rangeEnd; value += step) {
    values.add(value === 7 && end === 7 ? 0 : value);
  }
}

function parseCronField(field: string, min: number, max: number) {
  const trimmed = field.trim();

  if (trimmed.length === 0) {
    throw new Error('Empty cron field');
  }

  if (trimmed === '*') {
    return { isWildcard: true, values: null as Set<number> | null };
  }

  const values = new Set<number>();
  for (const token of trimmed.split(',')) {
    addCronValues({
      values,
      start: min,
      end: max,
      token: token.trim(),
    });
  }

  return { isWildcard: false, values };
}

function createCronMatcher(pattern: string) {
  const parts = pattern.trim().split(/\s+/);

  if (parts.length !== 5) {
    throw new Error(`Unsupported cron pattern "${pattern}"`);
  }

  const minute = parseCronField(parts[0] ?? '', 0, 59);
  const hour = parseCronField(parts[1] ?? '', 0, 23);
  const dayOfMonth = parseCronField(parts[2] ?? '', 1, 31);
  const month = parseCronField(parts[3] ?? '', 1, 12);
  const dayOfWeek = parseCronField(parts[4] ?? '', 0, 7);

  function includes(field: { isWildcard: boolean; values: Set<number> | null }, value: number) {
    return field.isWildcard || field.values?.has(value) === true;
  }

  return {
    matches(date: Date) {
      const minuteMatches = includes(minute, date.getUTCMinutes());
      const hourMatches = includes(hour, date.getUTCHours());
      const monthMatches = includes(month, date.getUTCMonth() + 1);
      const dayOfMonthMatches = includes(dayOfMonth, date.getUTCDate());
      const dayOfWeekMatches = includes(dayOfWeek, date.getUTCDay());

      const dayMatches = dayOfMonth.isWildcard || dayOfWeek.isWildcard
        ? dayOfMonthMatches && dayOfWeekMatches
        : dayOfMonthMatches || dayOfWeekMatches;

      return minuteMatches && hourMatches && monthMatches && dayMatches;
    },
  };
}

export function getNextCronRun(pattern: string, after = new Date()) {
  // Cron expressions are evaluated in UTC so workers in different host
  // timezones schedule the same persisted instants.
  const matcher = createCronMatcher(pattern);
  const candidate = new Date(after.getTime());
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

  for (let index = 0; index < 60 * 24 * 366 * 5; index += 1) {
    if (matcher.matches(candidate)) {
      return new Date(candidate.getTime());
    }

    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }

  throw new Error(`Could not find the next run for cron pattern "${pattern}"`);
}
