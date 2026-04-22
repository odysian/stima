import { useState } from "react";

import { Input, type InputProps } from "@/shared/components/Input";

interface PasswordFieldProps extends Omit<InputProps, "type" | "endAdornment"> {
  showToggleLabel?: string;
  hideToggleLabel?: string;
}

export function PasswordField({
  showToggleLabel = "Show password",
  hideToggleLabel = "Hide password",
  autoComplete = "current-password",
  ...props
}: PasswordFieldProps): React.ReactElement {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <Input
      {...props}
      type={isVisible ? "text" : "password"}
      autoComplete={autoComplete}
      endAdornment={(
        <button
          type="button"
          className="cursor-pointer text-xs font-semibold text-primary"
          aria-label={isVisible ? hideToggleLabel : showToggleLabel}
          aria-pressed={isVisible}
          onClick={() => setIsVisible((visible) => !visible)}
        >
          {isVisible ? "Hide" : "Show"}
        </button>
      )}
    />
  );
}
