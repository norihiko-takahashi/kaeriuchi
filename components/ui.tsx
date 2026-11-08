"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-on-primary",
  secondary: "bg-surface text-text border border-line",
  danger: "bg-danger text-white",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`tap rounded-[var(--radius)] px-6 font-bold disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function LinkButton({
  href,
  variant = "primary",
  children,
  className = "",
}: {
  href: string;
  variant?: Variant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      onClick={(e) => {
        // オフラインでは、キャッシュしたページを直接開く（client/pwa/navigate.ts）
        if (!navigator.onLine) {
          e.preventDefault();
          window.location.assign(href);
        }
      }}
      className={`tap inline-flex items-center justify-center rounded-[var(--radius)] px-6 font-bold ${variants[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}

export function Page({
  title,
  children,
  footer,
}: {
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="flex flex-1 flex-col gap-4">{children}</div>
      {footer ? <div className="flex flex-col gap-3">{footer}</div> : null}
    </main>
  );
}

export function ErrorText({
  children,
  id,
}: {
  children?: ReactNode;
  id?: string;
}) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="font-bold text-danger">
      {children}
    </p>
  );
}

export function Loading() {
  return (
    <main
      className="flex min-h-dvh items-center justify-center"
      aria-busy="true"
    >
      <p className="text-muted">よみこみちゅう…</p>
    </main>
  );
}
