# Qobuz API access request

Prepared 18 October 2026. **Draft only; not sent.**

**Deferred by Nick on 18 October:** evaluate Roon first. Retain this draft; do not send or pursue credentials unless Nick resumes Qobuz work.

To: api@qobuz.com

Subject: API application access request - MusicMesh personal music research prototype

Hello Qobuz API team,

I am developing MusicMesh, a personal music exploration and research application under Studio13. It is currently a development prototype primarily for my own use, with a web interface at https://musicmesh.s13.nyc/.

MusicMesh connects my listening history with sourced music metadata to explore shared characteristics among recordings I enjoy: genres, musicians and instruments, producers, engineers, recording studios and, where documented, instrument makes/models. We retain source attribution and distinguish album credits from track-specific credits and different release editions.

I would like to request approved API application credentials and current integration documentation. The initial evaluation would cover ten albums, using read-only album and track metadata. Useful fields would include:

- Qobuz album/track identifiers, UPCs, ISRCs, editions, dates and tracklists;
- genre classifications and hierarchy;
- performer/composer credits, production and engineering roles, and recording information;
- links to digital booklets or other supplementary documentation, where available and permitted.

This initial integration would not request streaming or audio downloads. We would start with a small number of requests and follow your rate limits and attribution requirements.

Could you confirm the appropriate application-access process, any fees or eligibility requirements, and the permitted scope for caching metadata and creating attributed relationships in a private research database? We would also appreciate guidance on booklet access and retention.

The application uses the OpenAI API for user-directed research and answering questions. Please clarify whether relevant Qobuz metadata may be passed to that service for query-time analysis and displayed in sourced answers. We are not requesting permission to train models or redistribute your catalog.

Please let me know what further information you need about the application, account or intended use.

Thank you,
Nick Katsivelos
Studio13

---

## Preparation notes

Send from the email address associated with Nick's Qobuz account, or identify that account privately when requested. No account password or secret belongs in this document. Credential issuance and usage permission are not yet established.

Recipient verified on Qobuz's [official partnerships page](https://www.qobuz.com/ca-en/page/annonceurs-partenariats), which lists api@qobuz.com for integration inquiries. The published [API terms](https://static.qobuz.com/apps/api/QobuzAPI-TermsofUse.pdf) require Qobuz-issued application credentials; request current terms for this specific use rather than assuming that a third-party wrapper grants access.
