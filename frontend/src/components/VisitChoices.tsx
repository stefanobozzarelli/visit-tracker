import React from 'react';

/**
 * Big one-click pickers used by the visit entry forms (client and supplier)
 * in place of the old Meeting Type / Status dropdowns.
 */

type Option = { value: string; label: string; tone?: 'green' | 'gold' | 'red'; icon?: React.ReactNode };

const Seg: React.FC<{ value: string; onChange: (v: string) => void; options: Option[]; ariaLabel: string }> = ({ value, onChange, options, ariaLabel }) => (
  <div className="vx-seg" role="group" aria-label={ariaLabel}>
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        aria-pressed={value === o.value}
        data-tone={o.tone}
        onClick={() => onChange(o.value)}
      >
        {o.icon}
        {o.label}
      </button>
    ))}
  </div>
);

const icon = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);

const MEETING_TYPES: Option[] = [
  { value: 'in_person', label: 'In person', icon: icon(<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />) },
  { value: 'call', label: 'Call', icon: icon(<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />) },
  { value: 'video_call', label: 'Video call', icon: icon(<><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3" /></>) },
];

const STATUSES: Option[] = [
  { value: 'scheduled', label: 'Scheduled', tone: 'gold' },
  { value: 'completed', label: 'Completed', tone: 'green' },
  { value: 'cancelled', label: 'Cancelled', tone: 'red' },
];

export const MeetingTypeChoice: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <Seg value={value || 'in_person'} onChange={onChange} options={MEETING_TYPES} ariaLabel="Meeting type" />
);

export const VisitStatusChoice: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <Seg value={value} onChange={onChange} options={STATUSES} ariaLabel="Status" />
);
