import { z } from "zod";
import { DISPLAY_MODES, GRADES } from "./constants";

export { DISPLAY_MODES, GRADES } from "./constants";
export const Grade = z.enum(GRADES);
export type Grade = z.infer<typeof Grade>;

export const DisplayMode = z.enum(DISPLAY_MODES);
export type DisplayMode = z.infer<typeof DisplayMode>;

export const AvatarConfig = z.object({
  face: z.number().int().min(0),
  color: z.number().int().min(0),
  accessory: z.number().int().min(0),
});
export type AvatarConfig = z.infer<typeof AvatarConfig>;

/** 同期するデータすべてに付ける項目 */
export const SyncMeta = z.object({
  guardianId: z.string(),
  updatedAt: z.string(),
  version: z.number().int().nonnegative(),
  deletedAt: z.string().optional(),
});

export const ChildProfile = SyncMeta.extend({
  id: z.string(),
  nickname: z.string(),
  grade: Grade,
  displayMode: DisplayMode,
  /** 保護者が表示モードを手で変えたか（BR-1.6） */
  displayModeOverridden: z.boolean(),
  /** 最後に学年を進めた年度（BR-1.5） */
  gradeSchoolYear: z.number().int(),
  avatar: AvatarConfig,
  pinHash: z.string().optional(),
  createdAt: z.string(),
});
export type ChildProfile = z.infer<typeof ChildProfile>;

export const UsageRules = z.object({
  /** 1日に登録できる間違いの数（BR-3.1） */
  dailyMistakeLimit: z.number().int().min(1).max(30),
  /** 使える時間帯。"HH:MM" の組。未設定なら制限なし（BR-3.2） */
  allowedHours: z.tuple([z.string(), z.string()]).optional(),
  notifications: z.boolean(),
});
export type UsageRules = z.infer<typeof UsageRules>;

export const Guardian = z.object({
  id: z.string(),
  email: z.string(),
  consentVersion: z.string().optional(),
  consentedAt: z.string().optional(),
  pinHash: z.string().optional(),
  /** 子どもごとの使い方のルール。キーは子どもの ID */
  rules: z.record(z.string(), UsageRules),
  /** ホーム画面への追加の案内を「あとで」にしたか */
  installPromptDismissedAt: z.string().optional(),
  updatedAt: z.string(),
});
export type Guardian = z.infer<typeof Guardian>;

export const SyncEntity = z.enum(["child", "guardianSettings"]);
export type SyncEntity = z.infer<typeof SyncEntity>;

/** 送信待ちの変更（U8 でクラウドに送る） */
export const OutboxItem = z.object({
  seq: z.number().int().optional(),
  entity: SyncEntity,
  id: z.string(),
  op: z.enum(["upsert", "delete"]),
  payload: z.unknown().optional(),
  clientUpdatedAt: z.string(),
  createdAt: z.string(),
});
export type OutboxItem = z.infer<typeof OutboxItem>;
