# SpaGym integration setup (GuestFlow)

GuestFlow now reads client records and writes check-ins/check-outs through SpaGym. SpaGym is the source of truth; GuestFlow no longer persists client profiles or visits in browser storage.

## Server configuration

Set these variables on the GuestFlow **server/runtime**, not as `VITE_*` frontend variables:

```env
SPAGYM_API_URL=https://your-spagym-domain.example
SPAGYM_API_KEY=<same-long-random-secret-configured-as-GUESTFLOW_API_KEY-in-SpaGym>
```

`SPAGYM_API_URL` is the SpaGym origin (no trailing slash and no `/api` suffix). `SPAGYM_API_KEY` must exactly match SpaGym's server-only `GUESTFLOW_API_KEY`. The Express server proxies only the required `/api/spagym/*` actions and keeps the shared secret out of browser bundles. Restart/redeploy after changing either value.

Configure SpaGym's Admin SDK credentials and API contract as described in [SpaGym's integration setup](https://github.com/alphacortexai/SpaGymCustomerSystem/blob/main/GUESTFLOW_API.md).

## App behavior

- Existing client lookup searches SpaGym using normalized phone numbers.
- New registrations are created in SpaGym; duplicate phones return the existing SpaGym client rather than creating another record.
- A client may have one active visit at a time. Repeat active check-ins are deduplicated; manual checkout or the existing 12-hour automatic checkout closes that visit, after which a same-day re-entry creates a new visit record. GuestFlow's front-desk activity is refreshed from SpaGym every 30 seconds.
- Check-outs from GuestFlow and from SpaGym's **Spa check-ins** section update the same Firestore visit document. Automatic timeout check-outs are also persisted in Firestore.
- If the SpaGym server or shared key is unavailable, the app displays a connection error and does not fall back to browser storage.

## Useful endpoints

GuestFlow exposes its same-origin server proxy under `/api/spagym/` for client lookup, registration, check-in, checkout and today's summary. The browser never receives the SpaGym service key.
