# Production Xero activation — 4 November 2026

The user approved an independent Production Xero connection to WISDOM FACTORY SDN BHD for the four existing Projects only: Shopee Hub, Shopee Hub Internal, Tik Tok Hub and Lazada Hub. The integration remains read-only.

Account runtime was reviewed on fixed Staging and released through PR54. This documentation-only PR triggers a main deployment after the Production-only configuration was completed. It changes no application behavior or database schema.

Production app and callback were verified in the Xero developer portal. The user generated and saved the Client Secret and independent token-encryption key directly in Vercel. No credentials or sessions were copied from Staging. The organisation identity was previously verified in the official Xero organisation selector; this activation must still verify the fresh Production OAuth callback name and pinned organisation.

Deployment success is not a connected-account claim. Final user consent, successful callback, scoped initial sync and Production Billing Records verification remain separate completion gates. Uncertain invoice/client matches must remain unresolved rather than being guessed.
