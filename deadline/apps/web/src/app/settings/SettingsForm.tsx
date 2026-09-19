'use client';

import { useEffect, useState } from 'react';
import { Panel } from '@/components/Panel';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type GameSettings } from '@/lib/settings';

/**
 * Client-side preferences.
 *
 * These only affect how the game feels on this device — sensitivity, audio,
 * quality — so they live in localStorage rather than the database.
 */
export function SettingsForm() {
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const update = <K extends keyof GameSettings>(key: K, value: GameSettings[K]): void => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveSettings(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

  return (
    <Panel title="CONTROLS & DISPLAY" action={saved ? <span className="text-[10px] tracking-[0.2em] text-uncommon">SAVED</span> : null}>
      <div className="space-y-5">
        <Slider
          label="MOUSE SENSITIVITY"
          value={settings.sensitivity}
          min={0.2}
          max={3}
          step={0.05}
          onChange={(value) => update('sensitivity', value)}
        />
        <Slider
          label="AUDIO VOLUME"
          value={settings.audioVolume}
          min={0}
          max={1}
          step={0.05}
          onChange={(value) => update('audioVolume', value)}
        />
        <Toggle
          label="INVERT VERTICAL AIM"
          checked={settings.invertY}
          onChange={(value) => update('invertY', value)}
        />
        <Toggle
          label="AUDIO ENABLED"
          checked={settings.audioEnabled}
          onChange={(value) => update('audioEnabled', value)}
        />
        <Toggle
          label="SHOW PERFORMANCE STATS"
          checked={settings.showStats}
          onChange={(value) => update('showStats', value)}
        />
      </div>
    </Panel>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex justify-between text-[10px] tracking-[0.25em] text-muted">
        {label}
        <span className="font-mono text-ink">{value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[var(--color-signal)]"
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between">
      <span className="text-[10px] tracking-[0.25em] text-muted">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={[
          'relative h-5 w-10 border transition-colors',
          checked ? 'border-signal bg-signal/30' : 'border-edge bg-void',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 h-3.5 w-3.5 transition-all',
            checked ? 'left-5 bg-signal' : 'left-0.5 bg-muted',
          ].join(' ')}
        />
      </button>
    </label>
  );
}
