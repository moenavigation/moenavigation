# Generated sea-route previews

The route editor generates an approximate map illustration from the existing origin and destination. Generation does not save content. Editors review the map, apply the proposed intermediate points, and save the route normally.

The server uses the locally bundled maritime graph and land polygons below. No paid routing API, runtime geocoding, or external request is needed. These files stay on the server; the browser receives the proposed coordinates, approximate distance, and whether the route touches mapped land.

## Sources and attribution

- Routing engine: [`searoute-ts` 2.3.1](https://github.com/mayurrawte/searoute-ts), pinned in `package.json`; [MIT license](https://github.com/mayurrawte/searoute-ts/blob/main/LICENSE), copyright 2022–2026 Mayur Rawte. The optional `searoute-ts/marnet-20km` export supplies the maritime graph.
- Maritime graph provenance: [Eurostat sea route / `marnet_plus`](https://github.com/eurostat/searoute), distributed under the [European Union Public Licence 1.2](https://github.com/eurostat/searoute/blob/master/LICENSE). Preserve the upstream provenance and licence when redistributing its graph; the routing package's MIT licence does not replace the source-data attribution.
- Coarse land guard: [Natural Earth, Land, 1:10 million, version 5.1.2](https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/geojson/ne_10m_land.geojson). Natural Earth data is [public domain](https://www.naturalearthdata.com/about/terms-of-use/). The unmodified GeoJSON is stored at `src/server/data/ne-10m-land.geojson` (10,157,965 bytes; SHA-256 `1ac90796408bc6ad6911d69448485d3c4dbf2190370080368a09976e1c9f7416`). Here `10m` means **1:10 million map scale**, not ten-metre accuracy.

## Behavior and limitations

Input endpoints retain their exact coordinates. Each connects to the nearest position on a maritime graph segment, up to 100 km away. The server inserts that connection point into the existing segment for this calculation, avoiding an unnecessarily distant stored vertex on a sparse edge. Projection and land checks use Web Mercator geometry to match the straight polyline segments displayed by Leaflet; connector distances are measured geographically. Segments spanning the date line are excluded from connection-point searches. Every connector, network point, and network segment is checked against the land data, including coastline touches and polygon holes.

Some original maritime graph edges cross the coarse land polygons. When a proposed route contains one, the server excludes that original edge for the current generation and retries, up to four route calculations. It never adds invented graph edges or changes the packaged graph. Exact endpoint connectors are checked but are not used to remove unrelated graph edges. Each resulting route is checked again.

A clear route is preferred. If the bounded attempts cannot avoid land, the best available network route remains usable in the preview with `touchesLand: true` and a persistent land-contact note. Candidates are ranked by the total length of segments touching land, then total distance; this is an approximation, not a measurement of distance traveled on land. Inland endpoints and connectors touching land can use this fallback within the same snapping and point limits. Applying still replaces only intermediate points, and saving remains explicit.

Intermediate points follow existing network segments and vertices, including the inserted endpoint connections, without simplification that could cut across islands. The existing limit of 100 total route points applies. Longer routes, missing connections, excessive endpoint snapping, and date-line crossings return a readable error so an editor can adjust the endpoints or enter points manually. There is no straight-line fallback. Arctic routes are disabled.

This is a **reviewed website illustration**, not a navigation chart or voyage plan. Generalized coastlines omit small islands, harbour detail, depth, tides, vessel clearance, traffic restrictions, and current conditions. Land contact is flagged for review; passing the coarse check does not prove that a vessel can sail the route. Ports and narrow canals may require manual points. Review the entire map before saving.

The land mask is cached per server process. Graph exclusions are local to each generation so earlier requests cannot remove a later request's fallback. Routing caches remain bounded. `next.config.ts` traces the land file into the CMS generation endpoint and keeps `searoute-ts` as a server dependency. When updating the data or routing package, re-run the geographic regression tests and review representative regional maps.

## Verification

Run `node --conditions=react-server --import tsx --test tests/sea-route.test.ts tests/sea-route-network.test.ts`. The tests cover a Gulf of Thailand–Port Klang detour around the Malay peninsula, coastal routes, endpoint preservation, source-graph immutability, land-contact fallbacks, polygon holes and boundaries, projected geometry, endpoint connections on sparse and shared segments, invalid inputs, distance limits, the date line, and the 100-point budget. The regression pair `0.878983,104.655717` → `2.515278,111.313529` must produce an applicable preview despite its destination being more than 100 km from a stored vertex. Browser tests additionally exercise the CMS generation, preview, apply, cancel, loading, and permissions behavior.
