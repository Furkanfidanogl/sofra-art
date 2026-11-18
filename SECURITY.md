# Security

Report suspected security issues privately to **fatihfidanogl@gmail.com**. Include the affected feature, reproduction steps and impact; omit credentials and personal data. Do not post exploit details in public issues before coordination.

Şüpheli güvenlik sorunlarını aynı adrese özel olarak bildir. Etkilenen özellik, tekrar adımları ve etkiyi ekle; kimlik bilgisi veya kişisel veri paylaşma.

## Controls

- Callables enforce App Check and the expected Firebase app identity. Protected operations independently verify ID tokens with revocation checks.
- Administration requires the designated verified email, a verified `google.com` sign-in provider claim and a server-issued `admin` claim. Missing or non-Google providers never grant admin authority on client or server.
- Direct Firestore and Storage access is denied, including for signed-in administrators. Only published, sanitized images have a public gateway.
- Uploads enforce file signatures, byte/pixel/dimension limits and WebP re-encoding. Visitor and AI text is escaped before HTML rendering.
- Comment export/deletion binds to the verified UID. Deletion requires recent Google reauthentication in the account flow and prevents late moderation from recreating removed comments.
- Model failures and disagreement during rejection verification remain pending for review. Every provider request, including rejection verification, reserves the shared hourly quota transactionally. Both assessments share one timeout. User limits, idempotency and model quotas bound abuse; they are not a billing cap.

## Credentials and publication

Keep local environment files, CLI sessions, service-account material, raw reports and archives outside Git. `VITE_*` values are shipped to browsers: never put Gemini, OAuth client secrets or administrator credentials there.

Firebase web configuration and the App Check site key are public identifiers. The model key belongs in server-side Secret Manager. CI uses isolated emulators and no production secrets; workflow actions are pinned to commit hashes with read-only repository permissions.

`npm run check` also checks the public file inventory. The separate secret-pattern check covers current text, build text and reachable history. Pattern checks complement manual review and do not prove that every possible secret or vulnerability is absent.

Run the quality workflow for every change. Deployment, IAM and provider settings require separate verification; source review alone does not attest their live state.
