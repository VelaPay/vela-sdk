export interface CreatePortalSessionParams {
  subscriberWallet: string;
  returnUrl: string;
  metadata?: Record<string, string>;
}

export interface PortalSession {
  id: string;
  subscriberWallet: string;
  returnUrl: string;
  portalUrl: string;
  expiresAt: string;
  metadata?: Record<string, string>;
}

export interface PortalSessionsNamespace {
  create(params: CreatePortalSessionParams): Promise<PortalSession>;
}

export function createPortalSessionsNamespace(
  request: <T>(path: string, init?: RequestInit) => Promise<T>,
): PortalSessionsNamespace {
  return {
    create(params) {
      return request<PortalSession>("/api/portal-sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      });
    },
  };
}
