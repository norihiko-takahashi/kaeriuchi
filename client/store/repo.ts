import { CURRENT_CONSENT_VERSION } from "@/domain/consent";
import type { LockoutState } from "@/domain/parent/pin";
import { defaultRules } from "@/domain/parent/rules";
import {
  defaultDisplayMode,
  promoteGrade,
  schoolYearOf,
} from "@/domain/profile/grade";
import type { Battle, Mistake, Sheet } from "@/shared/battle";
import type {
  AvatarConfig,
  ChildProfile,
  DisplayMode,
  Grade,
  Guardian,
  OutboxItem,
  SyncEntity,
  UsageRules,
} from "@/shared/schemas";
import { getDB } from "./db";

const nowIso = () => new Date().toISOString();

function outboxItem(
  entity: SyncEntity,
  id: string,
  op: OutboxItem["op"],
  payload?: unknown,
): OutboxItem {
  const t = nowIso();
  return { entity, id, op, payload, clientUpdatedAt: t, createdAt: t };
}

/* ---------- 開発用のログイン（U8 でマジックリンク・パスキーに置き換える） ---------- */

export async function devSignIn(email: string): Promise<Guardian> {
  const db = getDB();
  const existing = await db.guardian.toCollection().first();
  if (existing) return existing;
  const guardian: Guardian = {
    id: crypto.randomUUID(),
    email,
    rules: {},
    updatedAt: nowIso(),
  };
  await db.guardian.put(guardian);
  return guardian;
}

export async function getGuardian(): Promise<Guardian | undefined> {
  return getDB().guardian.toCollection().first();
}

async function saveGuardian(guardian: Guardian): Promise<void> {
  const db = getDB();
  const next = { ...guardian, updatedAt: nowIso() };
  await db.transaction("rw", db.guardian, db.outbox, async () => {
    await db.guardian.put(next);
    // PIN のハッシュは端末の中だけに置く（同期しない）
    const { pinHash: _pinHash, ...syncable } = next;
    await db.outbox.add(
      outboxItem("guardianSettings", next.id, "upsert", syncable),
    );
  });
}

export async function recordConsent(): Promise<void> {
  const guardian = await requireGuardian();
  await saveGuardian({
    ...guardian,
    consentVersion: CURRENT_CONSENT_VERSION,
    consentedAt: nowIso(),
  });
}

export async function setGuardianPinHash(pinHash: string): Promise<void> {
  const guardian = await requireGuardian();
  await saveGuardian({ ...guardian, pinHash });
}

export async function dismissInstallPrompt(): Promise<void> {
  const guardian = await requireGuardian();
  await saveGuardian({ ...guardian, installPromptDismissedAt: nowIso() });
}

export async function requireGuardian(): Promise<Guardian> {
  const guardian = await getGuardian();
  if (!guardian) throw new Error("ログインしていません");
  return guardian;
}

/* ---------- 子どものプロフィール ---------- */

export const MAX_CHILDREN = 4;

export async function listChildren(): Promise<ChildProfile[]> {
  const guardian = await getGuardian();
  if (!guardian) return [];
  const rows = await getDB()
    .children.where("guardianId")
    .equals(guardian.id)
    .toArray();
  return rows
    .filter((c) => !c.deletedAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getChild(id: string): Promise<ChildProfile | undefined> {
  const child = await getDB().children.get(id);
  return child && !child.deletedAt ? child : undefined;
}

async function saveChild(child: ChildProfile): Promise<ChildProfile> {
  const db = getDB();
  const next = { ...child, updatedAt: nowIso(), version: child.version + 1 };
  await db.transaction("rw", db.children, db.outbox, async () => {
    await db.children.put(next);
    const { pinHash: _pinHash, ...syncable } = next;
    await db.outbox.add(outboxItem("child", next.id, "upsert", syncable));
  });
  return next;
}

export interface NewChild {
  nickname: string;
  grade: Grade;
  avatar: AvatarConfig;
}

export async function createChild(input: NewChild): Promise<ChildProfile> {
  const guardian = await requireGuardian();
  const children = await listChildren();
  if (children.length >= MAX_CHILDREN) {
    throw new Error(`プロフィールは${MAX_CHILDREN}人までです`);
  }
  const t = nowIso();
  const child: ChildProfile = {
    id: crypto.randomUUID(),
    guardianId: guardian.id,
    nickname: input.nickname,
    grade: input.grade,
    gradeSchoolYear: schoolYearOf(new Date()),
    displayMode: defaultDisplayMode(input.grade),
    displayModeOverridden: false,
    avatar: input.avatar,
    createdAt: t,
    updatedAt: t,
    version: 0,
  };
  const saved = await saveChild(child);
  await saveGuardian({
    ...guardian,
    rules: { ...guardian.rules, [saved.id]: defaultRules() },
  });
  return saved;
}

export async function updateChild(
  id: string,
  patch: Partial<
    Pick<ChildProfile, "nickname" | "grade" | "avatar" | "pinHash">
  > & {
    displayMode?: DisplayMode;
  },
): Promise<ChildProfile> {
  const child = await getChild(id);
  if (!child) throw new Error("プロフィールが見つかりません");
  const next: ChildProfile = { ...child, ...patch };
  if (patch.displayMode) next.displayModeOverridden = true;
  if (patch.grade && patch.grade !== child.grade) {
    next.gradeSchoolYear = schoolYearOf(new Date());
    if (!next.displayModeOverridden)
      next.displayMode = defaultDisplayMode(patch.grade);
  }
  return saveChild(next);
}

/** 年度が変わっていたら学年を進める（BR-1.5・1.6）。起動時に呼ぶ */
export async function applyGradePromotion(
  now = new Date(),
): Promise<ChildProfile[]> {
  const children = await listChildren();
  const updated: ChildProfile[] = [];
  for (const child of children) {
    const r = promoteGrade(child, now);
    if (r.gradeSchoolYear === child.gradeSchoolYear) continue;
    const next: ChildProfile = {
      ...child,
      grade: r.grade,
      gradeSchoolYear: r.gradeSchoolYear,
      displayMode: child.displayModeOverridden
        ? child.displayMode
        : defaultDisplayMode(r.grade),
    };
    updated.push(await saveChild(next));
  }
  return updated;
}

export async function deleteChild(id: string): Promise<void> {
  const db = getDB();
  const guardian = await requireGuardian();
  const { [id]: _removed, ...rules } = guardian.rules;
  await db.transaction(
    "rw",
    [db.children, db.mistakes, db.battles, db.sheets, db.outbox],
    async () => {
      // 端末の中からはすぐに消す（BR-4.3）。クラウドの削除は U8 で outbox から行う
      await db.children.delete(id);
      const mistakeIds = await db.mistakes
        .where("childId")
        .equals(id)
        .primaryKeys();
      const battleIds = await db.battles
        .where("childId")
        .equals(id)
        .primaryKeys();
      const sheetIds = await db.sheets
        .where("childId")
        .equals(id)
        .primaryKeys();
      await db.mistakes.bulkDelete(mistakeIds);
      await db.battles.bulkDelete(battleIds);
      await db.sheets.bulkDelete(sheetIds);
      // まだ送っていない、この子のミスモンとバトルの変更は、送らない
      await db.outbox
        .filter(
          (i) =>
            (i.entity === "mistake" && mistakeIds.includes(i.id)) ||
            (i.entity === "battle" && battleIds.includes(i.id)) ||
            (i.entity === "sheet" && sheetIds.includes(i.id)),
        )
        .delete();
      await db.outbox.add(outboxItem("child", id, "delete"));
    },
  );
  await saveGuardian({ ...guardian, rules });
}

/* ---------- 使い方のルール ---------- */

export async function getRules(childId: string): Promise<UsageRules> {
  const guardian = await requireGuardian();
  return guardian.rules[childId] ?? defaultRules();
}

export async function setRules(childId: string, rules: UsageRules) {
  const guardian = await requireGuardian();
  await saveGuardian({
    ...guardian,
    rules: { ...guardian.rules, [childId]: rules },
  });
}

/* ---------- PIN の待ち時間 ---------- */

const lockKey = (scope: string) => `pin-lock:${scope}`;

export async function getLockout(scope: string): Promise<LockoutState> {
  const row = await getDB().meta.get(lockKey(scope));
  return (row?.value as LockoutState | undefined) ?? { failures: 0 };
}

export async function setLockout(scope: string, state: LockoutState) {
  await getDB().meta.put({ key: lockKey(scope), value: state });
}

/* ---------- 書き出し・削除（BR-4） ---------- */

export interface ExportData {
  exportedAt: string;
  schemaVersion: number;
  guardian: Omit<Guardian, "pinHash">;
  children: Omit<ChildProfile, "pinHash">[];
  sheets: Sheet[];
  mistakes: Mistake[];
  battles: Battle[];
}

/** JSON で書き出す。画像と PIN のハッシュは含めない */
export async function exportData(childId?: string): Promise<ExportData> {
  const { pinHash: _p, ...guardian } = await requireGuardian();
  const children = (await listChildren())
    .filter((c) => !childId || c.id === childId)
    .map(({ pinHash: _c, ...c }) => c);
  const ids = new Set(children.map((c) => c.id));
  const db = getDB();
  const mistakes = (await db.mistakes.toArray()).filter((m) =>
    ids.has(m.childId),
  );
  const battles = (await db.battles.toArray()).filter((b) =>
    ids.has(b.childId),
  );
  const sheets = (await db.sheets.toArray()).filter((x) => ids.has(x.childId));
  return {
    exportedAt: nowIso(),
    schemaVersion: db.verno,
    guardian: childId
      ? { ...guardian, rules: { [childId]: guardian.rules[childId] } }
      : guardian,
    children,
    sheets,
    mistakes,
    battles,
  };
}

/** 端末の中のデータをすべて消す */
export async function deleteAllLocalData(): Promise<void> {
  const db = getDB();
  await db.transaction(
    "rw",
    [
      db.guardian,
      db.children,
      db.outbox,
      db.meta,
      db.mistakes,
      db.battles,
      db.regrades,
      db.sheets,
    ],
    async () => {
      await Promise.all([
        db.guardian.clear(),
        db.children.clear(),
        db.outbox.clear(),
        db.meta.clear(),
        db.mistakes.clear(),
        db.battles.clear(),
        db.regrades.clear(),
        db.sheets.clear(),
      ]);
    },
  );
}

export async function pendingOutbox(): Promise<OutboxItem[]> {
  return getDB().outbox.orderBy("seq").toArray();
}
