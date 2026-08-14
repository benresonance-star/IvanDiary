export function SettingToggle({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="setting-row">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <span className="setting-switch">
        <input
          aria-label={label}
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
        <span aria-hidden="true" className="setting-switch-track">
          <span />
        </span>
      </span>
    </label>
  );
}
