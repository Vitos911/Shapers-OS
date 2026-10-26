import type { ComponentPropsWithRef } from "react";

function classes(variant: string, className?: string) {
  return `${variant}${className ? ` ${className}` : ""}`;
}

/** Presentation-only primitives: native elements retain their props, refs and behavior. */
export function GlassSurface({ className, ...props }: ComponentPropsWithRef<"div">) {
  return <div {...props} className={classes("glass-surface", className)} />;
}
export function GlassCard({ className, ...props }: ComponentPropsWithRef<"section">) {
  return <section {...props} className={classes("glass-card", className)} />;
}
export function GlassButton({ className, ...props }: ComponentPropsWithRef<"button">) {
  return <button {...props} className={classes("glass-button", className)} />;
}
export function GlassInput({ className, ...props }: ComponentPropsWithRef<"input">) {
  return <input {...props} className={classes("glass-input", className)} />;
}
export function GlassBadge({ className, ...props }: ComponentPropsWithRef<"span">) {
  return <span {...props} className={classes("glass-badge", className)} />;
}
export function GlassModal({ className, ...props }: ComponentPropsWithRef<"dialog">) {
  return <dialog {...props} className={classes("glass-modal", className)} />;
}
