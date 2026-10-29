# Languages & SEO / AEO / GEO
Public pages use English (en) at unprefixed URLs, including `/`, and Thai
(th) under `/th`. Keep Thai then English in language selectors. The CMS at
`/cms` keeps its independent language preference and Thai default.

Remember explicit public language selections for one year in the
`moe-public-language` cookie. New visits to `/` default to English; a saved Thai choice temporarily
redirects the homepage entrance to `/th`. Explicit public deep links keep
their URL's language. Preserve the equivalent page, query string and section
anchor when switching languages. Legacy `/en` URLs permanently redirect to
their unprefixed English equivalents. Keep preference redirects private and
uncached, and preserve cached public page rendering.

Choose a localization approach that makes translations and future language
changes manageable. Keep display order independent of route identities
and the default language so presentation changes do not unexpectedly alter
existing URLs or language behavior.

For supported languages, localize content, UI, and metadata. Preserve the
equivalent page when switching languages where a translation exists, and
choose a clear fallback when it does not.

Plan SEO around public pages intended for indexing. Use semantic HTML and
appropriate page metadata, canonicals, hreflang, sitemaps, and structured
data where relevant to the content and routing. Keep structured data
consistent with visible content. Use the unprefixed English URL for
`x-default` alternates.

Write useful, factual content with clear headings and direct answers.
Avoid keyword stuffing, invented claims, and ranking promises.
