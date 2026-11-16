/**
 * ログインの API を呼ぶ（U8・保護者の画面から）。Cookie は同じ出どころで送られる。
 */

export class AuthApiError extends Error {
  constructor(
    readonly code: string,
    /** 保護者に見せてよい文（サーバーが決めたもの） */
    readonly userMessage: string,
  ) {
    super(code);
    this.name = "AuthApiError";
  }
}

const OFFLINE = new AuthApiError(
  "offline",
  "インターネットにつながっていません。つながってから、もう一度ためしてください",
);

async function call<T>(
  method: string,
  action: string,
  body?: unknown,
  base = "/api/auth",
): Promise<T> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw OFFLINE;
  let res: Response;
  try {
    res = await fetch(`${base}/${action}`, {
      method,
      headers:
        body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    throw OFFLINE;
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new AuthApiError(
      json?.error?.code ?? "error",
      json?.error?.message ??
        "うまくいきませんでした。もう一度ためしてください",
    );
  return json as T;
}

export interface SignedIn {
  guardianId: string;
  email: string;
  deviceId: string;
}

export interface SessionInfo extends SignedIn {
  hasPasskey: boolean;
  recentAuth: boolean;
}

export interface Device {
  deviceId: string;
  deviceName: string;
  createdDay: string;
  lastSeenDay: string;
  current: boolean;
}

export const sendLoginLink = (email: string) =>
  call<{ devLink?: string }>("POST", "link", { email });
/** 削除の手続き中のアカウント（7日のうちは取り消せる） */
export interface PendingRestore {
  restore: { ticket: string; purgeDay: string };
}

export const verifyLoginLink = (token: string) =>
  call<SignedIn | PendingRestore>("POST", "verify", { token });
export const restoreAccount = (ticket: string) =>
  call<SignedIn>("POST", "restore", { token: ticket });
export const redeemLinkCode = (code: string) =>
  call<SignedIn>("POST", "redeem", { code });
export const currentSession = () => call<SessionInfo>("GET", "session");
export const signOut = () => call<object>("POST", "logout", {});
export const createLinkCode = () =>
  call<{ code: string; expiresAt: number }>("POST", "code", {});
export const listDevices = async () =>
  (await call<{ devices: Device[] }>("GET", "devices")).devices;
export const renameDevice = (deviceId: string, name: string) =>
  call<object>("PATCH", "devices", { deviceId, name });
export const revokeDevice = (deviceId: string) =>
  call<object>("DELETE", "devices", { deviceId });

/** この端末のブラウザがパスキーに対応しているか */
export const passkeySupported = () =>
  typeof window !== "undefined" && "PublicKeyCredential" in window;

/** パスキーを登録する（ブラウザの部品は、使うときだけ読み込む） */
export async function registerPasskey(): Promise<void> {
  const { startRegistration } = await import("@simplewebauthn/browser");
  const optionsJSON = await call<
    Parameters<typeof startRegistration>[0]["optionsJSON"]
  >("POST", "passkey-register-options", {});
  const response = await startRegistration({ optionsJSON });
  await call<object>("POST", "passkey-register", { response });
}

/** パスキーでログインする。reauth なら、いまのログインで確かめ直す（削除・書き出しの前） */
export async function loginWithPasskey(
  reauth = false,
): Promise<SignedIn | { recentAuth: true }> {
  const { startAuthentication } = await import("@simplewebauthn/browser");
  const { challengeId, options } = await call<{
    challengeId: string;
    options: Parameters<typeof startAuthentication>[0]["optionsJSON"];
  }>("POST", "passkey-login-options", {});
  const response = await startAuthentication({ optionsJSON: options });
  return call("POST", "passkey-login", { challengeId, response, reauth });
}

/* ---------- アカウント（U8 §5。削除と書き出しは、ログインし直してから） ---------- */

const account = <T>(method: string, action: string, body?: unknown) =>
  call<T>(method, action, body, "/api/account");

export interface DeletedChild {
  id: string;
  nickname: string;
  deletedDay: string;
  /** この日に本当に消える */
  purgeDay: string;
}

export const exportCloud = () => account<unknown>("GET", "export");
export const listDeletedChildren = async () =>
  (await account<{ children: DeletedChild[] }>("GET", "deleted-children"))
    .children;
export const deleteChildInCloud = (childId: string) =>
  account<object>("POST", "delete-child", { childId });
export const restoreChildInCloud = (childId: string) =>
  account<object>("POST", "restore-child", { childId });
export const deleteAccount = () => account<object>("POST", "delete", {});
