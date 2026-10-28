/**
 * Loading, error and "nothing yet" states shared by the creator pages.
 */
import { useEffect } from "react";
import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { RotateCw, WifiOff } from "lucide-react";

import { btnGhost, btnGold } from "@/components/ugc/shared/look";
import { UGC, UGC_ROUTES } from "@/lib/ugc/model";

import { EmptyState, Page, Skel } from "./kit";

const isSignedOut = (e: unknown) => e instanceof Error && /signed-out/.test(e.message);

/** A route's error screen: signed out → sign in; offline → say so; else retry. */
export function UgcRouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const signedOut = isSignedOut(error);
  useEffect(() => {
    if (signedOut)
      window.location.assign(
        `${UGC_ROUTES.signIn}?next=${encodeURIComponent(window.location.pathname)}`,
      );
  }, [signedOut]);
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <Page>
      <EmptyState
        art={offline ? "none" : "can"}
        icon={offline ? WifiOff : undefined}
        title={
          signedOut ? "Signing you in again…" : offline ? "You're offline" : "This page didn't load"
        }
        action={
          signedOut ? null : (
            <>
              <button
                type="button"
                className={btnGold}
                onClick={() => {
                  reset();
                  void router.invalidate();
                }}
              >
                <RotateCw aria-hidden /> Try again
              </button>
              <a className={btnGhost} href={`mailto:${UGC.supportEmail}`}>
                Get help
              </a>
            </>
          )
        }
      >
        {signedOut
          ? "Your session ended. Taking you to sign-in."
          : offline
            ? "Reconnect and try again. Nothing you've done is lost."
            : "Something went wrong on our side. Try again in a moment."}
      </EmptyState>
    </Page>
  );
}

/** A generic page skeleton: a heading and a few cards. */
export function UgcPageSkeleton({ hero }: { hero?: boolean }) {
  return (
    <Page>
      <div role="status" aria-label="Loading">
        {hero ? (
          <Skel className="h-48 rounded-[28px] sm:h-60" />
        ) : (
          <>
            <Skel className="h-3 w-24" />
            <Skel className="mt-3 h-9 w-64 max-w-full" />
            <Skel className="mt-3 h-4 w-96 max-w-full" />
          </>
        )}
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Skel className="h-40 rounded-[22px]" />
          <Skel className="h-40 rounded-[22px]" />
          <Skel className="h-28 rounded-[22px] md:col-span-2" />
        </div>
      </div>
    </Page>
  );
}

/** No live brief yet (approved, but the campaign isn't published or assigned). */
export function NoCampaign({ what = "brief" }: { what?: string }) {
  return (
    <EmptyState
      title="Your brief is on its way"
      action={
        <a className={btnGhost} href={UGC_ROUTES.home}>
          Back to Home
        </a>
      }
    >
      We'll email you the moment the {what} is ready. Until then, keep an eye out for your package.
    </EmptyState>
  );
}
