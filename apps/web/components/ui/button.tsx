import type { ButtonHTMLAttributes } from "react";

export const buttonClassName = "button";

export function Button({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`${buttonClassName} ${className}`} {...props} />;
}
