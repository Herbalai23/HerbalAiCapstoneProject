import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import BrandMark from './BrandMark';
import { EXTERNAL_LINKS } from '../lib/external-links';

const quickLinks = [
  { label: 'Home', href: '/' },
  { label: 'Herbal Library', href: '/library' },
  { label: 'Dr. Ai', href: '/chat' },
  { label: 'Community', href: '/community' },
  { label: 'Suggest a herb', href: '/suggest' },
  { label: 'About the project', href: '/about' },
];

const referenceLinks = [
  EXTERNAL_LINKS.pitahc,
  EXTERNAL_LINKS.tkdl,
  EXTERNAL_LINKS.kew,
  EXTERNAL_LINKS.stuart,
];

const linkStyle = 'inline-flex min-h-11 items-center text-sm text-muted underline-offset-4 hover:text-ink hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand';

export default function Footer({ showHeroPhotoCredit = false }: { showHeroPhotoCredit?: boolean }) {
  return (
    <footer className="w-full border-t border-line bg-panel text-ink">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid gap-x-8 gap-y-7 py-8 sm:grid-cols-2 sm:py-9 lg:grid-cols-[1.3fr_0.9fr_1.1fr] lg:gap-x-12">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" prefetch={false} aria-label="Herbal-Ai home" className={`${linkStyle} gap-2.5 text-ink`}>
              <BrandMark className="h-9 w-9 shrink-0 text-accent" />
              <span className="text-xl font-extrabold tracking-tight">Herbal-<span className="text-accent">Ai</span></span>
            </Link>
            <p className="mt-3.5 max-w-xs font-editorial text-2xl font-medium leading-snug">
              Preserving Philippine<br className="hidden sm:block" /> herbal knowledge.
            </p>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted">
              Explore plants, documented preparations, and the references behind them.
            </p>
          </div>

          <nav aria-label="Footer quick links" className="border-t border-line/60 pt-5 sm:border-t-0 sm:pt-0">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-[.14em] text-ink">Quick links</h2>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 sm:block sm:space-y-0.5">
              {quickLinks.map(({ label, href }) => (
                <li key={href}>
                  <Link href={href} prefetch={false} className={`${linkStyle} w-full`}>{label}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Plant reference websites" className="border-t border-line/60 pt-5 sm:border-t-0 sm:pt-0">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-[.14em] text-ink">Sources &amp; references</h2>
            <ul className="grid grid-cols-1 gap-2">
              {referenceLinks.map(({ label, detail, href }) => (
                <li key={href}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center justify-between gap-3 rounded-xl border border-line bg-soft/40 px-3.5 py-2.5 transition-all hover:bg-soft hover:border-line-strong focus-visible:outline-2 focus-visible:outline-brand"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink group-hover:text-accent transition-colors">{label}</span>
                      <span className="block text-xs text-muted leading-tight mt-0.5">{detail}</span>
                    </span>
                    <ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted group-hover:text-ink transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="border-t border-line py-4 sm:py-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <p className="text-xs leading-5 text-muted">© {new Date().getFullYear()} Herbal-Ai · Philippine Medicinal Plant Repository</p>
            <nav aria-label="Footer information" className="flex flex-wrap gap-x-6">
              <Link href="/sources" prefetch={false} className={linkStyle}>Sources &amp; methodology</Link>
              <Link href="/privacy" prefetch={false} className={linkStyle}>Privacy policy</Link>
            </nav>
          </div>
          <p className="mt-2.5 max-w-3xl text-xs leading-6 text-muted">
            Educational information only, not medical advice. References to DOH, PITAHC, and other sources do not imply institutional endorsement.
            {' '}See each plant&apos;s references for the statements they support.
          </p>
          {showHeroPhotoCredit && (
            <p className="mt-2.5 text-xs leading-6 text-muted">
              Mount Isarog photo by <a className={linkStyle} href="https://commons.wikimedia.org/wiki/File:A_mossy_path_at_Mount_Isarog_National_Park_-_Tigaon.jpg">Irvin Parco Sto. Tomas</a> · <a className={linkStyle} href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a> · resized
            </p>
          )}
        </div>
      </div>
    </footer>
  );
}
