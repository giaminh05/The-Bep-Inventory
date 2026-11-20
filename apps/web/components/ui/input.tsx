import type { InputHTMLAttributes } from "react";

/** Foundation primitive; business forms are intentionally introduced in later work. */
export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`} {...props} />;
}
