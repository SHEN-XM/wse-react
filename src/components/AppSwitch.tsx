type AppSwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
  title?: string;
  className?: string;
};

export default function AppSwitch({ checked, onChange, disabled = false, ariaLabel, title, className = "" }: AppSwitchProps) {
  return (
    <button
      className={`table-switch app-switch ${checked ? "is-on" : ""} ${className}`.trim()}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      title={title || ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span aria-hidden="true" />
    </button>
  );
}
