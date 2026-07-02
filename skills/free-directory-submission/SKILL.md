# AAT Free Directory Submission

Use this skill when a user wants to submit a product to aat.ee's free nofollow
directory channel. The user must have an aat.ee account and a Skill API key from
their dashboard.

## Inputs

- `AAT_SKILL_API_KEY`: bearer token from aat.ee dashboard.
- Product website URL.
- User confirmation that they own the domain and accept the aat.ee submission
  terms.

Default API base: `https://aat.ee`.

## Target Sites

Generate exactly one differentiated variant for each site id:

1. `mariadb-edu-rich`
2. `onarm-net`
3. `valkey-edu-rich`
4. `mifar`
5. `runentlinux-com`
6. `ubuntu-fan`
7. `eol-wiki`
8. `litehttpd-com`
9. `qoo-im`
10. `almalinux-com-cn`
11. `geo-fan`
12. `rank-fan`
13. `debian-club`
14. `portcyou-com`

Each variant must have a distinct title, tagline, opening angle, and body. Do
not produce find/replace clones; the server rejects near-identical bodies.

## Flow

1. Register the domain:

```bash
curl -sS -X POST "https://aat.ee/api/skill/domains" \
  -H "Authorization: Bearer $AAT_SKILL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"domain":"example.com","method":"html"}'
```

2. Place one verification proof from the returned `methods`:

- HTML: create `/.well-known/aat-verify-<token>.txt` containing only the token.
- DNS: create TXT `_aat-verify.example.com` with the token.
- Meta: add `<meta name="aat-verify" content="<token>">` inside the homepage
  `<head>`.

3. Confirm verification:

```bash
curl -sS -X POST "https://aat.ee/api/skill/domains/<domain-id>/verify" \
  -H "Authorization: Bearer $AAT_SKILL_API_KEY"
```

4. Crawl the user's own site, then write 14 variants. Keep claims factual and
   avoid prohibited content: spam, scams, adult, gambling, illegal content,
   malware, impersonation, and link farms.

5. Submit:

```json
{
  "domain": "example.com",
  "websiteUrl": "https://example.com",
  "tosAccepted": true,
  "variants": [
    {
      "site": "mariadb-edu-rich",
      "title": "Distinct title",
      "tagline": "Distinct one-line summary",
      "bodyMd": "Markdown body written for this site.",
      "lang": "en"
    }
  ]
}
```

```bash
curl -sS -X POST "https://aat.ee/api/skill/submit" \
  -H "Authorization: Bearer $AAT_SKILL_API_KEY" \
  -H "Content-Type: application/json" \
  --data @submission.json
```

6. Poll status:

```bash
curl -sS "https://aat.ee/api/skill/status/<uuid>"
```

The submit response includes `statusUrl`; the equivalent public noindex status
page is:

```text
https://aat.ee/s/<uuid>
```

## Constraints

- Submit only domains the user controls.
- `tosAccepted` must be `true`.
- Exactly 14 variants are required.
- The website host must match the verified domain.
- Free submissions are nofollow, slow, and globally queued. Users who need
  faster dofollow publication should use the paid directory option on aat.ee.
