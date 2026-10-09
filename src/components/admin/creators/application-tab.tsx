import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";

import {
  PLATFORMS,
  SKUS,
  channelUrl,
  compact,
  intakeGaps,
  shortDate,
  totalAudience,
  type CreatorInterests,
  type DesignSupport,
  type SkuId,
} from "@/lib/hub/model";

import { countryName } from "../format";
import { Panel, PanelTitle } from "../kit";
import type { CreatorDetail } from "./types";
import { Blank, DataList, Pill } from "./ui";

const DESIGN: Record<DesignSupport, string> = {
  "have-art": "Has finished art ready to use",
  "need-design": "Needs MEDIALIFE to design it",
  mix: "Has some art, needs help finishing it",
};

const TIMING: Record<CreatorInterests["timing"], string> = {
  asap: "As soon as possible",
  "1-3-months": "In 1–3 months",
  "3-6-months": "In 3–6 months",
  exploring: "Just exploring",
};

function Section({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Panel className="p-4 sm:p-5">
      <PanelTitle title={title} sub={sub} />
      <div className="mt-2">{children}</div>
    </Panel>
  );
}

const Ext = ({ href, children }: { href: string; children: ReactNode }) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className="inline-flex max-w-full items-center gap-1 text-sky-300 hover:underline"
  >
    {children}
    <ExternalLink className="size-3 shrink-0" aria-hidden />
  </a>
);

/** ISO codes become names; anything else is shown as typed. */
const country = (s: string) => (/^[a-z]{2}$/i.test(s.trim()) ? countryName(s.trim()) : s);

const para = (text: string) => (text.trim() ? <p className="whitespace-pre-wrap">{text}</p> : "");

export function ApplicationTab({ data }: { data: CreatorDetail }) {
  const c = data.creator;
  const gaps = c.status === "draft" ? intakeGaps(c) : [];
  const channels = c.channels.filter((ch) => ch.handle.trim());
  const audience = totalAudience(c.channels);

  return (
    <div className="space-y-4">
      {c.status === "draft" ? (
        <Panel className="border-amber-400/30 p-4 text-sm">
          <p className="font-medium">Application not submitted yet</p>
          <p className="mt-0.5 text-muted-foreground">
            They're on step {c.intakeStep + 1} of the intake.
            {gaps.length
              ? ` Still missing: ${gaps.join(", ").toLowerCase()}.`
              : " Everything required is filled in."}
          </p>
        </Panel>
      ) : null}

      <div className="grid items-start gap-4 @5xl/inset:grid-cols-2">
        <Section title="Profile">
          <DataList
            rows={[
              ["Creator name", c.profile.displayName],
              ["Legal name", c.profile.legalName],
              ["Email", c.profile.email],
              ["Country", country(c.profile.country)],
              ["Time zone", c.profile.timezone],
              ["Audience regions", c.profile.audienceRegions],
              [
                "Content",
                c.profile.categories.length ? (
                  <span className="flex flex-wrap gap-1">
                    {c.profile.categories.map((cat) => (
                      <Pill key={cat} dot={false}>
                        {cat}
                      </Pill>
                    ))}
                  </span>
                ) : (
                  ""
                ),
              ],
              ["Bio", para(c.profile.bio)],
            ]}
          />
        </Section>

        <Section
          title="Channels"
          sub={
            audience
              ? `${compact(audience)} total reported audience`
              : "Audience sizes as the creator reported them"
          }
        >
          {!channels.length ? (
            <p className="py-2 text-sm">
              <Blank>No channels added</Blank>
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="mono text-left text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                  <th className="py-2 pr-3 font-normal">Platform</th>
                  <th className="py-2 pr-3 font-normal">Handle</th>
                  <th className="py-2 text-right font-normal">Audience</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border border-t border-border">
                {channels.map((ch, i) => {
                  const url = ch.url || channelUrl(ch.platform, ch.handle);
                  return (
                    <tr key={i}>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {PLATFORMS[ch.platform]?.label ?? ch.platform}
                        {ch.primary ? (
                          <span className="ml-1.5 text-[10px] text-muted-foreground uppercase">
                            primary
                          </span>
                        ) : null}
                      </td>
                      <td className="max-w-[16rem] truncate py-2 pr-3 whitespace-nowrap">
                        {url ? <Ext href={url}>{ch.handle}</Ext> : ch.handle}
                      </td>
                      <td className="py-2 text-right whitespace-nowrap tabular-nums">
                        {ch.audience != null ? (
                          <>
                            {ch.audience.toLocaleString()}{" "}
                            <span className="text-xs text-muted-foreground">
                              {PLATFORMS[ch.platform]?.audience.toLowerCase()}
                            </span>
                          </>
                        ) : (
                          <Blank>–</Blank>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="Contact">
          <DataList
            rows={[
              ["Discord username", c.contact.discordUsername],
              [
                "Discord ID",
                c.contact.discordId ? (
                  <span className="mono text-xs">{c.contact.discordId}</span>
                ) : (
                  ""
                ),
              ],
              [
                "Discord account",
                data.account?.discord ? (
                  <span>
                    Signed in as {data.account.discord.username}{" "}
                    <span className="mono text-xs text-muted-foreground">
                      ({data.account.discord.id})
                    </span>
                  </span>
                ) : (
                  <Blank>Not linked</Blank>
                ),
              ],
              ["Business email", c.contact.businessEmail],
              ["Phone", c.contact.phone],
              [
                "Manager / agent",
                c.contact.managerName || c.contact.managerEmail ? (
                  <span>
                    {c.contact.managerName}
                    {c.contact.managerEmail ? (
                      <>
                        {c.contact.managerName ? " · " : ""}
                        <a href={`mailto:${c.contact.managerEmail}`} className="hover:underline">
                          {c.contact.managerEmail}
                        </a>
                      </>
                    ) : null}
                  </span>
                ) : (
                  ""
                ),
              ],
              [
                "Referred by",
                c.agency ? (
                  <span>
                    {c.agency.name}
                    {c.agency.rep ? ` · ${c.agency.rep}` : ""}
                    {c.inviteCode ? (
                      <span className="mono ml-1.5 text-xs text-muted-foreground">
                        ?invite={c.inviteCode}
                      </span>
                    ) : null}
                  </span>
                ) : c.inviteCode ? (
                  <span className="mono text-xs">?invite={c.inviteCode}</span>
                ) : (
                  <Blank>Direct</Blank>
                ),
              ],
            ]}
          />
        </Section>

        <Section title="Interests">
          <DataList
            rows={[
              [
                "Products",
                c.interests.skus.length ? (
                  <span className="flex flex-wrap gap-1">
                    {c.interests.skus.map((s) => (
                      <Pill key={s} tone="primary" dot={false}>
                        {SKUS[s as SkuId]?.name ?? s}
                      </Pill>
                    ))}
                  </span>
                ) : (
                  ""
                ),
              ],
              ["Design", DESIGN[c.interests.designSupport]],
              ["Timing", TIMING[c.interests.timing]],
              [
                "Existing merch",
                c.interests.hasExistingMerch ? (
                  c.interests.existingMerchUrl ? (
                    <Ext href={c.interests.existingMerchUrl}>
                      <span className="min-w-0 break-all">{c.interests.existingMerchUrl}</span>
                    </Ext>
                  ) : (
                    "Yes"
                  )
                ) : (
                  "None"
                ),
              ],
              ["Experience ideas", para(c.interests.experienceIdeas)],
              ["Notes", para(c.interests.notes)],
            ]}
          />
        </Section>

        <Section title="Shipping" sub="Where samples go">
          {c.shipping ? (
            <address className="py-2 text-sm leading-relaxed not-italic">
              {[
                c.shipping.name,
                c.shipping.line1,
                c.shipping.line2,
                [c.shipping.city, c.shipping.region, c.shipping.postalCode]
                  .filter(Boolean)
                  .join(", "),
                country(c.shipping.country),
              ]
                .filter((l) => l && l.trim())
                .map((l, i) => (
                  <span key={i} className="block">
                    {l}
                  </span>
                ))}
            </address>
          ) : (
            <p className="py-2 text-sm">
              <Blank>No address yet</Blank>
            </p>
          )}
        </Section>

        <Section title="Payout & consent">
          <DataList
            rows={[
              [
                "Payout",
                c.payout ? (
                  <span>
                    {c.payout.method === "paypal"
                      ? "PayPal"
                      : c.payout.method === "wise"
                        ? "Wise"
                        : "Other"}
                    {c.payout.email ? ` · ${c.payout.email}` : ""}
                    {c.payout.note ? (
                      <span className="block text-xs text-muted-foreground">{c.payout.note}</span>
                    ) : null}
                  </span>
                ) : (
                  <Blank>Not set</Blank>
                ),
              ],
              [
                "Program terms",
                c.consent.termsAt ? (
                  `Agreed ${shortDate(c.consent.termsAt)}`
                ) : (
                  <Blank>Not agreed</Blank>
                ),
              ],
              ["Marketing emails", c.consent.marketing ? "Opted in" : "Opted out"],
            ]}
          />
        </Section>
      </div>
    </div>
  );
}
