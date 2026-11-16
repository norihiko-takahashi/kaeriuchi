"use client";

import { useCallback, useEffect, useId, useState } from "react";
import {
  AuthApiError,
  createLinkCode,
  currentSession,
  type Device,
  listDevices,
  passkeySupported,
  registerPasskey,
  renameDevice,
  revokeDevice,
  type SessionInfo,
} from "@/client/auth/api";
import { ParentGuard } from "@/components/parent-guard";
import { Button, ErrorText, LinkButton, Page } from "@/components/ui";

/**
 * 保護者メニュー：ログインしている端末（U8、US-1.6・FR-1.6）。
 * 端末をつなぐ番号を出す・端末の一覧・名前の変更・ほかの端末のログアウト・パスキーの登録
 */

const md = (day: string) => {
  const [, m, d] = day.split("-").map(Number);
  return `${m}月${d}日`;
};

function message(e: unknown) {
  return e instanceof AuthApiError ? e.userMessage : "うまくいきませんでした";
}

function LinkCode() {
  const [code, setCode] = useState<{ code: string; expiresAt: number } | null>(
    null,
  );
  const [error, setError] = useState<string>();
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (!code) return;
    const tick = () =>
      setLeft(Math.max(0, Math.ceil((code.expiresAt - Date.now()) / 60_000)));
    tick();
    const t = setInterval(tick, 15_000);
    return () => clearInterval(t);
  }, [code]);

  return (
    <section className="card flex flex-col gap-3 p-4" aria-labelledby="code-h">
      <h2 id="code-h" className="font-bold">
        子ども用の端末をつなぐ
      </h2>
      <p className="text-sm">
        子ども用の端末のログインの画面で「子ども用の端末を、番号でつなぐ」を押し、ここに出る番号を入れてください。
      </p>
      {code && left > 0 ? (
        <div className="flex flex-col items-center gap-1">
          <output
            className="text-4xl font-bold tracking-widest tabular-nums"
            aria-label={`つなぐ番号 ${code.code.split("").join(" ")}`}
          >
            {code.code.slice(0, 4)} {code.code.slice(4)}
          </output>
          <p className="text-sm text-muted">
            あと約{left}分で使えなくなります（1回きり）
          </p>
        </div>
      ) : null}
      <ErrorText>{error}</ErrorText>
      <Button
        onClick={async () => {
          setError(undefined);
          try {
            setCode(await createLinkCode());
          } catch (e) {
            setError(message(e));
          }
        }}
      >
        {code ? "番号を出し直す" : "この端末に番号を出す"}
      </Button>
    </section>
  );
}

function DeviceRow({ d, onChange }: { d: Device; onChange: () => void }) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(d.deviceName);
  const [error, setError] = useState<string>();
  return (
    <li className="card flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-bold">
          {d.deviceName}
          {d.current ? (
            <span className="ml-2 text-sm font-normal text-muted">
              （この端末）
            </span>
          ) : null}
        </span>
        <span className="text-xs text-muted">
          {md(d.createdDay)}につないだ・最後に使った日 {md(d.lastSeenDay)}
        </span>
      </div>
      {editing ? (
        <div className="flex flex-wrap items-end gap-2">
          <label htmlFor={id} className="sr-only">
            端末の名前
          </label>
          <input
            id={id}
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            className="tap flex-1 rounded-[var(--radius)] border border-line bg-surface px-3"
          />
          <Button
            onClick={async () => {
              try {
                await renameDevice(d.deviceId, name);
                setEditing(false);
                onChange();
              } catch (e) {
                setError(message(e));
              }
            }}
          >
            保存
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            名前を変える
          </Button>
          {d.current ? null : (
            <Button
              variant="danger"
              onClick={async () => {
                try {
                  await revokeDevice(d.deviceId);
                  onChange();
                } catch (e) {
                  setError(message(e));
                }
              }}
            >
              この端末をログアウト
            </Button>
          )}
        </div>
      )}
      <ErrorText>{error}</ErrorText>
    </li>
  );
}

function Devices() {
  const [session, setSession] = useState<SessionInfo | null | undefined>(
    undefined,
  );
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState<string>();
  const [passkey, setPasskey] = useState(false);
  const [passkeyDone, setPasskeyDone] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await currentSession();
      setSession(s);
      setDevices(await listDevices());
    } catch (e) {
      if (e instanceof AuthApiError && e.code === "unauthorized")
        setSession(null);
      else setError(message(e));
    }
  }, []);

  useEffect(() => {
    setPasskey(passkeySupported());
    load();
  }, [load]);

  if (error && session === undefined) return <ErrorText>{error}</ErrorText>;
  if (session === undefined) return <p className="text-muted">読み込み中…</p>;
  if (session === null)
    return (
      <div className="card flex flex-col gap-3 p-4">
        <p>
          この端末は、まだクラウドのアカウントにログインしていません（または、ログインの期限が切れました）。
        </p>
        <LinkButton href="/login">ログインする</LinkButton>
      </div>
    );

  return (
    <>
      <p className="text-sm text-muted">
        ログインしているアカウント：{session.email}
      </p>
      <LinkCode />
      <section className="flex flex-col gap-2" aria-labelledby="dev-h">
        <h2 id="dev-h" className="font-bold">
          ログインしている端末（{devices.length}）
        </h2>
        <p className="text-sm text-muted">
          ほかの端末をログアウトさせても、その端末の中の記録は消えません（送っていない記録を失わないため）。
        </p>
        <ul className="flex flex-col gap-2">
          {devices.map((d) => (
            <DeviceRow key={d.deviceId} d={d} onChange={load} />
          ))}
        </ul>
      </section>
      {passkey ? (
        <section
          className="card flex flex-col gap-2 p-4"
          aria-labelledby="pk-h"
        >
          <h2 id="pk-h" className="font-bold">
            パスキー（指紋・顔でログイン）
          </h2>
          {session.hasPasskey || passkeyDone ? (
            <p className="text-sm">
              登録してあります。次からは、ログインの画面の「パスキーでログイン」で入れます。
            </p>
          ) : (
            <>
              <p className="text-sm">
                登録すると、メールを待たずに、指紋や顔の認証でログインできます（任意）。
              </p>
              <Button
                variant="secondary"
                onClick={async () => {
                  setError(undefined);
                  try {
                    await registerPasskey();
                    setPasskeyDone(true);
                  } catch (e) {
                    setError(
                      e instanceof AuthApiError
                        ? e.userMessage
                        : "パスキーを登録できませんでした",
                    );
                  }
                }}
              >
                パスキーを登録する
              </Button>
            </>
          )}
        </section>
      ) : null}
      <ErrorText>{error}</ErrorText>
    </>
  );
}

export default function DevicesPage() {
  return (
    <ParentGuard>
      {() => (
        <Page
          title="ログインしている端末"
          footer={
            <LinkButton href="/parent" variant="secondary">
              保護者メニューへ
            </LinkButton>
          }
        >
          <Devices />
        </Page>
      )}
    </ParentGuard>
  );
}
