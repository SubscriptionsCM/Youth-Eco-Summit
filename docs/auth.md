# Authentication setup and API

Guardian phone access uses E.164 phone numbers, a five-minute six-digit SMS code, and a twelve-hour session. One contact account can authorize multiple participants through `participant_access`; the auth module never links students merely because their name or reference matches. OTP proves control of a phone, not consent or parental authority. Record approved consent separately.

Invited owners, admins, and judges use a password of 12–256 characters and TOTP MFA. Staff sessions expire after eight hours. Passwords use salted scrypt with N=32768, r=8, p=3, an [OWASP-listed configuration](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). OTPs use keyed HMAC, TOTP seeds use AES-256-GCM encryption, and random session/invitation/recovery tokens are stored only as SHA-256 hashes. Successful authenticator time steps are consumed atomically to prevent replay. Use the next authenticator code after invitation acceptance or recovery.

## Environment

| Variable | Purpose |
| --- | --- |
| `AUTH_SECRET` | Random secret of at least 32 characters, held in the deployment secret manager. Required for OTP hashing and TOTP encryption. Back it up securely; replacing it without migrating encrypted seeds requires MFA re-enrollment. |
| `APP_ORIGIN` | Exact public application origin, e.g. `https://summit.example.org`. Required for mutation origin checks and emailed links. |
| `AUTH_DELIVERY_ENABLED` | Set to `true` only after selecting, configuring, and testing providers. Disabled by default, including development. |
| `SMS_WEBHOOK_URL`, `SMS_WEBHOOK_TOKEN` | Server-controlled SMS adapter endpoint and bearer token. POST JSON `{to,code,expiresIn:300}`. |
| `EMAIL_WEBHOOK_URL`, `EMAIL_WEBHOOK_TOKEN` | Server-controlled email adapter endpoint and bearer token. POST JSON `{to,subject,body}`. |
| `AUTH_TRUSTED_IP_HEADER` | Optional client-IP header, only when the trusted deployment proxy overwrites incoming values. Without it, requests share a restrictive network quota. Never trust a client-provided forwarded header. |

Production delivery requires HTTPS, refuses redirects, and times out after ten seconds. No provider credentials, production messages, or bypass codes are included in the repository. Missing providers produce HTTP 503; tests inject controlled delivery adapters. Cookies are HttpOnly, SameSite=Lax, path `/`, and Secure in production. HTTPS is required in production.

## HTTP contract

All routes are under `/api/auth`. Success is `{data:...}`, errors `{error:string}`. Responses are `Cache-Control: no-store`. Every POST requires JSON and an `Origin` header equal to `APP_ORIGIN`. These endpoints never return plaintext OTPs, password hashes, session tokens in JSON, or delivery credentials. The invitation setup response intentionally contains the enrollment URI needed to register an authenticator and is restricted to a valid random invitation token.

| Route | Method and body | Success data |
| --- | --- | --- |
| `session` | GET | `{actor:null}` or `{actor:{id,role,contact}}` |
| `otp/request` | POST `{contact:"+919876543210"}` | `{sent:true,expiresIn:300,retryAfter:60}` |
| `otp/verify` | POST `{contact,code}` | `{actor}` and session cookie |
| `login` | POST `{contact:"email@example.org",password,totp}` | `{actor}` and session cookie |
| `logout` | POST `{}` | `{signedOut:true}`; revokes session and clears cookie |
| `invitations` | POST `{contact,name,role}`; owner, or admin inviting a judge | `{invited:true}`; emails `/invite?token=...` |
| `invitation/setup` | POST `{token}` | `{provisioningUri,contact}` |
| `invitation/accept` | POST `{token,password,totp}` | `{accepted:true,message}` |
| `recovery/request` | POST `{contact}` | Generic `{message}` regardless of account existence; active staff receive `/recover?token=...` |
| `recovery/complete` | POST `{token,password,totp}` | `{recovered:true,message}`; revokes every old session |

Invitation roles are `owner`, `admin`, or `judge`. Owners may invite every staff role; admins may invite judges only. Invitations expire after 24 hours; password recovery links expire after 15 minutes and still require the existing authenticator. Deactivated inviters, or inviters whose role no longer permits that invitation, cannot enroll new users. Invitations do not reactivate existing accounts. Lost MFA needs verified organizer support and a separately controlled account re-enrollment procedure; password recovery does not bypass MFA.

Public authentication actions use persistent contact and network rate limits. OTP send permits five requests per contact per fifteen minutes with a sixty-second resend interval. Verification permits at most five attempts per issued code, plus a twenty-request contact window. Staff login permits ten attempts per contact window. Network ceilings are eight times the relevant contact limit. Quotas count failed delivery and invalid credentials as well as success. Set and test the trusted proxy header before load testing a real deployment.

## Owner bootstrap and integration

After migration, set `DATABASE_URL`, `AUTH_SECRET`, `BOOTSTRAP_OWNER_CONTACT`, `BOOTSTRAP_OWNER_PASSWORD` and optional `BOOTSTRAP_OWNER_NAME` in a secure local shell; run `npx tsx scripts/bootstrap-owner.ts`. This calls `bootstrapOwner(db,{contact,name,password,secret})`, refuses to run when an owner exists, and displays the enrollment URI only to the local operator. Enroll the authenticator, clear the bootstrap password environment variable, and remove any terminal capture containing the URI. Never put it in application logs or source control. Later staff must be invited through the owner endpoint.

`getActor(request)` checks active account status, session expiry, revocation, account version, and staff MFA on every call. A database trigger increments `users.auth_version` whenever active status, role, password hash, or MFA seed changes; explicit version increments are preserved. Deactivation should additionally set `auth_sessions.revoked_at` for that user. This prevents reactivation from reviving earlier sessions. `assertSameOrigin(request)` is exported for the domain router. Do not treat UI visibility as authorization.

Authentication tables can be pruned on a scheduled maintenance task: expired rate counters, expired/consumed OTPs, expired sessions, and expired/consumed invitation and recovery tokens. Keep contact verification and audit records according to the organizer's approved retention policy; those are not disposable OTP records. Configure request-size limits, TLS, trusted proxy behavior, security monitoring, provider budgets, and tested database/secret backups before opening access.

TOTP enrollment and validation use the [OTPAuth library](https://github.com/hectorm/otpauth). Real SQL integration tests use PGlite, including failed attempts, replay, expiry, authorization, and revocation. Provider round trips remain staging checks after providers are configured.
