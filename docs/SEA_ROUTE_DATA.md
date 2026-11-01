# Generated sea-route previews

The route editor generates an approximate map illustration from the existing origin and destination. Generation does not save content. Editors review the map, apply the proposed intermediate points, and save the route normally.

The server uses the locally bundled maritime graph and land polygons below. No paid routing API, runtime geocoding, or external request is needed. These files stay on the server; the browser receives only the proposed coordinates and approximate distance.

## Sources and attribution

- Routing engine: [`searoute-ts` 2.3.1](https://github.com/mayurrawte/searoute-ts), pinned in `package.json`; [MIT license](https://github.com/mayurrawte/searoute-ts/blob/main/LICENSE), copyright 2022–2026 Mayur Rawte. The optional `searoute-ts/marnet-20km` export supplies the maritime graph.
- Maritime graph provenance: [Eurostat sea route / `marnet_plus`](https://github.com/eurostat/searoute), distributed under the [European Union Public Licence 1.2](https://github.com/eurostat/searoute/blob/master/LICENSE). Preserve the upstream provenance and licence when redistributing its graph; the routing package's MIT licence does not replace the source-data attribution.
- Coarse land guard: [Natural Earth, Land, 1:10 million, version 5.1.2](https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/geojson/ne_10m_land.geojson). Natural Earth data is [public domain](https://www.naturalearthdata.com/about/terms-of-use/). The unmodified GeoJSON is stored at `src/server/data/ne-10m-land.geojson` (10,157,965 bytes; SHA-256 `1ac90796408bc6ad6911d69448485d3c4dbf2190370080368a09976e1c9f7416`). Here `10m` means **1:10 million map scale**, not ten-metre accuracy.

## Behavior and limitations

Input endpoints retain their exact coordinates. They connect to nearby maritime graph vertices, with a maximum 100 km distance to both the nearest graph line and the selected graph vertex. Every connector, network point, and network segment is checked against the land data, including coastline touches and polygon holes. Checks use Web Mercator geometry to match the straight polyline segments displayed by Leaflet.

Some original maritime graph edges cross the coarse land polygons. When a proposed route contains one, the server removes that original edge from its cached working graph and retries, up to four route calculations. It never adds invented graph edges or changes the packaged graph. The library's old graph cache is cleared after an exclusion. Exact endpoint connectors crossing land are rejected; they are not used to remove unrelated graph edges. Each resulting route is checked again.

Intermediate points are original network vertices, without simplification that could cut across islands. The existing limit of 100 total route points applies. Longer routes, missing connections, excessive endpoint snapping, and date-line crossings return a readable error so an editor can adjust the endpoints or enter points manually. There is no straight-line fallback. Arctic routes are disabled.

This is a **reviewed website illustration**, not a navigation chart or voyage plan. Generalized coastlines omit small islands, harbour detail, depth, tides, vessel clearance, traffic restrictions, and current conditions. A detected land crossing is rejected, but passing this coarse check does not prove that a vessel can sail the route. Ports and narrow canals may require manual points. Review the entire map before saving.

The land mask and current graph are cached per server process. `next.config.ts` traces the land file into the CMS generation endpoint and keeps `searoute-ts` as a server dependency. When updating the data or routing package, re-run the geographic regression tests and review representative regional maps.

## Verification

Run `node --conditions=react-server --import tsx --test tests/sea-route.test.ts`. The tests cover a Gulf of Thailand–Port Klang detour around the Malay peninsula, coastal routes, endpoint preservation, source-graph immutability, land and connector rejection, polygon holes and boundaries, projected geometry, invalid inputs, distance limits, unavailable routes, the date line, and the 100-point budget. Browser tests additionally exercise the CMS generation, preview, apply, cancel, loading, and permissions behavior.
