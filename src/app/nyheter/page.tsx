import { ExternalLink, Megaphone, Newspaper } from "lucide-react";
import { db } from "@/lib/db";
import { getNews } from "@/lib/news";
import { PageHeader, SectionTitle, Empty } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { relative, fmtDate } from "@/lib/format";
import { isSafeUrl } from "@/lib/security";

export const metadata = { title: "Nyheter" };
export const dynamic = "force-dynamic";

export default async function NewsPage() {
  const [news, posts] = await Promise.all([
    getNews(24),
    db.notification.findMany({ where: { type: { in: ["NEWS", "GENERAL"] }, audience: "ALL" }, orderBy: { createdAt: "desc" }, take: 6 }),
  ]);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-12">
      <PageHeader kicker="Senaste nytt" title="Nyheter">
        Nytt från tipset och det senaste om Allsvenskan från svenska medier.
      </PageHeader>

      {posts.length > 0 && (
        <section className="mb-14">
          <SectionTitle>
            <span className="flex items-center gap-2">
              <Megaphone className="size-7 text-gold" /> Från tipset
            </span>
          </SectionTitle>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((p, i) => (
              <Reveal key={p.id} delay={i * 0.05}>
                <article className="card h-full overflow-hidden p-0">
                  {p.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt="" className="aspect-video w-full object-cover" loading="lazy" />
                  )}
                  <div className="p-5">
                    <p className="text-xs text-muted">{fmtDate(p.createdAt)}</p>
                    <h2 className="font-display mt-1 text-3xl">{p.title}</h2>
                    <p className="mt-2 whitespace-pre-line text-muted">{p.body}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      <SectionTitle>
        <span className="flex items-center gap-2">
          <Newspaper className="size-7 text-gold" /> Allsvenskan i media
        </span>
      </SectionTitle>
      {news.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {news.filter((n) => isSafeUrl(n.link)).map((n, i) => (
            <Reveal key={n.link + i} delay={Math.min(i * 0.03, 0.4)}>
              <a
                href={n.link}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="card group flex h-full items-start gap-4 p-4 transition hover:border-pitch/50"
              >
                <div className="flex-1">
                  <p className="text-xs font-semibold text-gold">
                    {n.source} · {relative(n.publishedAt)}
                  </p>
                  <h3 className="mt-1 font-semibold leading-snug group-hover:text-gold">{n.title}</h3>
                </div>
                <ExternalLink className="mt-1 size-4 shrink-0 text-faint" aria-hidden />
              </a>
            </Reveal>
          ))}
        </div>
      ) : (
        <Empty title="Inga nyheter just nu">Nyhetsflödet kunde inte hämtas. Försök igen om en stund.</Empty>
      )}
    </div>
  );
}
