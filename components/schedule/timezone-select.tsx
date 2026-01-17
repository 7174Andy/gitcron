"use client";

import { Select, SelectOption } from "@/components/ui/select";
import { TIMEZONES, getTimezoneLabel } from "@/lib/timezone/data";

interface TimezoneSelectProps {
  value: string;
  onChange: (value: string) => void;
}

export function TimezoneSelect({ value, onChange }: TimezoneSelectProps) {
  const options: SelectOption[] = TIMEZONES.map((tz) => ({
    value: tz.value,
    label: getTimezoneLabel(tz),
    description: tz.value,
  }));

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Timezone
      </label>
      <Select
        options={options}
        value={value}
        onChange={onChange}
        placeholder="Select timezone..."
        searchable
      />
    </div>
  );
}
