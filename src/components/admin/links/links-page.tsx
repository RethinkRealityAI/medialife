import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { listLinks } from "@/lib/ar/links.functions";

import { isUnauthorized } from "../format";
import { NamespaceBadge, PageHeader, Panel, SignInAgain } from "../kit";
import { CreateLink } from "./create-link";
import { LinkList } from "./link-list";

export function LinksPage({ initialDemo }: { initialDemo: string | undefined }) {
  const q = useQuery({
    queryKey: ["ar-links"],
    queryFn: () => listLinks(),
    retry: (n, err) => !isUnauthorized(err) && n < 2,
  });
  const [highlight, setHighlight] = useState<string | null>(null);
  const data = q.data;

  return (
    <>
      <Toaster theme="dark" position="bottom-right" />
      <PageHeader
        title="Client links"
        badge={<NamespaceBadge ns={data?.ns} />}
        actions={
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-9 bg-transparent hover:bg-white/[0.06] hover:text-foreground"
          >
            <Link to="/admin/analytics">
              <BarChart3 aria-hidden />
              Analytics
            </Link>
          </Button>
        }
      >
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          A personal link for each client or contact. The demo says who it was prepared for, and
          every visit is attributed to them.
        </p>
      </PageHeader>

      <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        {q.isError && isUnauthorized(q.error) ? (
          <SignInAgain />
        ) : q.isError ? (
          <Panel className="mx-auto max-w-md p-6 text-center">
            <h2 className="text-base font-medium">Couldn't load client links</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Check your connection and try again.
            </p>
            <Button className="mt-4" onClick={() => void q.refetch()}>
              Try again
            </Button>
          </Panel>
        ) : !data ? (
          <>
            <Panel className="h-72 animate-pulse" />
            <Panel className="h-96 animate-pulse" />
          </>
        ) : (
          <>
            <CreateLink
              demos={data.demos}
              links={data.links}
              initialDemo={initialDemo}
              onCreated={(l) => setHighlight(l.code)}
            />
            <LinkList
              links={data.links}
              demos={data.demos}
              stats={data.stats}
              statsDays={data.statsDays}
              highlight={highlight}
            />
          </>
        )}
      </div>
    </>
  );
}
