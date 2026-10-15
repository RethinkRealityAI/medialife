import type { MouseEvent, ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";

/**
 * A link to any hub path. Uses the router when it knows the path (client-side
 * navigation) and is a plain link otherwise, so a path that isn't in a file's
 * route types still works.
 */
export function HubLink({
  to,
  className,
  children,
  onNavigate,
  ...rest
}: {
  to: string;
  className?: string;
  children: ReactNode;
  onNavigate?: () => void;
  "aria-current"?: "page" | undefined;
  "aria-label"?: string;
}) {
  const router = useRouter();
  return (
    <a
      href={to}
      className={className}
      {...rest}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onNavigate?.();
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        void router.navigate({ href: to });
      }}
    >
      {children}
    </a>
  );
}
