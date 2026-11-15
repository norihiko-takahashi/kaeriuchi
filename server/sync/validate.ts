import "server-only";
import { z } from "zod";
import { REPORT_REASONS } from "@/shared/battle";
import { ChildProfile, Guardian, SyncEntity } from "@/shared/schemas";
import { SYNC_ITEM_MAX_BYTES, type SyncChange } from "@/shared/sync";
import { addDays, DELETABLE } from "./merge";

/**
 * 送られた変更の形を確かめる（U8-SEC-5）。
 * - 種類ごとの形（Zod）。PIN のハッシュ・メールアドレスなど、同期しない項目は落とす
 * - 1件 64KB まで
 * - 保護者の ID は、ログインした保護者と同じでなければ受け付けない
 * - 日付は未来にしない（端末の時計のずれのため、明日までは受ける）
 * 子ども・テスト・ミスモンを指すものが、この保護者の記録かどうかは service.ts で確かめる
 */

const Id = z.string().min(1).max(64);
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Version = z.number().int().nonnegative();
const Subject = z.enum(["math", "japanese", "english", "science", "social"]);

const ChildPayload = ChildProfile.omit({ pinHash: true });
/** 保護者の設定。メールアドレス・PIN のハッシュ・端末でつないだ日時は送らない（U8-PRIV-1） */
const GuardianPayload = Guardian.omit({
  pinHash: true,
  email: true,
  accountLinkedAt: true,
});
const SheetPayload = z.object({
  id: Id,
  guardianId: Id,
  childId: Id,
  title: z.string().min(1).max(30),
  subject: Subject,
  createdDay: Day,
  version: Version,
});
const MistakePayload = z.looseObject({
  id: Id,
  guardianId: Id,
  childId: Id,
  sheetId: Id,
  subject: Subject,
  createdDay: Day,
  updatedDay: Day,
  lastBattleDay: Day.optional(),
  version: Version,
});
const BattlePayload = z.looseObject({
  id: Id,
  guardianId: Id,
  childId: Id,
  mistakeId: Id,
  mode: z.enum(["first", "revisit", "practice"]),
  problems: z.array(z.unknown()).max(10),
  state: z.looseObject({ phase: z.string() }),
  startedDay: Day,
  finishedDay: Day.optional(),
  version: Version,
});
/** 報告には、子どもの ID・ニックネームを入れない（U45-PRIV-2） */
const ReportPayload = z.looseObject({
  id: Id,
  reason: z.enum(REPORT_REASONS),
  freeText: z.string().max(100).optional(),
  createdDay: Day,
});
const RegradePayload = z.looseObject({
  id: Id,
  createdDay: Day,
});

const PAYLOADS: Record<SyncEntity, z.ZodType> = {
  child: ChildPayload,
  guardianSettings: GuardianPayload,
  sheet: SheetPayload,
  mistake: MistakePayload,
  battle: BattlePayload,
  report: ReportPayload,
  regrade: RegradePayload,
};

export const ChangeSchema = z.object({
  entity: SyncEntity,
  id: Id,
  op: z.enum(["upsert", "delete"]),
  payload: z.unknown().optional(),
});

export const SyncRequestSchema = z.object({
  since: z.number().int().nonnegative(),
  changes: z.array(z.unknown()).max(200),
});

/** 確かめたあとの変更 */
export interface CheckedChange {
  entity: SyncEntity;
  id: string;
  op: "upsert" | "delete";
  version: number;
  updatedAt?: string;
  payload?: Record<string, unknown>;
  /** 指している記録（この保護者のものか確かめる） */
  refs: { entity: SyncEntity; id: string }[];
  /** どの子どもの記録か（子どもを消したときに一緒に消す） */
  childId?: string;
}

export type CheckResult =
  | { ok: true; change: CheckedChange }
  | { ok: false; entity?: SyncEntity; id?: string; reason: string };

const DAY_KEYS = [
  "createdDay",
  "updatedDay",
  "lastBattleDay",
  "startedDay",
  "finishedDay",
] as const;

export function checkChange(
  raw: unknown,
  guardianId: string,
  today: string,
): CheckResult {
  const head = ChangeSchema.safeParse(raw);
  if (!head.success) return { ok: false, reason: "shape" };
  const { entity, id, op } = head.data;
  const fail = (reason: string): CheckResult => ({
    ok: false,
    entity,
    id,
    reason,
  });

  if (op === "delete") {
    if (!DELETABLE.has(entity)) return fail("not_deletable");
    return { ok: true, change: { entity, id, op, version: 0, refs: [] } };
  }

  if (JSON.stringify(head.data.payload ?? null).length > SYNC_ITEM_MAX_BYTES)
    return fail("too_large");
  const parsed = PAYLOADS[entity].safeParse(head.data.payload);
  if (!parsed.success) return fail("shape");
  const payload = parsed.data as Record<string, unknown>;
  if (payload.id !== id) return fail("shape");

  if (entity === "guardianSettings") {
    if (id !== guardianId) return fail("owner");
  } else if (entity !== "report" && entity !== "regrade") {
    if (payload.guardianId !== guardianId) return fail("owner");
  }

  const tomorrow = addDays(today, 1);
  for (const key of DAY_KEYS) {
    const v = payload[key];
    if (typeof v === "string" && v > tomorrow) return fail("future");
  }
  for (const key of ["createdAt", "updatedAt", "consentedAt"] as const) {
    const v = payload[key];
    if (typeof v === "string" && v.slice(0, 10) > tomorrow)
      return fail("future");
  }

  const refs: CheckedChange["refs"] = [];
  const childId =
    typeof payload.childId === "string" ? payload.childId : undefined;
  if (childId) refs.push({ entity: "child", id: childId });
  if (entity === "mistake")
    refs.push({ entity: "sheet", id: payload.sheetId as string });
  if (entity === "battle")
    refs.push({ entity: "mistake", id: payload.mistakeId as string });

  return {
    ok: true,
    change: {
      entity,
      id,
      op,
      version: typeof payload.version === "number" ? payload.version : 0,
      updatedAt:
        typeof payload.updatedAt === "string" ? payload.updatedAt : undefined,
      payload,
      refs,
      childId,
    },
  };
}

export type { SyncChange };
