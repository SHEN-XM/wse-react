import type { FormField } from "../data/menu";
import type { ReactNode } from "react";

type Props = {
  fields: FormField[];
  values: Record<string, unknown>;
  errors?: Record<string, string>;
  onChange: (next: Record<string, unknown>) => void;
  renderField: (field: FormField, values: Record<string, unknown>, onChange: (next: Record<string, unknown>) => void) => ReactNode;
  className?: string;
};

function fieldClassName(field: FormField, hasError: boolean) {
  const classes = ["crud-form-field"];
  if (field.layout === "wide" || field.type === "textarea") classes.push("wide");
  if (field.layout === "half") classes.push("half");
  if (hasError) classes.push("has-error");
  return classes.join(" ");
}

export default function CrudForm({ fields, values, errors = {}, onChange, renderField, className = "" }: Props) {
  return (
    <div className={`crud-form ${className}`.trim()}>
      {fields.map((field) => {
        const error = errors[field.key];
        return (
          <label className={fieldClassName(field, Boolean(error))} key={field.key}>
            <span>
              {field.label}
              {field.required === false ? "" : <em>*</em>}
            </span>
            {renderField(field, values, onChange)}
            {error ? <small>{error}</small> : null}
          </label>
        );
      })}
    </div>
  );
}
