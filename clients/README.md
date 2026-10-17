# Client sample pages

Served by the separate Vercel project `ntc-clients` (root directory: `clients/`),
not by the main site. Each client gets a folder and a subdomain:

- `clients/eddie/` -> eddie.newterraincreative.com

To add a client: create `clients/<name>/index.html`, add a host rewrite for
`<name>.newterraincreative.com` in `clients/vercel.json`, add the domain to the
`ntc-clients` Vercel project, and add a CNAME `<name>` -> `cname.vercel-dns.com`
at the DNS provider. Pages are noindexed: they are samples, not public listings.
