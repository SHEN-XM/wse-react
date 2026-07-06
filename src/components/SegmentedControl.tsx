export type SegmentedOption<T extends string | number> = {
  label: string;
  value: T;
};

type SegmentedControlProps<T extends string | number> = {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
};

export default function SegmentedControl<T extends string | number>({ value, options, onChange, disabled, className = "" }: SegmentedControlProps<T>) {
  return (
    <div className={`segmented-control ${className}`} role="radiogroup">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            className={active ? "is-active" : ""}
            disabled={disabled}
            key={String(option.value)}
            onClick={() => onChange(option.value)}
            role="radio"
            type="button"
            aria-checked={active}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
