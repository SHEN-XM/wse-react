import AppSelect from "./AppSelect";
import type { ThemeName } from "../theme/ThemeProvider";

type Props = {
  value: ThemeName;
  options: Array<{ value: ThemeName; label: string }>;
  onChange: (value: ThemeName) => void;
};

export default function ThemeSelect({ value, options, onChange }: Props) {
  return <AppSelect value={value} options={options} onChange={onChange} className="theme-dropdown" triggerClassName="theme-trigger" menuClassName="theme-menu" placeholder="主题" ariaLabel="主题" />;
}
